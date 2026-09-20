import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { FPS, CAPTIONS } from '../timeline';
import { C, FONT } from '../theme';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const cue = CAPTIONS.find((c) => t >= c.from - 0.12 && t < c.to + 0.06);
  if (!cue) return null;
  const a = Math.min(clamp((t - (cue.from - 0.12)) / 0.18, 0, 1), clamp((cue.to + 0.06 - t) / 0.18, 0, 1));
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 72 }}>
      <div
        style={{
          maxWidth: 1400,
          textAlign: 'center',
          fontFamily: FONT.sans,
          fontWeight: 600,
          fontSize: 40,
          lineHeight: 1.25,
          letterSpacing: '-0.015em',
          color: C.captionText ?? '#ffffff',
          opacity: a,
          transform: `translateY(${(1 - a) * 10}px)`,
          padding: '14px 32px',
          borderRadius: 16,
          background: C.captionBg,
          border: `1px solid ${C.lineStrong}`,
          textShadow: '0 2px 14px rgba(0,0,0,0.6)',
        }}
      >
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};
