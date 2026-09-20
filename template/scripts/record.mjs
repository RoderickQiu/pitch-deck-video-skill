// Drives the live app and records one continuous take.
//
// Reusability contract: this file knows nothing about the product. It executes
// the `do` list of every shot in shots.json and writes capture/marks.json —
// where each shot started, and where the camera should look. The Remotion
// timeline is derived from that file, so a frontend change only needs a
// re-record, never a hand edit to the edit.
//
// Every shot is held open for at least as long as its narration clip, so the
// footage is never rushed to catch up with the voice.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const cfg = JSON.parse(fs.readFileSync('shots.json', 'utf8'));
const vo = JSON.parse(fs.readFileSync('src/vo-durations.json', 'utf8'));
const durOf = (id) => (vo.shots.find((s) => s.id === id)?.dur ?? 3) * 1000;

const { url, width, height } = cfg.app;
// The capture is pinned to exactly width x height CSS pixels and the video is
// recorded at that same size. Both halves matter:
//
//   * a larger viewport gives the app a different (wider) breakpoint to lay out
//     into, so the video stops showing what a normal 1080p user sees;
//   * a video canvas larger than the viewport does NOT scale the page up —
//     Playwright composites the viewport into the corner and pads the rest,
//     which is where the grey borders come from.
//
// Nothing here depends on the machine's monitor; headless Chromium ignores it.
if (cfg.app.captureScale && cfg.app.captureScale !== 1) {
  console.log('! app.captureScale is ignored — the capture is pinned to app.width x app.height');
}
const OUT = path.resolve('capture/out');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const marks = [];
const cams = [];
const warnings = [];
let t0 = 0;
const now = () => Date.now() - t0;

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
// A Playwright storage state logs the recording in without a login flow on
// camera. Point app.storageState at one (many repos already save one for their
// own e2e tests) rather than typing credentials into the video.
const storageState = cfg.app.storageState ? path.resolve(cfg.app.storageState.replace(/^~/, process.env.HOME)) : undefined;
if (storageState && !fs.existsSync(storageState)) {
  console.log(`! storageState not found at ${storageState} — recording logged out`);
}

const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width, height } },
  reducedMotion: 'no-preference',
  ...(storageState && fs.existsSync(storageState) ? { storageState } : {}),
});

// Runs on every document, so it survives the full page loads that `goto` does.
await ctx.addInitScript(
  ({ swaps, hideSelectors }) => {
    // Dev-server chrome is not part of the product: Next's error/build
    // indicators, Vite's error overlay, and anything named in app.hideSelectors.
    const hide = () => {
      if (!document.head || document.getElementById('__hide')) return;
      const st = document.createElement('style');
      st.id = '__hide';
      st.textContent = `${hideSelectors.join(',')} { display: none !important; }`;
      document.head.appendChild(st);
    };

    const paint = () => {
      hide();
      // A synthetic cursor: Playwright moves a real mouse but never draws one.
      if (!document.getElementById('__cur') && document.body) {
        const cur = document.createElement('div');
        cur.id = '__cur';
        cur.style.cssText =
          'position:fixed;z-index:2147483646;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:999px;' +
          'background:rgba(255,255,255,0.92);box-shadow:0 0 0 2px rgba(0,0,0,0.35),0 6px 18px rgba(0,0,0,0.45);' +
          'pointer-events:none;left:-99px;top:-99px;transition:transform .12s ease';
        document.body.appendChild(cur);
        window.__cursorAt = (x, y) => {
          cur.style.left = x + 'px';
          cur.style.top = y + 'px';
        };
        window.__cursorPress = (on) => {
          cur.style.transform = on ? 'scale(0.62)' : 'scale(1)';
        };
      }
      // Capture-only copy swaps (placeholder product name, inconsistent user
      // names). Driven entirely by `textSwaps` in shots.json.
      if (swaps.length) {
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          for (const sw of swaps) {
            if (sw.exact) {
              if (n.nodeValue.trim() === sw.from) n.nodeValue = n.nodeValue.replace(sw.from, sw.to);
            } else if (n.nodeValue.includes(sw.from)) {
              n.nodeValue = n.nodeValue.split(sw.from).join(sw.to);
            }
          }
        }
      }
    };
    document.addEventListener('DOMContentLoaded', paint);
    setInterval(paint, 250);
  },
  {
    swaps: cfg.textSwaps ?? [],
    hideSelectors: [
      'nextjs-portal',
      '#__next-build-watcher',
      '[data-nextjs-toast]',
      '[data-nextjs-dialog-overlay]',
      'vite-error-overlay',
      '#vite-error-overlay',
      ...(cfg.app.hideSelectors ?? []),
    ],
  }
);

