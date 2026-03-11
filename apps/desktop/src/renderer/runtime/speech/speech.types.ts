export type SpeechLifecycleStatus =
  | 'off'
  | 'starting'
  | 'listening'
  | 'userSpeaking'
  | 'assistantSpeaking'
  | 'interrupted'
  | 'recovering'
  | 'ending';
export type SpeechLifecycle = {
  status: SpeechLifecycleStatus;
};
