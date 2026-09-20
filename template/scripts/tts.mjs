// Audio first. Render one narration clip per shot, measure it, and write the
// measured durations. Everything downstream (the recorder's dwell times, the
// scene lengths, the captions) is derived from these numbers, so changing a
// line in shots.json is the only edit a script change needs.
//
// Clips are cached by a hash of the voice settings and the text, so re-running
// after a frontend change costs nothing and only edited lines are re-rendered.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const cfg = JSON.parse(fs.readFileSync('shots.json', 'utf8'));
const tts = cfg.tts ?? { provider: 'say', fallback: { voice: 'Samantha', rate: 178 } };
const VO = path.resolve('public/vo');
fs.mkdirSync(VO, { recursive: true });

// --- credentials -----------------------------------------------------------
// Read straight out of the other project's env file rather than copying the
// key in here. Override the path with MINIMAX_ENV_FILE, or just export
// MINIMAX_API_KEY / MINIMAX_GROUP_ID and the file is not needed at all.
const readEnvFile = (file) => {
  if (!file || !fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
};

const fileEnv = readEnvFile(process.env.MINIMAX_ENV_FILE ?? tts.envFile);
const creds = {
  // The subscription key is preferred where it exists; same endpoint either way.
  key: process.env.MINIMAX_API_KEY || fileEnv.MINIMAX_SUBSCRIPTION_API_KEY || fileEnv.MINIMAX_API_KEY,
  group: process.env.MINIMAX_GROUP_ID || fileEnv.MINIMAX_GROUP_ID,
};

// --- providers -------------------------------------------------------------
const sayTo = async (text, mp3) => {
  const v = tts.fallback ?? { voice: 'Samantha', rate: 178 };
  const aiff = mp3.replace(/\.\w+$/, '.aiff');
  execFileSync('say', ['-v', v.voice, '-r', String(v.rate), '-o', aiff, text]);
  fs.renameSync(aiff, mp3);
};

const minimaxTo = async (text, mp3) => {
  if (!creds.key || !creds.group) throw new Error('no MiniMax credentials');
  const res = await fetch(`https://api.minimaxi.com/v1/t2a_v2?GroupId=${creds.group}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: tts.model ?? 'speech-2.8-hd',
      text,
      stream: false,
      language_boost: tts.languageBoost ?? 'English',
      voice_setting: { voice_id: tts.voice, speed: tts.speed ?? 1, vol: 1, pitch: 0, text_normalization: true },
      audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`MiniMax HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  if (body.base_resp?.status_code) throw new Error(`MiniMax ${body.base_resp.status_code}: ${body.base_resp.status_msg}`);
  if (!body.data?.audio) throw new Error('MiniMax returned no audio');
  fs.writeFileSync(mp3, Buffer.from(body.data.audio, 'hex'));
};

const probe = (f) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString().trim());

const cachePath = path.join(VO, '.cache.json');
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};

let provider = tts.provider ?? 'say';
if (provider === 'minimax' && (!creds.key || !creds.group)) {
  console.log('! no MiniMax credentials found — falling back to macOS say');
  provider = 'say';
}

const out = [];
let total = 0;
let built = 0;

for (const s of cfg.shots) {
  const wav = path.join(VO, `${s.id}.wav`);
  const key = crypto
    .createHash('sha1')
    .update(`${provider}|${tts.voice}|${tts.model}|${tts.speed}|${JSON.stringify(tts.fallback)}|${s.say}`)
    .digest('hex');

  if (cache[s.id]?.key !== key || !fs.existsSync(wav)) {
    const raw = path.join(VO, `${s.id}.raw`);
    try {
      await (provider === 'minimax' ? minimaxTo(s.say, raw) : sayTo(s.say, raw));
    } catch (e) {
      if (provider !== 'minimax') throw e;
      console.log(`  ! ${s.id}: ${String(e).split('\n')[0]} — using say for this line`);
      await sayTo(s.say, raw);
    }
    // Trim the silence the synthesiser leaves at either end, then level every
    // clip identically so no beat sits quieter than its neighbours.
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw,
      '-af', 'silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_silence=0.12:start_threshold=-50dB,areverse,loudnorm=I=-18:TP=-2:LRA=11',
      '-ar', '48000', '-ac', '1', wav]);
    fs.unlinkSync(raw);
    cache[s.id] = { key, dur: Number(probe(wav).toFixed(3)) };
    built += 1;
  }

  const d = cache[s.id].dur;
  total += d + cfg.gapMs / 1000;
  out.push({ id: s.id, kind: s.kind, say: s.say, dur: d });
  console.log(`${s.id.padEnd(11)} ${d.toFixed(2)}s`);
}

fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
fs.writeFileSync('src/vo-durations.json', JSON.stringify({ gapMs: cfg.gapMs, shots: out }, null, 2));
console.log(`\nvoice: ${provider}${provider === 'minimax' ? ` · ${tts.voice} · ${tts.model}` : ''}`);
console.log(`${built} clip(s) synthesised, ${out.length - built} cached`);
console.log(`narration total (with gaps): ${total.toFixed(1)}s`);
