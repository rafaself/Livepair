import type { ScreenFrameDumpQuality, ScreenFrameDumpReason } from '../../../../shared';
import type { LocalScreenFrame } from '../screen.types';

export type ScreenFrameAvailableEvent = {
  frame: LocalScreenFrame;
  capturedAtMs: number;
};

export type ScreenOutboundFrameRequest = {
  frame: LocalScreenFrame;
  requestedAtMs: number;
  mode: 'manual' | 'continuous';
  quality: ScreenFrameDumpQuality;
  reason: ScreenFrameDumpReason;
};
