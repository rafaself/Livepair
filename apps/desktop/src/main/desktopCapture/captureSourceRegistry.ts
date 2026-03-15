import type { Rectangle, SourcesOptions } from 'electron';
import type {
  ScreenCaptureOverlayDisplay,
  ScreenCaptureRect,
  ScreenCaptureSource,
  ScreenCaptureSourceSnapshot,
} from '../../shared';

export type CaptureSource = ScreenCaptureSource;

export type CaptureSourceRegistry = {
  getSources: () => CaptureSource[];
  setSources: (sources: CaptureSource[]) => void;
  getSelectedSourceId: () => string | null;
  setSelectedSourceId: (sourceId: string | null) => void;
  getSelectedSource: () => CaptureSource | null;
  getSnapshot: (overlayDisplay: ScreenCaptureOverlayDisplay) => ScreenCaptureSourceSnapshot;
};

export const CAPTURE_SOURCE_LIST_OPTIONS: SourcesOptions = {
  types: ['screen', 'window'],
  thumbnailSize: {
    width: 0,
    height: 0,
  },
};

export function filterEligibleCaptureSources<
  TSource extends {
    id: string;
  },
>(
  sources: readonly TSource[],
  excludedIds: ReadonlySet<string> = new Set(),
): TSource[] {
  return sources.filter((source) => !excludedIds.has(source.id));
}

export function toCaptureSources<
  TSource extends {
    id: string;
    name: string;
    display_id?: string;
  },
>(sources: readonly TSource[]): CaptureSource[] {
  return sources.map(({ id, name, display_id }) => ({
    id,
    name,
    kind: id.startsWith('screen:') ? 'screen' : 'window',
    ...(display_id ? { displayId: display_id } : {}),
  }));
}

function toScreenCaptureRect({
  x,
  y,
  width,
  height,
}: Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>): ScreenCaptureRect {
  return { x, y, width, height };
}

export function toScreenCaptureOverlayDisplay<
  TDisplay extends {
    id: number;
    bounds: Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>;
    workArea: Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>;
    scaleFactor: number;
  },
>(display: TDisplay): ScreenCaptureOverlayDisplay {
  return {
    displayId: String(display.id),
    bounds: toScreenCaptureRect(display.bounds),
    workArea: toScreenCaptureRect(display.workArea),
    scaleFactor: display.scaleFactor,
  };
}

export function createCaptureSourceRegistry(): CaptureSourceRegistry {
  let sources: CaptureSource[] = [];
  let selectedSourceId: string | null = null;

  return {
    getSources: () => [...sources],
    setSources: (nextSources) => {
      sources = [...nextSources];

      if (
        selectedSourceId !== null &&
        !sources.some((source) => source.id === selectedSourceId)
      ) {
        selectedSourceId = null;
      }
    },
    getSelectedSourceId: () => selectedSourceId,
    setSelectedSourceId: (sourceId) => {
      selectedSourceId = sourceId;
    },
    getSelectedSource: () => {
      if (selectedSourceId === null) {
        return null;
      }

      return sources.find((source) => source.id === selectedSourceId) ?? null;
    },
    getSnapshot: (overlayDisplay) => ({
      sources: [...sources],
      selectedSourceId,
      overlayDisplay,
    }),
  };
}
