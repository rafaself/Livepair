export type SpeechSilenceTimeoutSetting = '30s' | '3m' | 'never';

export function resolveSpeechSilenceTimeoutMs(
  setting: SpeechSilenceTimeoutSetting,
): number | null {
  if (setting === '30s') {
    return 30_000;
  }

  if (setting === '3m') {
    return 3 * 60_000;
  }

  return null;
}
