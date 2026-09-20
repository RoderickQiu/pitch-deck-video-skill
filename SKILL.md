---
name: pitch-deck-video-skill
description: "Use when the user wants a demo video, launch video, product walkthrough, hackathon submission video, or screen recording of a local web app — especially if they say the video must be re-doable after the UI changes. Generates a narrated 1–2 minute product demo by driving the real app with Playwright and cutting the edit from measured narration, so a rebuild after a frontend change takes ~2 minutes and one command."
---

# /pitch-deck-video-skill

Generate a narrated product demo video from a running local web app. The edit is
**derived, never hand-timed**, so when the frontend changes you re-record and the
cut follows — no frame numbers to repair.

Built for the case that actually happens: the UI is still moving while you need
the video.

## Usage

```
/pitch-deck-video-skill                          # film the app in the current directory
/pitch-deck-video-skill <path-to-app>            # film a specific app
/pitch-deck-video-skill --rebuild                # re-record and re-cut an existing video project
/pitch-deck-video-skill --script                 # narration changed only; reuse the last take
/pitch-deck-video-skill --render                 # cards/captions changed only; re-render
```

## The shape of it

Four generated files drive everything. Only the first is written by a human.

| file | holds | written by |
| --- | --- | --- |
| `shots.json` | what is said, the voice, the music, the theme, and what the browser does | **you** |
| `src/vo-durations.json` | how long each line actually takes | `scripts/tts.mjs` |
| `capture/marks.json` | when each shot started in the take, and where to look | `scripts/record.mjs` |
| `src/frames.json` | how many frames came out of the take | `scripts/frames.mjs` |

`src/timeline.ts` derives the entire edit from those. Scene lengths come from the
**measured** narration audio. The footage is stretched to fit it. Camera moves
come from element bounding boxes **measured live during the recording**, so a
moved button moves the shot instead of breaking it.

## Workflow

### 1 · Scaffold

Copy `template/` from this skill into `<app-name>-video/` next to the app, then
`npm install`. The template ships seed JSON so it typechecks and renders before
the first recording.

Never edit files under `~/.claude/skills/pitch-deck-video-skill/template/` for one project —
that is the shared template. Edit the copy.

### 2 · Check for a saved login first

If the app has auth, look for a Playwright storage state the repo already keeps
for its own e2e tests (`.auth/*.json`, `storageState`, `playwright/.auth/`).
Point `app.storageState` at it and the recording starts logged in with no login
flow on camera. Only build a login shot if there is no such file — and then use
`{"type": {"sel": "…", "env": "DEMO_PASSWORD"}}` so the password is never
written into `shots.json`.

### 3 · Learn the app before writing a word

Start the app's dev server and **screenshot every route at 1920×1080, then read
the images**. Do not write narration from the source code. You are writing about
what a judge will see, and only the screenshots tell you that.

```js
// one-off script; Playwright comes with the template
for (const r of routes) {
  await p.goto(base + r, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `/tmp/shots/${r}.png` });
  console.log(r, await p.evaluate(() => document.documentElement.scrollHeight));
}
```

Note the scroll heights: anything past 1080 needs a `scroll` action or it never
appears on camera.

### 4 · Write `shots.json`

Start from `template/shots.example.json`. See `references/shots-reference.md`
for every field and action.

Pull the `theme.colors` from the app's own design tokens so the cards and the
footage read as one piece. Fill `cards.arch.nodes` with the real architecture —
which boxes are model calls and which are deterministic code. That beat is what
separates a demo from a wrapper, and judges look for it.

Narration rules that matter:

- **12–16 beats, 1:30–1:50 total.** Under a 2:00 cap, leave 10 seconds of room.
- **One idea per beat.** The beat ends when the idea does.
- **Say the number.** "Six people scored, Priya wins" beats "it picks someone."
- **Never narrate the UI.** Not "here we click Approve" — say what it means.
- **Open on the problem in the user's words**, before the product name exists.
- **Close on one sentence** you want left on screen.

### 5 · Build

```sh
APP_DIR=/path/to/app npm run all
```

Narration → recording → frames → render. It starts the dev server if nothing is
serving `app.url`. Typical full rebuild: **~2 minutes**.

