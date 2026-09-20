import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { FPS, CARDS_CONFIG } from '../timeline';
import { C, FONT } from '../theme';

// The slide judges always ask for: which boxes are model calls and which are
// not. Nodes come from shots.json -> cards.arch.nodes.
type Node = { label: string; note: string; kind: 'in' | 'llm' | 'code' | 'out' };

export const Arch: React.FC<{ dur: number }> = ({ dur }) => {
  const t = useCurrentFrame() / FPS;
  const cfg = CARDS_CONFIG.arch ?? { title: 'How it works', nodes: [] as Node[] };
  const nodes: Node[] = cfg.nodes ?? [];
  const tone = (kind: string) =>
    kind === 'llm' ? C.accent : kind === 'code' ? C.accent2 : kind === 'out' ? C.accent3 : C.textMuted;
  const label = (kind: string) => (kind === 'llm' ? 'model' : kind === 'code' ? 'code' : kind === 'in' ? 'input' : 'output');

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', gap: 56 }}>
      <div style={{ fontFamily: FONT.serif, fontSize: 60, color: C.text, letterSpacing: '-0.02em' }}>{cfg.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {nodes.map((n, i) => {
          const a = interpolate(t, [0.25 + i * 0.32, 0.85 + i * 0.32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const col = tone(n.kind);
          return (
            <React.Fragment key={n.label}>
              {i > 0 ? <div style={{ width: 52, height: 2, background: C.lineStrong, opacity: a, borderRadius: 2 }} /> : null}
              <div
                style={{
                  width: 268, minHeight: 168, boxSizing: 'border-box', padding: '24px 22px', borderRadius: 24,
                  background: C.card, border: `1.5px solid ${n.kind === 'in' ? C.line : col}`,
                  opacity: a, transform: `translateY(${(1 - a) * 16}px)`,
                }}
              >
                <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: col }}>
                  {label(n.kind)}
                </div>
                <div style={{ fontFamily: FONT.serif, fontSize: 34, color: C.text, marginTop: 14, lineHeight: 1.05 }}>{n.label}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 17, color: C.textMuted, marginTop: 10, lineHeight: 1.35 }}>{n.note}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
