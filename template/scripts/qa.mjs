// Renders one still per shot, at a point where that shot has settled, and
// stacks them into contact sheets you can read in one go.
//
//   node scripts/qa.mjs           one still per shot
//   node scripts/qa.mjs 4         four evenly spaced stills per shot
//
// Reviewing a demo video by scrubbing it is slow and you will miss things.
// Reviewing a contact sheet takes seconds and catches the failures that matter:
// a spinner under a caption, a shot on the wrong page, text too small to read.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FPS = 30;
const LEAD = 0.7;
const perShot = Math.max(1, Number(process.argv[2] ?? 1));

const cfg = JSON.parse(fs.readFileSync('shots.json', 'utf8'));
const vo = JSON.parse(fs.readFileSync('src/vo-durations.json', 'utf8'));
const gap = cfg.gapMs / 1000;

const OUT = path.resolve('out/qa');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const picks = [];
let t = LEAD;
for (const s of vo.shots) {
  const dur = s.dur + gap;
  for (let i = 0; i < perShot; i++) {
    // Offset into the shot: one still lands just past the opening, several
    // spread across it. Never frame 0 — that is the crossfade.
    const p = perShot === 1 ? 0.45 : 0.18 + (0.66 * i) / (perShot - 1);
    picks.push({ id: s.id, frame: Math.round((t + dur * p) * FPS) });
  }
  t += dur;
}

console.log(`rendering ${picks.length} stills…`);
for (const p of picks) {
  const file = path.join(OUT, `${String(p.frame).padStart(5, '0')}_${p.id}.png`);
  execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'Demo', file, `--frame=${p.frame}`, '--log=error'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  p.file = file;
}

// Six per sheet: any more and the frames are too small to judge.
const PER = 6;
const sheets = [];
for (let i = 0; i < picks.length; i += PER) {
  const group = picks.slice(i, i + PER);
  const sheet = path.join(OUT, `sheet_${String(sheets.length + 1).padStart(2, '0')}.png`);
  const cols = Math.min(3, group.length);
  const layout = group
    .map((_, n) => {
      const c = n % cols;
      const r = Math.floor(n / cols);
      const x = c === 0 ? '0' : Array.from({ length: c }, (_, k) => `w${k}`).join('+');
      const y = r === 0 ? '0' : `h${(r - 1) * cols}`;
      return `${x}_${y}`;
    })
    .join('|');
  execFileSync('ffmpeg', [
    '-y', '-v', 'error',
    ...group.flatMap((g) => ['-i', g.file]),
    '-filter_complex',
    `${group.map((_, n) => `[${n}]`).join('')}xstack=inputs=${group.length}:layout=${layout},scale=1900:-1`,
    sheet,
  ]);
  sheets.push(sheet);
}

console.log(`\n${sheets.length} contact sheet(s):`);
for (const s of sheets) console.log(`  ${s}`);
console.log('\nRead them as images. Check, in order:');
console.log('  1. capture/marks.json -> warnings is empty, and capture/failures/ is empty');
console.log('  2. every shot is on the page you think it is');
console.log('  3. no spinners, skeletons or empty states');
console.log('  4. every claim in the narration matches what is on screen');
console.log('  5. captions legible, small text legible or zoomed');
