import type { ContinuousScreenQuality } from '../../../shared/settings';
import type { LiveMediaResolution } from './liveConfig';

export function continuousScreenQualityToMediaResolution(
  quality: ContinuousScreenQuality,
): LiveMediaResolution {
  switch (quality) {
    case 'low':
      return 'MEDIA_RESOLUTION_LOW';
    case 'medium':
      return 'MEDIA_RESOLUTION_MEDIUM';
    case 'high':
      return 'MEDIA_RESOLUTION_HIGH';
  }
}
