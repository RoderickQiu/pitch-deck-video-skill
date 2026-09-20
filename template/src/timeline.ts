// The entire edit, derived — nothing here is hand-tuned.
//
//   shots.json          what is said, and what the browser does while it is said
//   vo-durations.json   how long each line actually takes (measured, not guessed)
//   marks.json          when each shot started in the take, and where to look
//   frames.json         how many frames came out of the take
//
// Scene lengths come from the measured audio; the footage is stretched to fit
// it; the camera moves come from element boxes measured during the recording.
// So a frontend change needs a re-record and nothing else.
import shots from '../shots.json';
import vo from './vo-durations.json';
import marksFile from '../capture/marks.json';
import framesFile from './frames.json';

export const FPS = 30;
export const W = 1920;
export const H = 1080;

const LEAD = 0.7;   // beat of black before the first word
const TAIL = 1.7;   // beat after the last word
const GAP = vo.gapMs / 1000;

export const FRAME_COUNT = framesFile.count;
export const BRAND = shots.brand;
export const TAGLINE = shots.tagline;
// Optional: delete the music block in shots.json to render without a bed.
export type Music = { gain: { open: number; under: number; close: number } };
export const MUSIC: Music | undefined = (shots as any).music;
export const CARDS_CONFIG: any = shots.cards ?? {};
// Darkens the frame edges. Reads well on a dark app, heavy on a light one —
// set theme.vignette to 0 to turn it off.
export const VIGNETTE: number = (shots.theme as any).vignette ?? 0.3;

export type Scene = { id: string; kind: string; say: string; start: number; dur: number };

// The generated JSON files start out empty, which TypeScript would otherwise
// infer as never[]. These casts describe what the scripts actually write.
type VoShot = { id: string; kind: string; say: string; dur: number };
type Mark = { id: string; t: number };
type RawCam = { t: number; ms: number; reset?: boolean; x?: number; y?: number; w?: number; h?: number; pad?: number; max?: number };
const VO_SHOTS = vo.shots as VoShot[];
const RAW_MARKS = marksFile.marks as Mark[];
const RAW_CAMS = marksFile.cams as RawCam[];

export const SCENES: Scene[] = (() => {
  let t = LEAD;
  return VO_SHOTS.map((s) => {
    const dur = s.dur + GAP;
    const scene = { id: s.id, kind: s.kind, say: s.say, start: t, dur };
    t += dur;
    return scene;
  });
})();

const byId = (id: string) => SCENES.find((s) => s.id === id)!;
export const at = (id: string, offset = 0) => byId(id).start + offset;
export const endOf = (id: string) => byId(id).start + byId(id).dur;

export const TOTAL = SCENES.length ? SCENES.at(-1)!.start + SCENES.at(-1)!.dur + TAIL : LEAD + TAIL;
export const TOTAL_FRAMES = Math.round(TOTAL * FPS);

// --- footage retiming ------------------------------------------------------
// One segment per app shot: the slice of the take it recorded, mapped onto the
// slice of the video its narration occupies. The recorder holds every shot open
// for at least the length of its line, so these rates sit at or below 1x.
type Seg = { from: number; to: number; cFrom: number; cTo: number };

const appMarks = RAW_MARKS.filter((m) => m.id !== '__end');
const endMark = (RAW_MARKS.find((m) => m.id === '__end')?.t ?? 0) / 1000;

export const SEGMENTS: Seg[] = appMarks
  // A shot can be recorded and then deleted from shots.json; ignore stale marks.
  .filter((m) => SCENES.some((s) => s.id === m.id))
  .map((m, i, arr) => {
    const scene = byId(m.id);
    const cFrom = m.t / 1000;
    const cTo = i + 1 < arr.length ? arr[i + 1].t / 1000 : endMark;
    return { from: scene.start, to: scene.start + scene.dur, cFrom, cTo };
  });

// Before the first recording (or for an all-cards video) there is no footage.
const HAS_FOOTAGE = SEGMENTS.length > 0;

export const APP_START = HAS_FOOTAGE ? SEGMENTS[0].from : Infinity;
export const APP_END = HAS_FOOTAGE ? SEGMENTS.at(-1)!.to : -Infinity;

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Video time -> time in the captured take. */
export const captureAt = (t: number): number => {
  if (!HAS_FOOTAGE) return 0;
  if (t <= SEGMENTS[0].from) return SEGMENTS[0].cFrom;
  const last = SEGMENTS.at(-1)!;
  if (t >= last.to) return last.cTo;
  for (const s of SEGMENTS) {
    if (t >= s.from && t < s.to) return lerp(s.cFrom, s.cTo, (t - s.from) / (s.to - s.from));
  }
  return last.cTo;
};

