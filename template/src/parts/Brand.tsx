import React from 'react';
import { C, FONT } from '../theme';
import { BRAND } from '../timeline';

/** The app's own mark: a ring with a route drawn through it. */
export const Mark: React.FC<{ size?: number; progress?: number }> = ({ size = 64, progress = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill={C.card} opacity={progress} />
    <circle
      cx="16" cy="16" r="11" fill="none" stroke={C.accent} strokeWidth="1.4"
      strokeDasharray={2 * Math.PI * 11} strokeDashoffset={(1 - progress) * 2 * Math.PI * 11}
      transform="rotate(-90 16 16)"
    />
    <g opacity={Math.max(0, (progress - 0.45) / 0.55)}>
      <circle cx="16" cy="16" r="3" fill={C.accent} />
      <circle cx="9" cy="11" r="1.7" fill={C.textMuted} />
      <circle cx="23" cy="12" r="1.7" fill={C.accent2} />
      <circle cx="21" cy="23" r="1.7" fill={C.accent3} />
      <path d="M16 16 9 11M16 16 23 12M16 16 21 23" stroke={C.textMuted} strokeWidth="0.8" opacity="0.7" />
    </g>
  </svg>
);

export const Wordmark: React.FC<{ size?: number; sub?: string; progress?: number }> = ({ size = 64, sub, progress = 1 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.34 }}>
    <Mark size={size} progress={progress} />
    <div>
      <div style={{ fontFamily: FONT.serif, fontWeight: 400, fontSize: size * 0.95, letterSpacing: '-0.02em', color: C.text, lineHeight: 1 }}>
        {BRAND}
      </div>
      {sub ? (
        <div style={{ fontFamily: FONT.mono, fontSize: size * 0.19, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textMuted, marginTop: size * 0.18 }}>
          {sub}
        </div>
      ) : null}
    </div>
  </div>
);
