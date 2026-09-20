// Turns the take into a numbered JPEG sequence, aligned to the recorder's clock.
//
// Playwright's webm has no reliable start timestamp, so the recorder flashes a
// magenta slate and drops it at t=0. We find the last magenta frame here and
// extract from there, which makes capture/marks.json (wall-clock milliseconds)
// directly addressable as frame numbers.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FPS = 30;
const SRC = 'capture/out/take.webm';
const DIR = path.resolve('public/frames');

// Sample the take down to one pixel per frame and read it as raw RGB.
const raw = execSync(
  `ffmpeg -v error -i ${SRC} -vf "crop=200:200:0:0,scale=1:1,fps=${FPS}" -f rawvideo -pix_fmt rgb24 -`,
  { maxBuffer: 1 << 28, encoding: 'buffer' }
);
let last = -1;
for (let i = 0; i + 2 < raw.length; i += 3) {
  const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
  if (r > 170 && g < 90 && b > 140) last = i / 3;
}
if (last < 0) throw new Error('slate not found in take — is the recorder still flashing it?');
const t0 = (last + 1) / FPS;
console.log(`slate ends at ${t0.toFixed(3)}s`);

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t0), '-i', SRC,
  '-vf', `fps=${FPS}`, '-q:v', '4', path.join(DIR, '%05d.jpg')]);

const count = fs.readdirSync(DIR).filter((f) => f.endsWith('.jpg')).length;
fs.writeFileSync('src/frames.json', JSON.stringify({ count, fps: FPS }, null, 2));
console.log(`${count} frames (${(count / FPS).toFixed(1)}s)`);
