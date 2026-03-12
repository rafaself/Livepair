import type { ProductMode } from './core/session.types';

type SessionControllerModeSwitchingArgs = {
  currentProductMode: () => ProductMode;
  hasSpeechRuntimeActivity: () => boolean;
  hasTextRuntimeActivity: () => boolean;
  isCurrentSessionOperation: (operationId: number) => boolean;
  setCurrentMode: (mode: ProductMode) => void;
  teardownActiveRuntime: (options: {
    textSessionStatus: 'disconnected';
    preserveConversationTurns?: boolean;
  }) => Promise<void>;
};

export function createSessionControllerModeSwitching({
  currentProductMode,
  hasSpeechRuntimeActivity,
  hasTextRuntimeActivity,
  isCurrentSessionOperation,
  setCurrentMode,
  teardownActiveRuntime,
}: SessionControllerModeSwitchingArgs) {
  const ensureExclusiveMode = async (
    targetMode: ProductMode,
    operationId: number,
  ): Promise<void> => {
    const shouldTearDownSpeech =
      targetMode === 'text' &&
      (currentProductMode() !== 'text' || hasSpeechRuntimeActivity());
    const shouldTearDownText =
      targetMode === 'speech' &&
      (currentProductMode() !== 'speech' || hasTextRuntimeActivity());

    if (shouldTearDownSpeech || shouldTearDownText) {
      await teardownActiveRuntime({
        textSessionStatus: 'disconnected',
        preserveConversationTurns: true,
      });

      if (!isCurrentSessionOperation(operationId)) {
        return;
      }
    }

    setCurrentMode(targetMode);
  };

  return {
    ensureExclusiveMode,
  };
}
