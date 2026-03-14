import { desktopCapturer, session } from 'electron';

/**
 * Registers a display-media request handler on the default Electron session.
 *
 * Without this handler, `navigator.mediaDevices.getDisplayMedia()` in the
 * renderer throws "Not supported". The handler uses `desktopCapturer` to
 * enumerate screen sources and auto-selects the first one.
 *
 * Source-selection UI will be added in a later wave.
 */
export function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
        });
        const source = sources[0];

        if (source) {
          callback({ video: source });
        } else {
          callback({});
        }
      } catch {
        callback({});
      }
    },
  );
}
