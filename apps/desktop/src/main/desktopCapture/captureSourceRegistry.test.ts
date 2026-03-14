// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCaptureSourceRegistry,
  type CaptureSource,
} from './captureSourceRegistry';

const sourceA: CaptureSource = { id: 'screen:1:0', name: 'Entire Screen' };
const sourceB: CaptureSource = { id: 'window:42:0', name: 'VSCode' };

describe('createCaptureSourceRegistry', () => {
  let registry: ReturnType<typeof createCaptureSourceRegistry>;

  beforeEach(() => {
    registry = createCaptureSourceRegistry();
  });

  it('starts with empty sources and no selected id', () => {
    expect(registry.getSources()).toEqual([]);
    expect(registry.getSelectedSourceId()).toBeNull();
  });

  it('setSources replaces the source list', () => {
    registry.setSources([sourceA, sourceB]);
    expect(registry.getSources()).toEqual([sourceA, sourceB]);
  });

  it('setSelectedSourceId stores the selection', () => {
    registry.setSources([sourceA, sourceB]);
    registry.setSelectedSourceId('window:42:0');
    expect(registry.getSelectedSourceId()).toBe('window:42:0');
  });

  it('setSelectedSourceId accepts null to clear the selection', () => {
    registry.setSources([sourceA]);
    registry.setSelectedSourceId('screen:1:0');
    registry.setSelectedSourceId(null);
    expect(registry.getSelectedSourceId()).toBeNull();
  });

  it('getSelectedSource returns the matching source', () => {
    registry.setSources([sourceA, sourceB]);
    registry.setSelectedSourceId('window:42:0');
    expect(registry.getSelectedSource()).toEqual(sourceB);
  });

  it('getSelectedSource returns null when no selection', () => {
    registry.setSources([sourceA]);
    expect(registry.getSelectedSource()).toBeNull();
  });

  it('getSelectedSource returns null when selected id is not in sources', () => {
    registry.setSources([sourceA]);
    registry.setSelectedSourceId('unknown:id');
    expect(registry.getSelectedSource()).toBeNull();
  });

  it('setSources with an empty array clears sources and falls back to null on getSelectedSource', () => {
    registry.setSources([sourceA]);
    registry.setSelectedSourceId('screen:1:0');
    registry.setSources([]);
    expect(registry.getSources()).toEqual([]);
    expect(registry.getSelectedSource()).toBeNull();
  });
});
