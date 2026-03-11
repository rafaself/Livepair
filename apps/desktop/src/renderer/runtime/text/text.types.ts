export type TextSessionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'sending'
  | 'receiving'
  | 'generationCompleted'
  | 'completed'
  | 'interrupted'
  | 'goAway'
  | 'disconnecting'
  | 'disconnected'
  | 'error';
export type TextSessionLifecycle = {
  status: TextSessionStatus;
};
