# pitch-deck-video

A Claude Code skill that generates a narrated 1–2 minute product demo video by
driving your real app in a browser — and re-cuts it in about two minutes when
the frontend changes.

Built during a hackathon where the UI was still moving while the submission
video was due. It survived four rewrites of the app it was filming, including a
page being deleted and a screen being rebuilt, without a single hand-edited
timing.

## Install

```sh
git clone <this repo> ~/.claude/skills/pitch-deck-video
```

Then ask Claude Code for a demo video, or type `/pitch-deck-video`.

Needs Node, `ffmpeg`, and (optionally) `yt-dlp` for a music bed.

## The idea

The edit is **derived, never hand-timed**. Four files drive everything, and only
the first is written by a human:

| file | holds | written by |
| --- | --- | --- |
| `shots.json` | what is said, the voice, the music, the theme, and what the browser does | **you** |
| `src/vo-durations.json` | how long each line actually takes | `scripts/tts.mjs` |
| `capture/marks.json` | when each shot started in the take, and where to look | `scripts/record.mjs` |
| `src/frames.json` | how many frames came out of the take | `scripts/frames.mjs` |

Scene lengths come from the **measured** narration audio. The captured footage is
stretched to fit it. Camera moves come from element bounding boxes **measured
live during the recording** — so when a button moves, the shot moves with it.

That is why a rebuild is one command:

```sh
APP_DIR=/path/to/your/app npm run all
```

Narration → Playwright recording → frame extraction → Remotion render. Typical
full rebuild: **~2 minutes**. Narration is cached per line, so editing one
sentence re-synthesises one clip.

## What it handles

Everything here exists because it broke a real video first:

- **Navigation that lies.** Next's App Router updates the URL on `pushState`
  without re-rendering, which silently films the previous page. Navigation is
  verified by content change, not by URL.
- **Loading states.** Spinners, skeletons with no marker class, half-decoded
  images, unswapped webfonts, and a shot filming its own setup time.
- **Hidden duplicate elements.** Responsive apps render mobile and desktop copies
  of the same control; every action takes the first *visible* match.
- **Dev-server chrome.** Next's error indicator and Vite's overlay are hidden.
- **Auth.** Point at a Playwright storage state and the recording starts logged
  in. Passwords come from the environment, never from `shots.json`.
- **Soft failures.** A missing selector is a warning plus a screenshot of the
  page at that moment, not a crashed run.

## Layout

```
SKILL.md                    the skill itself
references/
  shots-reference.md        every field and action in shots.json
  troubleshooting.md        every failure this has hit, and the fix
template/                   scaffolded into <app>-video/ per project
  shots.example.json        start here
  scripts/                  tts, record, frames, music, build
  src/                      the derived timeline, cards, captions
```

## Notes

- The voice matters more than anything else in the finished video. MiniMax is
  good; the macOS `say` fallback is not; a human reading the lines into
  `public/vo/` beats both and retimes the video automatically.
- Check the licence of any music you use before publishing.
