# Troubleshooting

Every failure this pipeline has actually hit, and the fix. Check here before
debugging from scratch.

## The footage is subtly out of sync with the voice

**Cause:** `<Screen />` ended up inside a `<Sequence>`. `useCurrentFrame()`
inside a Sequence returns Sequence-local frames, but the whole timeline is
authored in absolute video seconds.

**Fix:** keep `<Screen />` at the top level of `Video.tsx`, computing its own
fades from absolute time. The component carries a comment saying so — leave it
there.

**How to spot it:** pick a frame, note what the app is showing, and compare
against `captureAt(t)` in the raw frames. If the app is several seconds behind
where the narration expects it, this is why.

## A white frame flashes on navigation

**Cause:** Chromium paints white between documents, and Playwright launches with
`PaintHolding` disabled.

**Fix:** already handled — `goto` navigates with `history.pushState` +
`popstate` and only falls back to a real load if the route did not take.

**Do not** try `--default-background-color`: the headless shell rejects it with
"Headless commands are not compatible with remote debugging" and the browser
fails to launch.

## The opening frames are blank

**Cause:** a cold dev server. Vite optimising deps or Next compiling a route can
sit blank for seconds, and that blankness becomes the opening of the video.

**Fix:** already handled — the recorder loads the first route and waits for the
page to paint real text before starting the clock. If a build still opens blank,
warm the server by loading a page yourself before running.

## A selector times out

The run does not crash: it logs to `capture/marks.json → warnings`, **saves a
screenshot of the page at that moment to `capture/failures/<step>.png`**, and
continues. Look at that screenshot before you touch a selector — it usually
shows something you did not expect on screen, like a modal that opened three
shots ago and never closed.

- `has-text()` matches the **whole subtree**, so it can hit a big ancestor
  earlier in the DOM than the thing you meant. Scope it:
  `[role="dialog"] button:has-text("Room")`.
- Check your *wait* selector too. A wait that passes for the wrong reason (a
  string that appears elsewhere on the page) hides the real failure until a later
  step breaks confusingly.
- An element below the fold needs `scroll` or `scrollIn` first. `focus` calls
  `scrollIntoViewIfNeeded`, but only inside the window.

## A shot films the previous page

The URL changed but the app did not. Next's App Router ignores a manual
`pushState`, and a naive navigation would film the old page under the new
narration — silently, with no error.

`goto` guards against this by hashing the whole body text before and after and
falling through to a real page load if nothing changed. If you are writing your
own navigation, do the same, and hash the **whole** text: headers and sidebars
are identical across routes, so a prefix always looks unchanged.

## Clicking a link opens a modal, not the page

Some apps intercept their own links to open an overlay — an episode player, a
detail sheet. That overlay then sits on top of everything and every later
selector fails at once. Two options: film the overlay deliberately (it is often
the best screen in the app), or `{"goto": {"to": "/x", "hard": true}}` to load
the standalone route instead.

## Grey borders around the app, or the layout looks wrong

The capture viewport and the video size must match. Playwright composites the
CSS viewport into the video canvas — it does **not** scale the page to fill it —
so a canvas larger than the viewport pads the rest with grey. And enlarging the
viewport instead hands the app a wider breakpoint, so the video stops showing
what a normal 1080p user sees. Both are pinned to `app.width` x `app.height`;
leave them that way. (`deviceScaleFactor` raises density for *screenshots*, not
for `recordVideo`.)

## Text is soft or blurry

The capture is 1080p, so any `focus` above ~1.5 is an upscale. Lower `max`, or
`scrollIn` to the part that matters and zoom less. If a panel is genuinely too
small to read at 1080p even unzoomed, that is worth telling the user about — it
is a product problem as much as a video one.

## A spinner, skeleton or empty state opens a shot

Two different causes, and you probably need both fixes.

1. **The shot is filming its own setup.** Navigation and data loading happen
   inside the capture window. Add `{"cut": true}` after the setup steps.
2. **`settle` returned too early.** It watches for marker classes, in-viewport
   images, webfonts, *and* DOM stability — that last one because plenty of apps
   render placeholders as plain divs with no class to match on. If it still slips
   through, gate the shot on content that only exists once data arrives.

## `settle: still changing after Nms`

Something on the page never stops moving. An auto-rotating carousel is the usual
culprit; a live clock is not (text length and node count are compared rather than
a hash, so a ticking timer reads as stable). It is a warning, not a failure — the
shot still records. Narrow `app.loadingSelectors` or accept it.

## Dev-server chrome is in the video

Next's error/build indicators and Vite's error overlay are hidden automatically.
Anything else — a debug panel, a staging banner — goes in `app.hideSelectors`.

## Captions are invisible

The caption box is dark by default. If `theme.colors.captionText` is unset it
falls back to white — but if you set it from the app's body colour on a **light**
theme you get dark text on a dark box. Set `captionText` explicitly, and set
`theme.vignette` to 0 on a light app so the frame edges are not dimmed.

## A click does nothing

Anything overlaying the page must not intercept pointer events. The sync slate is
`pointer-events: none` for exactly this reason. If you add an overlay, do the
same.

## Footage runs too fast

Each shot's capture window is mapped onto its narration window, so if the actions
take longer than the line, the footage speeds up to fit. Ratios up to ~1.3× read
fine — typing especially. Beyond that, either shorten the `do` list or lengthen
the `say`.

The recorder already holds every shot open for at least its narration length, so
the opposite (slow motion) is the normal case and looks intentional.

## Captions break on dangling words

The chunker splits on clause punctuation first, then halves anything still too
long at a non-stop-word boundary. If a cue still ends on "of" or "the", the
sentence needs rewriting — that is the real fix, and it improves the narration
anyway.

## The video is quieter than everything else

`npm run all` masters to −14 LUFS, which is where YouTube and Devpost normalise.
Verify with:

```sh
ffmpeg -nostats -i out/demo.mp4 -af ebur128=peak=true -f null -
```

## Text is too small to read

The video is watched at 1080p, often in a browser tab at half size. A 480 px-wide
side panel is illegible. `focus` on it. If the panel is tall and narrow so the
zoom is capped, `scrollIn` to the section that matters and focus a sub-heading
inside it instead.

## Crossfade ghosting

If you cross-fade two frames of the same page at different scroll positions, the
double image is visible. Keep such fades at 0.22–0.24 s, or cut instead.

## Rendering is slow

`--concurrency=8` and `--jpeg-quality=92` are the defaults in `build.mjs`. The
frame sequence is chosen over `OffthreadVideo` deliberately: it makes frame
selection deterministic, including true freezes. A ~90 s take renders in ~40 s.

## Environment

- Some shells block bare `node`, `rm`, `curl`. Use absolute paths
  (`/usr/local/bin/node`, `/bin/rm`).
- `npm create video@latest` prompts interactively and hangs. The template exists
  so you never run it.
- `.first()` on a Playwright locator can resolve to a **hidden** duplicate —
  responsive apps often render a mobile and a desktop copy of the same control.
  Every action here uses the first *visible* match instead; do the same in any
  probe script you write, or you will chase selectors that are plainly on screen.
- yt-dlp is not usually installed. A venv works:
  `python3 -m venv .tools && .tools/bin/pip install yt-dlp`.
