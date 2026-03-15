import type { SourcesOptions } from 'electron';
import type {
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
  getSnapshot: () => ScreenCaptureSourceSnapshot;
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
  },
>(sources: readonly TSource[]): CaptureSource[] {
  return sources.map(({ id, name }) => ({ id, name }));
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
    getSnapshot: () => ({
      sources: [...sources],
      selectedSourceId,
    }),
  };
}
