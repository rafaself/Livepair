export const SCREEN_ANALYSIS_MAX_WIDTH_PX = 160;
export const SCREEN_ANALYSIS_MAX_HEIGHT_PX = 90;
export const SCREEN_ANALYSIS_TILE_COLUMNS = 8;
export const SCREEN_ANALYSIS_TILE_ROWS = 5;
const SCREEN_PERCEPTUAL_HASH_WIDTH = 9;
const SCREEN_PERCEPTUAL_HASH_HEIGHT = 8;
const SCREEN_PERCEPTUAL_HASH_BITS = SCREEN_PERCEPTUAL_HASH_HEIGHT
  * (SCREEN_PERCEPTUAL_HASH_WIDTH - 1);

type ImageDataLike = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type ScreenFrameAnalysis = {
  widthPx: number;
  heightPx: number;
  tileLuminance: number[];
  tileEdge: number[];
  perceptualHash: bigint;
};

export function getScreenAnalysisThumbnailSize(
  sourceWidthPx: number,
  sourceHeightPx: number,
): { widthPx: number; heightPx: number } {
  if (sourceWidthPx <= 0 || sourceHeightPx <= 0) {
    return { widthPx: 1, heightPx: 1 };
  }

  const scale = Math.min(
    1,
    SCREEN_ANALYSIS_MAX_WIDTH_PX / sourceWidthPx,
    SCREEN_ANALYSIS_MAX_HEIGHT_PX / sourceHeightPx,
  );

  return {
    widthPx: Math.max(1, Math.round(sourceWidthPx * scale)),
    heightPx: Math.max(1, Math.round(sourceHeightPx * scale)),
  };
}

function toTileIndex(x: number, y: number, widthPx: number, heightPx: number): number {
  const tileX = Math.min(
    SCREEN_ANALYSIS_TILE_COLUMNS - 1,
    Math.floor((x * SCREEN_ANALYSIS_TILE_COLUMNS) / widthPx),
  );
  const tileY = Math.min(
    SCREEN_ANALYSIS_TILE_ROWS - 1,
    Math.floor((y * SCREEN_ANALYSIS_TILE_ROWS) / heightPx),
  );

  return (tileY * SCREEN_ANALYSIS_TILE_COLUMNS) + tileX;
}

function sampleGrayscale(
  grayscale: Uint8Array,
  widthPx: number,
  heightPx: number,
  sampleX: number,
  sampleY: number,
): number {
  const x = Math.min(
    widthPx - 1,
    Math.max(0, Math.floor(((sampleX + 0.5) * widthPx) / SCREEN_PERCEPTUAL_HASH_WIDTH)),
  );
  const y = Math.min(
    heightPx - 1,
    Math.max(0, Math.floor(((sampleY + 0.5) * heightPx) / SCREEN_PERCEPTUAL_HASH_HEIGHT)),
  );

  return grayscale[(y * widthPx) + x] ?? 0;
}

function computePerceptualHash(
  grayscale: Uint8Array,
  widthPx: number,
  heightPx: number,
): bigint {
  let hash = 0n;
  let bitIndex = 0n;

  for (let y = 0; y < SCREEN_PERCEPTUAL_HASH_HEIGHT; y += 1) {
    for (let x = 0; x < SCREEN_PERCEPTUAL_HASH_WIDTH - 1; x += 1) {
      const left = sampleGrayscale(grayscale, widthPx, heightPx, x, y);
      const right = sampleGrayscale(grayscale, widthPx, heightPx, x + 1, y);

      if (left > right) {
        hash |= 1n << bitIndex;
      }

      bitIndex += 1n;
    }
  }

  return hash;
}

export function computePerceptualHashDistance(left: bigint, right: bigint): number {
  let distance = 0;
  let diff = left ^ right;

  while (diff > 0n) {
    distance += Number(diff & 1n);
    diff >>= 1n;
  }

  return distance / SCREEN_PERCEPTUAL_HASH_BITS;
}

export function buildScreenFrameAnalysis(imageData: ImageDataLike): ScreenFrameAnalysis {
  const { data, width, height } = imageData;
  const grayscale = new Uint8Array(width * height);
  const tileCount = SCREEN_ANALYSIS_TILE_COLUMNS * SCREEN_ANALYSIS_TILE_ROWS;
  const luminanceSums = new Float64Array(tileCount);
  const edgeSums = new Float64Array(tileCount);
  const pixelCounts = new Uint32Array(tileCount);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width) + x;
      const channelIndex = pixelIndex * 4;
      const red = data[channelIndex] ?? 0;
      const green = data[channelIndex + 1] ?? 0;
      const blue = data[channelIndex + 2] ?? 0;
      const gray = Math.round((0.299 * red) + (0.587 * green) + (0.114 * blue));
      const tileIndex = toTileIndex(x, y, width, height);

      grayscale[pixelIndex] = gray;
      luminanceSums[tileIndex] = (luminanceSums[tileIndex] ?? 0) + gray;
      pixelCounts[tileIndex] = (pixelCounts[tileIndex] ?? 0) + 1;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width) + x;
      const tileIndex = toTileIndex(x, y, width, height);
      const current = grayscale[pixelIndex] ?? 0;
      const right = x + 1 < width ? (grayscale[pixelIndex + 1] ?? current) : current;
      const down = y + 1 < height ? (grayscale[pixelIndex + width] ?? current) : current;
      const edgeStrength = Math.min(255, Math.abs(current - right) + Math.abs(current - down));

      edgeSums[tileIndex] = (edgeSums[tileIndex] ?? 0) + edgeStrength;
    }
  }

  const tileLuminance = Array.from({ length: tileCount }, (_, index) => {
    const count = pixelCounts[index] || 1;
    return (luminanceSums[index] ?? 0) / count;
  });
  const tileEdge = Array.from({ length: tileCount }, (_, index) => {
    const count = pixelCounts[index] || 1;
    return (edgeSums[index] ?? 0) / count;
  });

  return {
    widthPx: width,
    heightPx: height,
    tileLuminance,
    tileEdge,
    perceptualHash: computePerceptualHash(grayscale, width, height),
  };
}