const page = await ctx.newPage();
const firstGoto = cfg.shots.find((s) => s.kind === 'app')?.do?.find((d) => d.goto)?.goto;
const first = (typeof firstGoto === 'string' ? firstGoto : firstGoto?.to) ?? '/';
// Load the first real route before the clock starts, and wait until the app has
// actually painted something. A cold dev server (Vite optimising deps, Next
// compiling a route) can sit blank for seconds, and that blankness would
// otherwise be the opening frames of the video.
await page.goto(url + first, { waitUntil: 'networkidle' });
await page
  .waitForFunction(() => (document.body?.innerText ?? '').trim().length > 40, null, { timeout: 30_000 })
  .catch(() => console.log('! the app never painted text — recording anyway'));
await page.waitForTimeout(600);

// A full-frame magenta flash gives the frame extractor an exact time zero to
// line the wall-clock marks up against. pointer-events:none so it blocks nothing.
await page.evaluate(() => {
  const s = document.createElement('div');
  s.id = '__slate';
  s.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#ff00cc;pointer-events:none;';
  document.body.appendChild(s);
});
await page.waitForTimeout(600);
t0 = Date.now();
await page.evaluate(() => document.getElementById('__slate')?.remove());

let mouse = { x: width * 0.5, y: height * 0.62 };

// Spinners and skeletons should never be on camera. These are the usual
// markers; override or extend with app.loadingSelectors in shots.json.
const LOADING = cfg.app.loadingSelectors ?? [
  '[aria-busy="true"]',
  '[role="progressbar"]',
  '[data-loading="true"]',
  '.animate-spin',
  '.animate-pulse',
  '.skeleton',
  '[class*="skeleton" i]',
];

// "Settled" means four things, every one of which shows up on camera if you
// skip it: no spinner or skeleton with a known marker; every image inside the
// viewport decoded; webfonts swapped in; and the DOM no longer changing.
//
// That last one carries most of the weight. Plenty of apps render loading
// placeholders as plain divs with no marker class at all, so there is nothing
// to match on — but the page still grows by hundreds of nodes the instant the
// real content arrives. Text length and node count are used rather than a hash
// so that a ticking audio clock does not count as "still changing".
const settle = async (timeout = 12000) => {
  const t0 = Date.now();
  let stable = 0;
  let last = '';

  // Let a transition actually start. Sampling immediately after a click reads
  // the *old* content as quiet and returns before the skeleton even appears.
  await page.waitForTimeout(280);

  while (Date.now() - t0 < timeout) {
    const state = await page
      .evaluate((sels) => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const busy = sels.some((sel) => [...document.querySelectorAll(sel)].some(visible));
        const imgs = [...document.querySelectorAll('img')].filter((img) => {
          const r = img.getBoundingClientRect();
          return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0;
        });
        const pending = imgs.filter((img) => !img.complete || img.naturalWidth === 0).length;
        return {
          busy,
          pending,
          fonts: document.fonts ? document.fonts.status === 'loaded' : true,
          shape: `${(document.body?.innerText ?? '').length}:${document.querySelectorAll('*').length}`,
        };
      }, LOADING)
      .catch(() => ({ busy: false, pending: 0, fonts: true, shape: last }));

    const quiet = !state.busy && state.pending === 0 && state.fonts && state.shape === last;
    last = state.shape;
    // Three consecutive quiet samples ≈ half a second of a genuinely still page.
    if (quiet && ++stable >= 3) {
      await page.waitForTimeout(120);
      return true;
    }
    if (!quiet) stable = 0;
    await page.waitForTimeout(160);
  }

  warnings.push(`settle: still changing after ${timeout}ms`);
  return false;
};

const soft = async (label, fn) => {
  try {
    return await fn();
  } catch (e) {
    warnings.push(`${label}: ${String(e).split('\n')[0]}`);
    console.log(`  ! skipped ${label}`);
    fs.mkdirSync(FAILDIR, { recursive: true });
    await page.screenshot({ path: path.join(FAILDIR, `${label.replace(/[^\w.-]/g, '_')}.png`) }).catch(() => {});
    return null;
  }
};

