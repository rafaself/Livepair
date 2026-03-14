import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAssistantPanelSharedViewNavigation } from './useAssistantPanelSharedViewNavigation';

describe('useAssistantPanelSharedViewNavigation', () => {
  it('switches to a selected chat and returns the panel to chat view', async () => {
    const setPanelView = vi.fn();
    const switchToChat = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useAssistantPanelSharedViewNavigation({
        setPanelView,
        resetChatSessionData: vi.fn(),
        switchToChat,
        createAndSwitchToNewChat: vi.fn(async () => undefined),
      }),
    );

    await act(async () => {
      await result.current.handleSelectChat('chat-1');
    });

    expect(switchToChat).toHaveBeenCalledWith('chat-1');
    expect(setPanelView).toHaveBeenCalledWith('chat');
  });

  it('clears existing chat session data before creating a new chat and reopening chat view', async () => {
    const setPanelView = vi.fn();
    const resetChatSessionData = vi.fn();
    const createAndSwitchToNewChat = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useAssistantPanelSharedViewNavigation({
        setPanelView,
        resetChatSessionData,
        switchToChat: vi.fn(async () => undefined),
        createAndSwitchToNewChat,
      }),
    );

    await act(async () => {
      await result.current.handleCreateChat();
    });

    const [resetOrder] = resetChatSessionData.mock.invocationCallOrder;
    const [createOrder] = createAndSwitchToNewChat.mock.invocationCallOrder;

    expect(resetChatSessionData).toHaveBeenCalledTimes(1);
    expect(setPanelView).toHaveBeenCalledWith('chat');
    expect(createAndSwitchToNewChat).toHaveBeenCalledTimes(1);
    expect(resetOrder).toBeDefined();
    expect(createOrder).toBeDefined();
    expect(resetOrder!).toBeLessThan(createOrder!);
  });

  it('routes back-navigation through panel view mutations only', () => {
    const setPanelView = vi.fn();
    const { result } = renderHook(() =>
      useAssistantPanelSharedViewNavigation({
        setPanelView,
        resetChatSessionData: vi.fn(),
        switchToChat: vi.fn(async () => undefined),
        createAndSwitchToNewChat: vi.fn(async () => undefined),
      }),
    );

    act(() => {
      result.current.handleBackToHistory();
      result.current.handleBackToChat();
    });

    expect(setPanelView).toHaveBeenNthCalledWith(1, 'history');
    expect(setPanelView).toHaveBeenNthCalledWith(2, 'chat');
  });
});
