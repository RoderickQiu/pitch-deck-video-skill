import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, random } from 'remotion';
import { FPS, CARDS_CONFIG } from '../timeline';
import { C } from '../theme';

// Cold open: an undifferentiated wall of the thing your product sorts through,
// which dims until one item resolves. Abstract on purpose — it reads as "too
// much undifferentiated stuff" without needing to be legible.
const COLS = 9;
const ROWS = 6;

export const Hook: React.FC<{ dur: number }> = ({ dur }) => {
  const t = useCurrentFrame() / FPS;
  const accent = CARDS_CONFIG.hook?.accent ?? C.accent ?? '#ffc93c';
  const dim = interpolate(t, [dur * 0.42, dur * 0.72], [1, 0.22], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pick = interpolate(t, [dur * 0.52, dur * 0.78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const chosen = COLS * 2 + 5;

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 176px)`, gap: 22, transform: `scale(${interpolate(t, [0, dur], [1.04, 1.12])})` }}>
        {Array.from({ length: COLS * ROWS }).map((_, i) => {
          const on = i === chosen;
          const seed = random(`c${i}`);
          const appear = interpolate(t, [seed * 0.9, seed * 0.9 + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div
              key={i}
              style={{
                height: 116,
                borderRadius: 18,
                padding: 14,
                boxSizing: 'border-box',
                background: on ? `${accent}22` : C.card,
                border: `1px solid ${on ? accent : C.line}`,
                opacity: appear * (on ? 1 : dim),
                transform: on ? `scale(${1 + pick * 0.09})` : 'none',
              }}
            >
              <div style={{ height: 10, width: `${52 + seed * 36}%`, borderRadius: 5, background: on ? accent : C.lineStrong }} />
              <div style={{ height: 8, width: `${36 + random(`d${i}`) * 34}%`, borderRadius: 4, background: C.line, marginTop: 12 }} />
              <div style={{ height: 8, width: `${28 + random(`e${i}`) * 30}%`, borderRadius: 4, background: C.line, marginTop: 9 }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
