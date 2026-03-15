import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/settings';
import { useAssistantPanelSettingsController } from './components/features/assistant-panel/settings/useAssistantPanelSettingsController';
import { resetCurrentChatMemoryForTests } from './chatMemory/currentChatMemory';
import { bootstrapDesktopRenderer } from './bootstrap';
import { resetDesktopStores } from './test/store';
import { useSettingsStore } from './store/settingsStore';
import { useSessionStore } from './store/sessionStore';

function BootstrappedScreenSourceOptions(): JSX.Element {
  const controller = useAssistantPanelSettingsController();

  return createElement(
    'output',
    { 'aria-label': 'screen-source-options' },
    controller.screenCaptureSourceOptions.map((option) => option.label).join('|'),
  );
}

describe('bootstrapDesktopRenderer', () => {
  beforeEach(() => {
    resetDesktopStores();
    resetCurrentChatMemoryForTests();
    document.documentElement.dataset['theme'] = '';
    document.documentElement.style.colorScheme = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    window.bridge.getSettings = vi.fn().mockResolvedValue(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.updateSettings = vi.fn().mockResolvedValue(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.getOrCreateCurrentChat = vi.fn().mockResolvedValue({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    });
    window.bridge.listChatMessages = vi.fn().mockResolvedValue([]);
    window.bridge.listScreenCaptureSources = vi.fn().mockResolvedValue({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen', kind: 'screen', displayId: '1' },
        { id: 'window:42:0', name: 'VSCode', kind: 'window' },
      ],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });
  });

  it('hydrates settings before render, applies the resolved theme, and seeds drafts from persisted settings', async () => {
    await bootstrapDesktopRenderer();

    expect(window.bridge.getSettings).toHaveBeenCalledTimes(1);
    expect(window.bridge.getOrCreateCurrentChat).toHaveBeenCalledTimes(1);
    expect(window.bridge.listChatMessages).toHaveBeenCalledWith('chat-1');
    expect(useSettingsStore.getState().isReady).toBe(true);
    expect(useSessionStore.getState().activeChatId).toBe('chat-1');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('hydrates screen capture sources before the first settings consumer render', async () => {
    await bootstrapDesktopRenderer();

    expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().screenCaptureSources).toEqual([
      { id: 'screen:1:0', name: 'Entire Screen', kind: 'screen', displayId: '1' },
      { id: 'window:42:0', name: 'VSCode', kind: 'window' },
    ]);
    expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBe('screen:1:0');
    expect(useSessionStore.getState().overlayDisplay).toEqual({
      displayId: '1',
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      workArea: { x: 0, y: 23, width: 2560, height: 1417 },
      scaleFactor: 2,
    });

    render(createElement(BootstrappedScreenSourceOptions));

    expect(screen.getByLabelText('screen-source-options')).toHaveTextContent(
      'Entire Screen|VSCode',
    );
  });

  it('surfaces screen capture hydration errors without failing bootstrap', async () => {
    window.bridge.listScreenCaptureSources = vi.fn().mockRejectedValue(
      new Error('enumeration failed'),
    );

    await expect(bootstrapDesktopRenderer()).resolves.toBeUndefined();

    expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().lastRuntimeError).toBe('enumeration failed');
  });

  it('hydrates persisted messages into the visible conversation model on startup', async () => {
    window.bridge.listChatMessages = vi.fn().mockResolvedValue([
      {
        id: 'message-2',
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Stored answer',
        createdAt: '2026-03-12T09:02:00.000Z',
        sequence: 2,
      },
      {
        id: 'message-1',
        chatId: 'chat-1',
        role: 'user',
        contentText: 'Stored prompt',
        createdAt: '2026-03-12T09:01:00.000Z',
        sequence: 1,
      },
    ]);

    await bootstrapDesktopRenderer();

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'persisted-message-message-1',
        role: 'user',
        content: 'Stored prompt',
        state: 'complete',
        persistedMessageId: 'message-1',
      }),
      expect.objectContaining({
        id: 'persisted-message-message-2',
        role: 'assistant',
        content: 'Stored answer',
        state: 'complete',
        persistedMessageId: 'message-2',
      }),
    ]);
  });

});
