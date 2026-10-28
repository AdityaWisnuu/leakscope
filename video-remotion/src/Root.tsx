import React from 'react';
import { Composition } from 'remotion';
import { Main, TL } from './Main';
import { FPS } from './timeline.js';
export const RemotionRoot: React.FC = () => (
  <Composition id="Main" component={Main} durationInFrames={Math.round(TL.total * FPS)} fps={FPS} width={1920} height={1080} />
);
