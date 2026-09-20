// One command: narration -> recording -> frames -> render.
//
//   node scripts/build.mjs            full rebuild (starts the app if needed)
//   node scripts/build.mjs --no-record reuse the last take (script-only changes)
//   node scripts/build.mjs --render    render only
//
// TTS is cached per line, so a frontend-only change re-uses every clip and the
// cost is the recording plus the render.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';

const cfg = JSON.parse(fs.readFileSync('shots.json', 'utf8'));
const args = process.argv.slice(2);
const only = (f) => args.includes(f);
const t0 = Date.now();
const lap = (label, from) => console.log(`\n── ${label} ${((Date.now() - from) / 1000).toFixed(1)}s\n`);

const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const portOf = (url) => Number(new URL(url).port || 80);
const isUp = (port) =>
  new Promise((res) => {
    const s = net.connect(port, 'localhost');
    s.on('connect', () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
  });

const port = portOf(cfg.app.url);
let devServer = null;
if (!(await isUp(port))) {
  const dir = process.env.APP_DIR;
  if (!dir) {
    console.error(`Nothing is serving ${cfg.app.url}.\nStart the app there, or set APP_DIR=/path/to/the/ui repo and re-run.`);
    process.exit(1);
  }
  console.log(`starting the app from ${dir} on :${port}`);
  devServer = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  for (let i = 0; i < 160 && !(await isUp(port)); i++) await new Promise((r) => setTimeout(r, 250));
  if (!(await isUp(port))) { console.error('the app did not come up'); process.exit(1); }
}

try {
  if (!only('--render')) {
    let s = Date.now();
    run('node', ['scripts/tts.mjs']);
    lap('narration', s);

    if (!only('--no-record')) {
      s = Date.now();
      run('node', ['scripts/record.mjs']);
      lap('recording', s);

      s = Date.now();
      run('node', ['scripts/frames.mjs']);
      lap('frames', s);
    }
  }

  const s = Date.now();
  run('npx', ['remotion', 'render', 'src/index.ts', 'Demo', 'out/demo.mp4',
    '--concurrency=8', '--jpeg-quality=92', '--crf=19', '--log=error']);
  lap('render', s);
} finally {
  if (devServer) process.kill(-devServer.pid);
}

// Master the audio to roughly what YouTube and Devpost normalise to, so the
// video is not noticeably quieter than everything around it. Video is copied.
run('ffmpeg', ['-y', '-v', 'error', '-i', 'out/demo.mp4', '-c:v', 'copy',
  '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', 'out/.mastered.mp4']);
fs.renameSync('out/.mastered.mp4', 'out/demo.mp4');

// A smaller copy for upload limits that cap at 50–100 MB.
run('ffmpeg', ['-y', '-v', 'error', '-i', 'out/demo.mp4', '-vcodec', 'libx264', '-crf', '26',
  '-preset', 'veryfast', '-acodec', 'aac', '-b:a', '128k', 'out/demo-small.mp4']);

console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s -> out/demo.mp4`);
