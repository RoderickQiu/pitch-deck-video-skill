# shots.json reference

The one file a human edits. Everything else is generated from it.

## Top level

| key | what it does |
| --- | --- |
| `brand` | Name on the closing card, and available to `textSwaps`. |
| `tagline` | The sentence left on screen at the end. |
| `theme` | `colors` and `fonts` for the cards and captions. Pull from the app's own tokens. |
| `tts` | Voice provider and settings. See below. |
| `music` | Background track and mix levels. Optional — delete the block to go without. |
| `gapMs` | Silence added after every line. 200–300 reads well. |
| `app` | `url`, `width`, `height`, `bg`, `captureScale`, `storageState`, `loadingSelectors`. See below. |
| `textSwaps` | Capture-only copy patches. See below. |
| `cards` | Per-card config: `hook.accent`, `arch.title`, `arch.nodes`, `close.credits`. |
| `shots` | The video, in order. |

## A shot

```json
{ "id": "plan", "kind": "app", "say": "…", "do": [ … ] }
```

- `id` — unique; also the narration filename (`public/vo/<id>.wav`).
- `kind` — `"app"` (footage) or `"card"` (full-screen graphic).
- `say` — one beat of narration. Its measured length *is* the scene length.
- `do` — only for `kind: "app"`.

A `card` shot needs a component registered under the same id in `CARDS` in
`src/Video.tsx`. The template ships `hook`, `arch` and `close`.

## Actions

| action | example | notes |
| --- | --- | --- |
| `goto` | `{"goto": "/plan"}` | Clicks the app's own link if there is one, else `pushState`, else a real load. See below. |
| `goto` (hard) | `{"goto": {"to": "/x", "hard": true}}` | Forces a real page load. |
| `settle` | `{"settle": 15000}` | Waits out spinners, skeletons and DOM churn. |
| `cut` | `{"cut": true}` | Re-anchors the shot here; everything before it is setup and is not filmed. |
| `wait` | `{"wait": 800}` | Milliseconds. |
| `waitFor` | `{"waitFor": "text=Result"}` | Wait for an element, 6 s cap. |
| `click` | `{"click": "button:has-text(\"Start\")"}` | Glides the cursor in, presses, releases. |
| `hover` | `{"hover": "text=Career fair"}` | Moves the cursor without clicking. |
| `type` | `{"type": {"sel": "textarea", "text": "…", "delay": 9, "clear": true}}` | `delay` is ms per keystroke. |
| `type` (secret) | `{"type": {"sel": "input[type=password]", "env": "DEMO_PASSWORD"}}` | Reads the value from the environment so it never lands in a file. |
| `scroll` | `{"scroll": {"to": 620, "ms": 1100}}` | Window scroll, eased. `"to": "bottom"` works. |
| `scrollIn` | `{"scrollIn": {"sel": "text=Questions", "ms": 900}}` | Scrolls inside the nearest scrollable ancestor — drawers, panels. |
| `focus` | `{"focus": {"sel": "…", "pad": 300, "max": 1.7, "ms": 900}}` | Records a camera move. `{"focus": null}` pulls back out. |

### focus

The most useful action. It measures the element's box **at record time** and the
timeline zooms the footage to fit it plus `pad`, capped at `max`. Because the box
is measured rather than hardcoded, a layout change moves the shot instead of
breaking it.

Use it whenever text would be too small to read at 1080p — side panels, drawers,
dense lists. Always `{"focus": null}` before navigating away.

Zoom is limited by the taller dimension, so a tall narrow panel will not zoom
much. If it is still illegible, `scrollIn` to the part that matters.

### Selector notes

- `text=Foo` is a case-insensitive substring match, so it matches copy rendered
  uppercase by CSS `text-transform`. Write the selector however you like.
- `has-text()` matches the whole subtree, so `button:has-text("Room")` can hit a
  large ancestor. Scope it: `[role="dialog"] button:has-text("Room")`.
- A failing selector is logged to `capture/marks.json → warnings` and skipped.
  **Read that list after every run.**

### goto, and why it is three strategies

In order: click the app's own `<a href="...">` for the route (real router
navigation, no white frame); else `history.pushState` + `popstate`; else a real
page load. Each of the first two is only accepted if the **page content actually
changes** — a hash of the whole body text, not a prefix, because headers and
sidebars are identical across routes.

That check is not paranoia. Next's App Router updates the URL on `pushState`
**without re-rendering**, so a naive implementation films the previous page under
the next shot's narration and never errors.

`hard: true` when the app's own link opens something other than the route — a
modal or an overlay player rather than the standalone page you want on camera.

### cut

