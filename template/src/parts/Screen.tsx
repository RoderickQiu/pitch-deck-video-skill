import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { FPS, W, H, captureAt, camAt, APP_START, APP_END, FRAME_COUNT, VIGNETTE } from '../timeline';
import { C } from '../theme';

const pad = (n: number) => String(n).padStart(5, '0');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// NOTE: deliberately NOT inside a <Sequence>. The whole timeline (retiming,
// camera) is expressed in absolute video seconds, and useCurrentFrame() inside
// a Sequence returns Sequence-local frames.
export const Screen: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < APP_START - 0.6 || t > APP_END + 0.6) return null;

  const alpha = Math.min(clamp((t - APP_START) / 0.45, 0, 1), clamp((APP_END - t) / 0.5, 0, 1));
  const { cx, cy, s } = camAt(t);
  const left = clamp(W / 2 - cx * s, W * (1 - s), 0);
  const top = clamp(H / 2 - cy * s, H * (1 - s), 0);
  const idx = clamp(Math.round(captureAt(t) * FPS) + 1, 1, FRAME_COUNT);

  return (
    <AbsoluteFill style={{ backgroundColor: C.bgDeep, opacity: alpha }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <Img src={staticFile(`frames/${pad(idx)}.jpg`)} style={{ position: 'absolute', left, top, width: W * s, height: H * s }} />
      </div>
      {VIGNETTE > 0 ? (
        <AbsoluteFill style={{ boxShadow: `inset 0 0 240px 50px rgba(0,0,0,${VIGNETTE})`, pointerEvents: 'none' }} />
      ) : null}
    </AbsoluteFill>
  );
};
