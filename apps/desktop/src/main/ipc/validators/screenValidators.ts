import type { SaveScreenFrameDumpFrameRequest } from '../../../shared';
import { hasOnlyAllowedKeys, isNonEmptyString, isPlainRecord } from './shared';

export function isScreenCaptureSourceId(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

export function isSaveScreenFrameDumpFrameRequest(
  value: unknown,
): value is SaveScreenFrameDumpFrameRequest {
  return (
    isPlainRecord(value)
    && hasOnlyAllowedKeys(value, ['sequence', 'mimeType', 'data'])
    && typeof value['sequence'] === 'number'
    && Number.isInteger(value['sequence'])
    && value['sequence'] > 0
    && value['mimeType'] === 'image/jpeg'
    && value['data'] instanceof Uint8Array
    && value['data'].byteLength > 0
  );
}
