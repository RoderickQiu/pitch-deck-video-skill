// Fetches the background track named in shots.json and cuts a bed for the
// current edit: trimmed to the video length, faded, and levelled so the mix in
// src/Video.tsx only has to apply gain.
//
// Needs yt-dlp. `npm run all` does not call this — the bed only changes when
// the track or the video length changes, so run it by hand:
//   node scripts/music.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cfg = JSON.parse(fs.readFileSync('shots.json', 'utf8'));
const vo = JSON.parse(fs.readFileSync('src/vo-durations.json', 'utf8'));
const music = cfg.music;
if (!music?.url && !music?.file) {
  console.error('shots.json needs music.url (fetched with yt-dlp) or music.file (a local track)');
  process.exit(1);
}

// Same arithmetic as src/timeline.ts: lead + every scene + tail, plus slack.
const LEAD = 0.7, TAIL = 1.7;
const need = LEAD + vo.shots.reduce((n, s) => n + s.dur + cfg.gapMs / 1000, 0) + TAIL + 4;

const DIR = path.resolve('public/music');
fs.mkdirSync(DIR, { recursive: true });
// A local file is simplest and has no licence ambiguity; a URL is fetched once
// and cached.
const local = music.file ? path.resolve(music.file.replace(/^~/, process.env.HOME)) : null;
if (local && !fs.existsSync(local)) {
  console.error(`music.file not found: ${local}`);
  process.exit(1);
}
const src = local ?? path.join(DIR, 'source.webm');

const ytdlp = ['.tools/bin/yt-dlp', 'yt-dlp'].find((p) => { try { execFileSync(p, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } });

if (!local && !fs.existsSync(src)) {
  if (!ytdlp) { console.error('yt-dlp not found — install it, or drop the track at public/music/source.webm'); process.exit(1); }
  console.log('downloading the track…');
  execFileSync(ytdlp, ['-f', 'bestaudio', '--no-playlist', '-o', path.join(DIR, 'source.%(ext)s'), music.url], { stdio: 'inherit' });
}
fs.writeFileSync(path.join(DIR, 'SOURCE.txt'), `${music.credit ?? ''}\n${music.url ?? local}\n`);

const fadeIn = music.fadeIn ?? 2;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(music.start ?? 0), '-t', String(need.toFixed(2)), '-i', src,
  '-af', [
    `afade=t=in:st=0:d=${fadeIn}`,
    `afade=t=out:st=${(need - 3).toFixed(2)}:d=3`,
    'loudnorm=I=-18:TP=-2:LRA=11',
  ].join(','),
  '-ar', '48000', '-ac', '2', path.join(DIR, 'bed.wav')], { stdio: 'inherit' });

console.log(`bed: ${need.toFixed(1)}s from ${music.credit ?? path.basename(src)}`);