### 6 · QA by looking at it — this is not optional

Render stills across the cut, stack them into contact sheets, and **read them as
images**:

```sh
for F in 120 400 700 1000 1400 1800; do
  npx remotion still src/index.ts Demo out/qa/f$F.png --frame=$F --log=error
done
ffmpeg -i out/qa/f120.png -i out/qa/f400.png ... -filter_complex \
  "[0][1][2][3][4][5]xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0,scale=1800:-1" \
  out/qa/sheet.png
```

Check: **`capture/marks.json → warnings` is empty** (a missing selector is a
warning, not a crash — you still get a video, and a list of what broke). Then:
does each caption land on a frame that supports it? Any blank or white frames?
Is small text legible, or does it need a `focus`?

`references/troubleshooting.md` has every failure this pipeline has actually hit
and the fix for each. Read it before debugging from scratch.

## Re-cutting after the UI changes

This is the point of the whole thing.

```sh
APP_DIR=/path/to/app npm run all
```

Most changes need nothing else — moved elements, restyled pages, new copy. What
still needs judgement:

- **A page was deleted or renamed** → repoint or replace that shot.
- **A feature was rewritten** → the narration for that beat is now a claim about
  something that no longer exists. Rewrite the line.
- **A selector genuinely vanished** → check the warnings list and fix it there.

Narration is cached per line, so only edited lines re-synthesise.

## Voice

**The voice is the single biggest quality difference in the finished video, and
the fallback is genuinely poor.** Say so plainly before the first build rather
than after.

- `tts.provider: "minimax"` — good. Ask the user where their MiniMax key lives
  and point `tts.envFile` at that file. Voice ids come from MiniMax's system
  voice list; the language tag on a voice is a hint, not a restriction (a
  Ukrainian-tagged voice reads English well with `languageBoost: "English"`).
- `tts.provider: "say"` — macOS's built-in synthesiser, and only the legacy
  voices are usually installed. It is robotic, it mispronounces product names,
  and it is obvious to anyone watching. Usable for checking timing, weak for
  anything a judge or customer will see.
- **A human recording beats both.** Drop `<id>.wav` files into `public/vo/` and
  run `npm run script`; the durations are re-measured and the whole video
  retimes itself with no other edit.

If there is no key, build the video anyway — but tell the user up front that the
voice is the weak part and that either a key or ten minutes with a microphone
fixes it. Do not quietly ship a `say` voiceover as if it were finished.

MiniMax falls back to `say` **per line** if the API is unreachable, so a run
never fails outright.

**Never copy an API key into the project.** `scripts/tts.mjs` reads
`MINIMAX_API_KEY` / `MINIMAX_GROUP_ID` from the environment, and otherwise parses
them out of whatever file `tts.envFile` names. Ask the user where their key lives
and point `envFile` at it.

A human recording beats any synthesiser: drop `<id>.wav` files into `public/vo/`
and run `npm run script` — it re-measures them and retimes the whole video.

## Music

`scripts/music.mjs` fetches the track named in `music.url` with yt-dlp and cuts
a bed to the current video length. **Tell the user to check the track's licence
before publishing** — library tracks are usually free with attribution in the
description and paid without it. The title and URL are saved to
`public/music/SOURCE.txt` so the credit is easy to copy.

## Don'ts

- Don't hand-tune timings. If a beat feels rushed, the narration is too long for
  the shot — fix `shots.json`, not the timeline.
- Don't put `<Screen />` inside a `<Sequence>`. It reads absolute time by design;
  `useCurrentFrame()` inside a Sequence returns Sequence-local frames. This has
  broken the video before and the symptom (footage subtly out of sync with the
  voice) is hard to spot.
- Don't let setup time end up on camera. Navigation, data loading and dismissing
  a banner all happen inside the shot's capture window and get stretched under
  the narration. Put `{"cut": true}` after the setup steps; the footage then
  starts from there.
- Don't film anything stubbed. If a button returns "connect the backend", leave
  it out and tell the user which shot to add once it is wired.
- Don't ship without checking the warnings list.
- Don't narrate a number you can see drifting between runs, and never describe a
  screen as full when this account's version of it is empty. A judge who spots
  one false claim discounts the rest.
