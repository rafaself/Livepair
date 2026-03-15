import { desktopCapturer, session } from 'electron';
import type { CaptureSourceRegistry } from './captureSourceRegistry';
import {
  CAPTURE_SOURCE_LIST_OPTIONS,
  filterEligibleCaptureSources,
  toCaptureSources,
} from './captureSourceRegistry';
import { selectAutoSource } from './selectAutoSource';

/**
 * Registers a display-media request handler on the default Electron session.
 *
 * Without this handler, `navigator.mediaDevices.getDisplayMedia()` in the
 * renderer throws "Not supported". The handler uses `desktopCapturer` to
 * enumerate screen and window sources, keeps the registry in sync, and
 * honors any selected source when present. When the user has not selected a
 * source, automatic fallback is limited to the single unambiguous eligible
 * source so the app's registry-backed selection flow remains authoritative.
 */
export function registerDisplayMediaHandler(
  captureSourceRegistry: CaptureSourceRegistry,
  getExcludedSourceIds: () => ReadonlySet<string> = () => new Set(),
): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      let responded = false;
      const respondOnce = (response: Parameters<typeof callback>[0]): void => {
        if (responded) return;
        responded = true;
        try {
          callback(response);
        } catch {
          // Electron throws if the callback is invoked after the request has
          // already been answered (e.g. in a race). Swallow silently — the
          // renderer already received a response.
        }
      };

      try {
        const sources = await desktopCapturer.getSources(CAPTURE_SOURCE_LIST_OPTIONS);
        const eligibleSources = filterEligibleCaptureSources(
          sources,
          getExcludedSourceIds(),
        );
        captureSourceRegistry.setSources(toCaptureSources(eligibleSources));
        const selectedSourceId = captureSourceRegistry.getSelectedSourceId();
        const selectedSource = selectedSourceId === null
          ? null
          : eligibleSources.find((source) => source.id === selectedSourceId) ?? null;
        const source = selectedSource
          ?? selectAutoSource(toCaptureSources(eligibleSources));

        if (source) {
          respondOnce({
            video: eligibleSources.find((eligibleSource) => eligibleSource.id === source.id) ?? source,
          });
        } else {
          respondOnce({});
        }
      } catch {
        respondOnce({});
      }
    },
  );
}