Everything a shot does happens **inside its capture window**, so navigating,
waiting for data and dismissing a banner all get stretched under the narration.
`{"cut": true}` re-anchors the shot at that point: the setup still runs, it just
is not filmed.

```json
"do": [
  { "click": "a[href*=\"/episodes/\"]" },
  { "settle": 20000 },
  { "wait": 900 },
  { "cut": true },
  { "focus": { "sel": "text=Transcript", "pad": 500, "max": 1.4 } }
]
```

Use it in any shot that begins with a load. It is the difference between a beat
that opens on a spinner and one that opens on the product.

### settle

Spinners and skeletons should never be on camera. After every navigation and
click the recorder waits until nothing matching `app.loadingSelectors` is
visible. The default list is `[aria-busy="true"]`, `[role="progressbar"]`,
`[data-loading="true"]`, `.animate-spin`, `.animate-pulse`, `.skeleton`.

Narrow it per app if you get `settle: still loading` warnings — apps use
`animate-pulse` decoratively, and an audio scrubber is often a permanent
`role="progressbar"`. `{"settle": 20000}` as an explicit step for a slow route.

**A page that renders its skeleton with the same labels as its loaded state will
pass `waitFor` too early.** Wait on something that only exists once the data is
in — a computed number, not a heading.

## app

```json
{ "url": "http://localhost:5190", "width": 1920, "height": 1080, "bg": "#F6F1EB",
  "hideSelectors": [".debug-panel"],
  "storageState": "/path/to/.auth/user.json",
  "loadingSelectors": ["[aria-busy=\"true\"]", ".animate-spin"] }
```

- **`width` / `height`** pin the capture exactly. The video is recorded at the
  same size, and the CSS viewport is never enlarged — a bigger viewport hands
  the app a different breakpoint, and a bigger video canvas does not scale the
  page up, it just pads it with grey. Nothing depends on the monitor you are
  sitting at; headless Chromium ignores it. There is no supported way to capture
  above the output resolution, so keep `focus` zooms at or below about 1.5 —
  beyond that you are upscaling 1080p.
- **`hideSelectors`** hides anything that is dev-only rather than product. Next's
  error and build indicators and Vite's error overlay are hidden by default.
- **`storageState`** is a Playwright storage state, so the recording starts
  logged in and no login flow is on camera. Many repos already save one for
  their own e2e tests — look for `.auth/*.json` before building a login shot.
- **`devCommand`** overrides how the app is started when nothing is serving
  `app.url`. `{port}` is substituted. Without it the app's own `dev` script is
  read and the right port flag inferred (Next, Vite, Remix, Nuxt, Astro,
  SvelteKit, CRA), with `PORT` exported for everything else.
- **`locale`** (default `en-US`) and **`colorScheme`** (default `light`) are
  pinned so the machine you record on cannot change what the video shows. Set
  `colorScheme: "dark"` for an app that follows the system preference.
- **`timezone`** is *not* pinned by default: forcing UTC can shift every date in
  the app by a day. Set it only when you need byte-identical reruns.

## textSwaps

Patches copy in the captured browser only — the app on disk is untouched.

```json
[ { "from": "[Product name]", "to": "Acme" },
  { "from": "Test User", "to": "Alex" },
  { "from": "T", "to": "A", "exact": true } ]
```

For placeholder names a prototype still ships, or a user who is called different
things on different pages. `exact` matches only text nodes whose trimmed value is
exactly `from` — use it for single letters like avatar initials, where a
substring swap would hit everything.

Leave a swap in as a safety net even after the app is fixed; it costs nothing and
catches a regression.

## tts

```json
{ "provider": "minimax", "voice": "Ukrainian_WiseScholar", "model": "speech-2.8-hd",
  "speed": 1.0, "languageBoost": "English", "envFile": "~/some/.env.local",
  "fallback": { "voice": "Samantha", "rate": 178 } }
```

`provider: "say"` skips the API entirely. Voice ids come from MiniMax's system
voice list; the language tag on a voice is a hint, not a restriction — a
Ukrainian-tagged voice reads English fine with `languageBoost: "English"`.

Clips cache on a hash of the voice settings plus the text, so editing one
sentence re-synthesises one clip.

## music

```json
{ "url": "https://…", "credit": "Title — Artist", "start": 0, "fadeIn": 2.0,
  "gain": { "open": 0.34, "under": 0.14, "close": 0.30 } }
```

Use `"file": "~/Music/bed.wav"` instead of `url` for a local track — simplest,
and no licence ambiguity. `url` is fetched once with yt-dlp and cached.

`open` under the cold open, `under` beneath the narration, `close` for the last
cards. `scripts/music.mjs` cuts the bed to the current video length; it is not
part of `npm run all` because the bed only changes when the track or the length
does.
