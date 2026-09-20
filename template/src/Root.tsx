import React from 'react';
import { Composition } from 'remotion';
import { CompanionVideo } from './Video';
import { FPS, W, H, TOTAL_FRAMES } from './timeline';

export const RemotionRoot: React.FC = () => (
  <Composition id="Demo" component={CompanionVideo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
);