// Always the first *visible* match. Responsive apps routinely render a mobile
// and a desktop copy of the same control, and plain `.first()` picks whichever
// comes first in the DOM — often the hidden one, which then never becomes
// visible and times out with a selector that is plainly on screen.
const pick = (sel) => page.locator(sel).locator('visible=true').first();

const box = async (sel) => {
  const el = pick(sel);
  await el.waitFor({ state: 'visible', timeout: 10000 });
  await el.scrollIntoViewIfNeeded().catch(() => {});
  return await el.boundingBox();
};

const glide = async (x, y, ms = 420) => {
  const steps = Math.max(6, Math.round((ms / 1000) * 45));
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const p = i / steps;
    const e = 1 - Math.pow(1 - p, 3);
    const nx = from.x + (x - from.x) * e;
    const ny = from.y + (y - from.y) * e;
    await page.mouse.move(nx, ny);
    await page.evaluate(([a, b]) => window.__cursorAt?.(a, b), [nx, ny]).catch(() => {});
    await page.waitForTimeout(ms / steps);
  }
  mouse = { x, y };
};

const moveTo = async (sel) => {
  const b = await box(sel);
  if (!b) return null;
  await glide(b.x + b.width / 2, b.y + Math.min(b.height / 2, 26));
  return b;
};

