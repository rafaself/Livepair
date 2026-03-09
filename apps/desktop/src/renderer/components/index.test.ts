import { describe, expect, it } from 'vitest';
import * as Components from './index';

describe('components barrel exports', () => {
  it('re-exports primitives, layout, composite and features', () => {
    expect(Components.Button).toBeDefined();
    expect(Components.ButtonGroup).toBeDefined();
    expect(Components.IconButton).toBeDefined();
    expect(Components.OutlinedField).toBeDefined();
    expect(Components.TextInput).toBeDefined();
    expect(Components.Panel).toBeDefined();
    expect(Components.ControlDock).toBeDefined();
    expect(Components.StatusIndicator).toBeDefined();
    expect(Components.AssistantPanel).toBeDefined();
    expect(Components.ThemeToggle).toBeDefined();
  });
});
