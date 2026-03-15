import { desktopCapturer, session } from 'electron';
import type { CaptureSourceRegistry } from './captureSourceRegistry';
import {
  CAPTURE_SOURCE_LIST_OPTIONS,
  filterEligibleCaptureSources,
  toCaptureSources,
} from './captureSourceRegistry';
import { selectAutoSource } from './selectAutoSource';

type DisplayMediaRequestHandler = Parameters<
  typeof session.defaultSession.setDisplayMediaRequestHandler
>[0];

type SessionWithDisplayMediaPickerOption = typeof session.defaultSession & {
  setDisplayMediaRequestHandler: (
    handler: DisplayMediaRequestHandler,
    options?: { useSystemPicker?: boolean },
  ) => void;
};

/**
 * Registers a display-media request handler on the default Electron session.
 *
 * Without this handler, `navigator.mediaDevices.getDisplayMedia()` in the
 * renderer throws "Not supported". The handler uses `desktopCapturer` to
 * enumerate screen and window sources, keeps the registry in sync, and
 * honors any selected source when present. When the user has not selected a
 * source, Electron's system picker is preferred when available. If Electron
 * still invokes this handler, automatic fallback is limited to the single
 * unambiguous eligible source.
 */
export function registerDisplayMediaHandler(
  captureSourceRegistry: CaptureSourceRegistry,
  getExcludedSourceIds: () => ReadonlySet<string> = () => new Set(),
): void {
  const defaultSession = session.defaultSession as SessionWithDisplayMediaPickerOption;

  defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
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
          callback({
            video: eligibleSources.find((eligibleSource) => eligibleSource.id === source.id) ?? source,
          });
        } else {
          callback({});
        }
      } catch {
        callback({});
      }
    },
    { useSystemPicker: true },
  );
}
