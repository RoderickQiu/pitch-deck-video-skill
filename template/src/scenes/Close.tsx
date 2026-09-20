import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { FPS, TAGLINE, CARDS_CONFIG } from '../timeline';
import { C, FONT } from '../theme';
import { Wordmark } from '../parts/Brand';

export const Close: React.FC<{ dur: number }> = ({ dur }) => {
  const t = useCurrentFrame() / FPS;
  // Judges are told to look for team credits. shots.json -> cards.close.credits
  const credits: string[] = CARDS_CONFIG.close?.credits ?? [];
  const a = interpolate(t, [0, 0.7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const draw = interpolate(t, [0.1, 1.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line = interpolate(t, [0.8, 1.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      <div style={{ opacity: a }}><Wordmark size={92} progress={draw} /></div>
      <div
        style={{
          fontFamily: FONT.serif, fontSize: 54, lineHeight: 1.15, letterSpacing: '-0.02em',
          color: C.textSoft, textAlign: 'center', maxWidth: 1180,
          opacity: line, transform: `translateY(${(1 - line) * 12}px)`,
        }}
      >
        {TAGLINE}
      </div>
      {credits.length ? (
        <div style={{ fontFamily: FONT.mono, fontSize: 18, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, opacity: line }}>
          {credits.join('  ·  ')}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
