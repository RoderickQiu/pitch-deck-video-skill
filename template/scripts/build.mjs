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
import path from 'node:path';

const cfg = JSON.parse(fs.readFileSync('shots.json', 'utf8'));
const args = process.argv.slice(2);
const only = (f) => args.includes(f);
const t0 = Date.now();
const lap = (label, from) => console.log(`\n── ${label} ${((Date.now() - from) / 1000).toFixed(1)}s\n`);

const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const KNOWN_ACTIONS = new Set([
  'goto', 'wait', 'waitFor', 'click', 'hover', 'type', 'scroll', 'scrollIn', 'focus', 'settle', 'cut',
]);

const portOf = (url) => Number(new URL(url).port || 80);
const isUp = (port) =>
  new Promise((res) => {
    const s = net.connect(port, 'localhost');
    s.on('connect', () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
  });

// How to start the app. `app.devCommand` wins; otherwise read the app's own
// `dev` script and work out how it takes a port, because every framework
// spells that differently. Never assume Vite.
const devCommandFor = (dir) => {
  if (cfg.app.devCommand) return cfg.app.devCommand.replace(/\{port\}/g, String(port));

  let dev = '';
  try {
    dev = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts?.dev ?? '';
  } catch {
    /* no package.json — fall through to the generic form */
  }

  if (/\bnext\b/.test(dev)) return `npm run dev -- --port ${port}`;
  if (/\bvite\b/.test(dev)) return `npm run dev -- --port ${port} --strictPort`;
  if (/\b(react-scripts|remix|nuxt|astro|svelte-kit|vue-cli-service)\b/.test(dev)) return `npm run dev -- --port ${port}`;
  if (dev) return `npm run dev`; // most others honour PORT from the environment
  return `npx vite --port ${port} --strictPort`;
};

const port = portOf(cfg.app.url);
let devServer = null;
if (!(await isUp(port))) {
  const dir = process.env.APP_DIR;
  if (!dir) {
    console.error(
      `Nothing is serving ${cfg.app.url}.\n` +
        `Start the app there, or set APP_DIR=/path/to/the/app and re-run.\n` +
        `If its dev server needs a specific command, set app.devCommand in shots.json.`
    );
    process.exit(1);
  }

  const cmd = devCommandFor(dir);
  console.log(`starting the app from ${dir}:  ${cmd}`);
  devServer = spawn(cmd, {
    cwd: dir,
    shell: true,
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
    env: { ...process.env, PORT: String(port), BROWSER: 'none' },
  });

  // Next and friends can take a while on a cold start; 160 * 250ms = 40s.
  for (let i = 0; i < 160 && !(await isUp(port)); i++) await new Promise((r) => setTimeout(r, 250));
  if (!(await isUp(port))) {
    console.error(`the app did not come up on :${port}. Try running \`${cmd}\` in ${dir} yourself.`);
    process.exit(1);
  }
}

// Cheap checks that would otherwise surface as a confusing video two minutes
// from now rather than as an error two seconds from now.
const problems = [];
const ids = new Set();
for (const [i, shot] of (cfg.shots ?? []).entries()) {
  const where = `shots[${i}]${shot?.id ? ` (${shot.id})` : ''}`;
  if (!shot?.id) problems.push(`${where}: missing id`);
  else if (ids.has(shot.id)) problems.push(`${where}: duplicate id`);
  else ids.add(shot.id);
  if (!shot?.say?.trim()) problems.push(`${where}: missing say`);
  if (!['app', 'card'].includes(shot?.kind)) problems.push(`${where}: kind must be "app" or "card"`);
  if (shot?.kind === 'card' && shot.do) problems.push(`${where}: card shots cannot have a do list`);
  for (const step of shot?.do ?? []) {
    const name = Object.keys(step ?? {})[0];
    if (!KNOWN_ACTIONS.has(name)) problems.push(`${where}: unknown action "${name}"`);
  }
}
if (!cfg.shots?.length) problems.push('shots is empty');
if (problems.length) {
  console.error(`shots.json has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
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
