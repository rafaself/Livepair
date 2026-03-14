import type { DesktopSession } from '../../transport/transport.types';
import type { VoiceResumeControllerOps } from './voiceResumeController';

export async function teardownVoiceSessionForResume(
  ops: VoiceResumeControllerOps,
  previousTransport: DesktopSession | null,
): Promise<void> {
  const store = ops.store.getState();
  store.setLastRuntimeError(null);
  store.setActiveTransport(null);

  ops.unsubscribePreviousTransport();
  ops.setActiveTransport(null);
  ops.resetTransportDeps();

  await ops.stopScreenCapture();

  try {
    await ops.stopVoicePlayback();
  } catch {
    // Ignore playback teardown errors while replacing the transport.
  }

  void previousTransport?.disconnect().catch(() => undefined);
}
