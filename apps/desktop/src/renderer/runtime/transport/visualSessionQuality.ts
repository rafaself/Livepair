import type { VisualSessionQuality } from '../../../shared/settings';
import type { LiveMediaResolution } from './liveConfig';

/**
 * Maps the user-facing visual session quality setting to the Gemini Live
 * media resolution value sent in the session connect config.
 *
 * Kept separate from both the fixed Live model and the local screen-frame
 * encoding (Wave 4) so each concern can evolve independently.
 */
export function visualSessionQualityToMediaResolution(
  quality: VisualSessionQuality,
): LiveMediaResolution {
  switch (quality) {
    case 'Low':
      return 'MEDIA_RESOLUTION_LOW';
    case 'Medium':
      return 'MEDIA_RESOLUTION_MEDIUM';
    case 'High':
      return 'MEDIA_RESOLUTION_HIGH';
  }
}