/** Take time -> video time. Used to place the recorded camera moves. */
const videoAt = (c: number): number => {
  if (!HAS_FOOTAGE) return 0;
  for (const s of SEGMENTS) {
    if (c >= s.cFrom && c < s.cTo) return lerp(s.from, s.to, (c - s.cFrom) / (s.cTo - s.cFrom));
  }
  return c <= SEGMENTS[0].cFrom ? SEGMENTS[0].from : SEGMENTS.at(-1)!.to;
};

// --- camera ----------------------------------------------------------------
// Each recorded box becomes a keyframe. Scale is whatever fits the box plus its
// padding, capped so a small element never blows up past legibility.
export type Cam = { t: number; ms: number; cx: number; cy: number; s: number };

export const CAMS: Cam[] = RAW_CAMS.map((c) => {
  if (c.reset) return { t: videoAt(c.t / 1000), ms: c.ms / 1000, cx: W / 2, cy: H / 2, s: 1 };
  const { x = 0, y = 0, w = W, h = H, pad = 0, max = 1 } = c;
  const s = clamp(Math.min(W / (w + pad * 2), H / (h + pad * 2)), 1, max);
  return { t: videoAt(c.t / 1000), ms: c.ms / 1000, cx: x + w / 2, cy: y + h / 2, s };
});

const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - Math.pow(-2 * p + 2, 3) / 2);

export const camAt = (t: number): { cx: number; cy: number; s: number } => {
  let prev = { cx: W / 2, cy: H / 2, s: 1 };
  for (const c of CAMS) {
    if (t < c.t) return prev;
    if (t < c.t + c.ms) {
      const p = easeInOut((t - c.t) / c.ms);
      return { cx: lerp(prev.cx, c.cx, p), cy: lerp(prev.cy, c.cy, p), s: lerp(prev.s, c.s, p) };
    }
    prev = { cx: c.cx, cy: c.cy, s: c.s };
  }
  return prev;
};

// --- captions --------------------------------------------------------------
// Split on clause punctuation first, so a cue never ends on a dangling
// preposition or article; only then halve anything still too long. `say` has no
// word timings, so each cue gets a share of the line proportional to its length.
const MAX_WORDS = 11;
const STOP = new Set(['a','an','and','as','at','but','by','for','from','in','into','is','it','of','on','or','so','than','that','the','to','with','you','your','and,']);

const splitClauses = (text: string): string[] => {
  const out: string[] = [];
  for (const raw of text.split(/(?<=[,.;:—])\s+/)) {
    const words = raw.trim().split(/\s+/);
    if (!words[0]) continue;
    if (words.length <= MAX_WORDS) { out.push(words.join(' ')); continue; }
    // Too long: cut near the middle, preferring a break after a content word.
    const mid = Math.round(words.length / 2);
    let cut = mid;
    for (let d = 0; d <= 3; d++) {
      if (!STOP.has(words[mid + d])) { cut = mid + d; break; }
      if (!STOP.has(words[mid - d])) { cut = mid - d; break; }
    }
    out.push(words.slice(0, cut).join(' '), words.slice(cut).join(' '));
  }
  // Fold a short orphan back into its neighbour when there is room for it.
  const folded: string[] = [];
  for (const c of out) {
    const prev = folded.at(-1);
    const isLabel = prev?.endsWith(':');
    if (prev && !isLabel && c.split(' ').length <= 2 && prev.split(' ').length + c.split(' ').length <= MAX_WORDS) {
      folded[folded.length - 1] = `${prev} ${c}`;
    } else folded.push(c);
  }
  return folded;
};

export type Caption = { text: string; from: number; to: number };

export const CAPTIONS: Caption[] = SCENES.filter((s) => s.id !== 'close').flatMap((scene) => {
  const parts = splitClauses(scene.say);
  const chars = parts.reduce((n, p) => n + p.length, 0);
  const span = scene.dur - GAP;
  let t = scene.start;
  return parts.map((text) => {
    const d = (text.length / chars) * span;
    const cue = { text, from: t, to: t + d };
    t += d;
    return cue;
  });
});