const actions = {
  // Navigation, in order of preference:
  //   1. click the app's own link for the route — real router navigation, no
  //      white frame, works for every framework;
  //   2. history.pushState + popstate — works for routers that listen for it;
  //   3. a real page load — always correct, but Chromium paints a white frame
  //      between documents, so it is the last resort.
  //
  // Steps 1 and 2 are verified by watching for the page content to actually
  // change. Next's App Router, for one, updates the URL on pushState without
  // re-rendering, which would otherwise film the previous page under the next
  // shot's narration.
  // `{"goto": {"to": "/x", "hard": true}}` forces a real page load. Use it when
  // the app's own link opens something else — a modal or an overlay player —
  // instead of the standalone route you want on camera.
  goto: async (arg) => {
    const route = typeof arg === 'string' ? arg : arg.to;
    if (typeof arg === 'object' && arg.hard) {
      await page.goto(url + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      await settle();
      return;
    }
    // Hash the whole page text, not a prefix: headers, sidebars and banners are
    // identical across routes, so a prefix looks unchanged after a real
    // navigation and sends us down the slow path for nothing.
    const fingerprint = () =>
      page.evaluate(() => {
        const t = document.body?.innerText ?? '';
        let h = 0;
        for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
        return `${location.pathname}|${t.length}|${h}`;
      });
    const before = await fingerprint();
    const changed = async (timeout) =>
      page
        .waitForFunction(
          (b) => {
            const t = document.body?.innerText ?? '';
            let h = 0;
            for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
            return `${location.pathname}|${t.length}|${h}` !== b;
          },
          before,
          { timeout }
        )
        .then(() => true)
        .catch(() => false);

    const clicked = await page.evaluate((r) => {
      const a = [...document.querySelectorAll('a')].find((el) => el.getAttribute('href') === r);
      if (!a) return false;
      a.click();
      return true;
    }, route);
    if (clicked && (await changed(2500))) {
      await settle();
      return;
    }

    await page.evaluate((r) => {
      window.history.pushState({}, '', r);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    if (await changed(1800)) {
      await settle();
      return;
    }

    await page.goto(url + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await settle();
  },
  settle: (ms) => settle(ms ?? 12000),
  wait: (ms) => page.waitForTimeout(ms),
  waitFor: (sel) => pick(sel).waitFor({ state: 'visible', timeout: 15000 }),
  hover: (sel) => moveTo(sel),
  click: async (sel) => {
    await moveTo(sel);
    await page.evaluate(() => window.__cursorPress?.(true));
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
    await page.evaluate(() => window.__cursorPress?.(false));
    await page.waitForTimeout(160);
    await settle(6000);
  },
  // `env` reads the value from an environment variable instead of shots.json,
  // so passwords and other secrets never land in a file you might commit.
  type: async ({ sel, text, env, delay = 20, clear = true }) => {
    if (env) {
      text = process.env[env];
      if (!text) {
        warnings.push(`type: $${env} is not set`);
        return;
      }
    }
    await moveTo(sel);
    const el = pick(sel);
    await el.click();
    if (clear) await el.fill('');
    await el.type(text, { delay });
    await page.waitForTimeout(140);
  },
  // Window scroll, eased so the footage reads as a camera move rather than a jump.
  scroll: async ({ to, ms = 900 }) => {
    await page.evaluate(
      async ([target, dur]) => {
        const from = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const dest = Math.min(target === 'bottom' ? max : target, max);
        const t0 = performance.now();
        await new Promise((res) => {
          const step = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            const e = p < 0.5 ? 4 * p ** 3 : 1 - Math.pow(-2 * p + 2, 3) / 2;
            window.scrollTo(0, from + (dest - from) * e);
            p < 1 ? requestAnimationFrame(step) : res();
          };
          requestAnimationFrame(step);
        });
      },
      [to, ms]
    );
  },
  // Same easing, but inside whichever container actually scrolls (drawers, panels).
  scrollIn: async ({ sel, ms = 900 }) => {
    const el = pick(sel);
    await el.waitFor({ state: 'visible', timeout: 10000 });
    await el.evaluate(async (node, dur) => {
      let sc = node.parentElement;
      while (sc && sc !== document.body && sc.scrollHeight <= sc.clientHeight + 4) sc = sc.parentElement;
      const box = node.getBoundingClientRect();
      if (!sc || sc === document.body) {
        window.scrollBy({ top: box.top - 200, behavior: 'smooth' });
        return;
      }
      const from = sc.scrollTop;
      const dest = Math.min(from + box.top - sc.getBoundingClientRect().top - 60, sc.scrollHeight - sc.clientHeight);
      const t0 = performance.now();
      await new Promise((res) => {
        const step = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          const e = p < 0.5 ? 4 * p ** 3 : 1 - Math.pow(-2 * p + 2, 3) / 2;
          sc.scrollTop = from + (dest - from) * e;
          p < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
    }, ms);
  },
  // Records where the camera should look. The box is measured live, so a layout
  // change moves the shot automatically instead of breaking it.
  focus: async (arg) => {
    if (!arg) {
      cams.push({ t: now(), reset: true, ms: 900 });
      return;
    }
    const b = await box(arg.sel);
    if (!b) return;
    cams.push({ t: now(), x: b.x, y: b.y, w: b.width, h: b.height, pad: arg.pad ?? 200, max: arg.max ?? 1.8, ms: arg.ms ?? 900 });
  },
};

for (const shot of cfg.shots) {
  if (shot.kind !== 'app') continue;
  let started = now();
  const mark = { id: shot.id, t: started };
  marks.push(mark);
  console.log(`${shot.id} @ ${(started / 1000).toFixed(1)}s`);

  for (const step of shot.do ?? []) {
    const [name, arg] = Object.entries(step)[0];

    // `{"cut": true}` re-anchors the shot here: everything before it was setup
    // — navigating, waiting for data, dismissing a banner — and is dropped from
    // the footage instead of being stretched under the narration.
    if (name === 'cut') {
      started = now();
      mark.t = started;
      continue;
    }

    if (!actions[name]) {
      warnings.push(`${shot.id}: unknown action "${name}"`);
      continue;
    }
    await soft(`${shot.id}.${name}`, () => actions[name](arg));
  }

  // Hold the shot until its narration would have finished, plus a beat.
  const need = durOf(shot.id) + 320;
  const left = need - (now() - started);
  if (left > 0) await page.waitForTimeout(left);
}

marks.push({ id: '__end', t: now() });
await page.waitForTimeout(400);

const video = page.video();
await ctx.close();
await browser.close();
const src = await video.path();
fs.renameSync(src, path.join(OUT, 'take.webm'));

fs.writeFileSync(
  'capture/marks.json',
  // Element boxes are in CSS pixels, which is already the output coordinate space.
  JSON.stringify({ width, height, marks, cams, warnings }, null, 2)
);
console.log(`\ntake: ${(marks.at(-1).t / 1000).toFixed(1)}s, ${cams.length} camera moves`);
if (warnings.length) console.log(`warnings:\n  ${warnings.join('\n  ')}`);
