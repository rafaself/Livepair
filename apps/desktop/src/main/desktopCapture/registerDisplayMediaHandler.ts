import { desktopCapturer, session } from 'electron';
import type { CaptureSourceRegistry } from './captureSourceRegistry';
import { CAPTURE_SOURCE_LIST_OPTIONS, toCaptureSources } from './captureSourceRegistry';
import { selectAutoSource } from './selectAutoSource';

/**
 * Registers a display-media request handler on the default Electron session.
 *
 * Without this handler, `navigator.mediaDevices.getDisplayMedia()` in the
 * renderer throws "Not supported". The handler uses `desktopCapturer` to
 * enumerate screen and window sources, keeps the registry in sync, and
 * honors any selected source when present.
 *
 * In automatic mode (no selected source) the handler prefers `screen:*`
 * sources over `window:*` sources and excludes any source IDs returned by
 * `getExcludedSourceIds` — used to omit the app's own overlay window.
 */
export function registerDisplayMediaHandler(
  captureSourceRegistry: CaptureSourceRegistry,
  getExcludedSourceIds: () => ReadonlySet<string> = () => new Set(),
): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources(CAPTURE_SOURCE_LIST_OPTIONS);
        captureSourceRegistry.setSources(toCaptureSources(sources));
        const selectedSourceId =
          captureSourceRegistry.getSelectedSource()?.id
          ?? captureSourceRegistry.getSelectedSourceId();
        const selectedSource = selectedSourceId === null
          ? null
          : sources.find((source) => source.id === selectedSourceId) ?? null;
        const source = selectedSource ?? selectAutoSource(toCaptureSources(sources), getExcludedSourceIds());

        if (source) {
          callback({ video: sources.find((s) => s.id === source.id) ?? source });
        } else {
          callback({});
        }
      } catch {
        callback({});
      }
    },
  );
}
