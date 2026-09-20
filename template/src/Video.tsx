import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { FPS, SCENES, TOTAL, TOTAL_FRAMES, APP_END, MUSIC } from './timeline';
import { Screen } from './parts/Screen';
import { Captions } from './parts/Captions';
import { Hook } from './scenes/Hook';
import { Arch } from './scenes/Arch';
import { Close } from './scenes/Close';
import { C } from './theme';
import './fonts';

const f = (s: number) => Math.round(s * FPS);

// Card scenes are keyed by shot id, so adding a card in shots.json is one entry
// here and nothing else.
const CARDS: Record<string, React.FC<{ dur: number }>> = { hook: Hook, arch: Arch, close: Close };

const Progress: React.FC = () => {
  const p = useCurrentFrame() / TOTAL_FRAMES;
  return <div style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${p * 100}%`, background: C.accent, opacity: 0.85 }} />;
};

export const CompanionVideo: React.FC = () => (
  <AbsoluteFill style={{ background: C.bgDeep }}>
    {/* Footage sits underneath and reads absolute time; see parts/Screen.tsx. */}
    <Screen />

    {SCENES.filter((s) => CARDS[s.id]).map((s) => {
      const Card = CARDS[s.id];
      const isLast = s.id === SCENES.at(-1)?.id;
      const dur = isLast ? TOTAL - s.start : s.dur;
      return (
        <Sequence key={s.id} from={f(s.start - 0.35)} durationInFrames={f(dur + 0.35)} name={s.id}>
          <AbsoluteFill style={{ opacity: 1 }}>
            <Card dur={dur} />
          </AbsoluteFill>
        </Sequence>
      );
    })}

    {SCENES.map((s) => (
      <Sequence key={`a-${s.id}`} from={f(s.start)} name={`vo:${s.id}`}>
        <Audio src={staticFile(`vo/${s.id}.wav`)} />
      </Sequence>
    ))}

    {/* Music bed: ducked under the voice, lifted for the open and the close.
        Levels live in shots.json -> music.gain. Delete that block to go without. */}
    {MUSIC ? (
      <Audio
        src={staticFile('music/bed.wav')}
        volume={(fr) => {
          const t = fr / FPS;
          const g = MUSIC!.gain;
          return interpolate(
            t,
            [0, 2.2, 4.2, APP_END - 0.3, APP_END + 1.2, TOTAL - 1.2, TOTAL],
            [0, g.open, g.under, g.under, g.close, g.close, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        }}
      />
    ) : null}

    <Captions />
    <Progress />
  </AbsoluteFill>
);
