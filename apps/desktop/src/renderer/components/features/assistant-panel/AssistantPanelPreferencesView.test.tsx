import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DESKTOP_SETTINGS,
  DEFAULT_SYSTEM_INSTRUCTION,
} from '../../../../shared';
import { useSettingsStore } from '../../../store/settingsStore';
import { useUiStore } from '../../../store/uiStore';
import { resetDesktopStores } from '../../../test/store';
import { AssistantPanelPreferencesStandaloneView } from './AssistantPanelPreferencesView';

const OVERLAY_DISPLAY = {
  displayId: '1',
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  workArea: { x: 0, y: 23, width: 2560, height: 1417 },
  scaleFactor: 2,
} as const;

function renderPreferences(settings = DEFAULT_DESKTOP_SETTINGS) {
  useSettingsStore.setState({
    settings,
    isReady: true,
  });
  useUiStore.getState().initializeSettingsUi(settings);

  return render(<AssistantPanelPreferencesStandaloneView />);
}

describe('AssistantPanelPreferencesView', () => {
  beforeEach(() => {
    resetDesktopStores();
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [],
      selectedSourceId: null,
      overlayDisplay: OVERLAY_DISPLAY,
    }));
  });

  it('renders persisted voice and instructions values with helper copy and a counter', () => {
    renderPreferences({
      ...DEFAULT_DESKTOP_SETTINGS,
      voice: 'Kore',
      systemInstruction: 'Keep answers short.',
    });

    expect(screen.getByRole('button', { name: 'Voice' })).toHaveTextContent('Kore');
    expect(
      screen.getByRole('textbox', {
        name: 'Instructions',
      }),
    ).toHaveValue('Keep answers short.');
    expect(
      screen.getByText('Agent/system instructions used for future live sessions.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent('19/1200');
  });

  it('persists voice changes through the settings bridge', async () => {
    renderPreferences();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Voice' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Aoede' }));
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({ voice: 'Aoede' });
    });
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveTextContent('Aoede');
  });

  it('updates the instructions counter while typing and persists on blur', async () => {
    renderPreferences({
      ...DEFAULT_DESKTOP_SETTINGS,
      systemInstruction: 'abc',
    });

    const instructions = screen.getByRole('textbox', { name: 'Instructions' });

    fireEvent.change(instructions, { target: { value: 'abcd' } });

    expect(instructions).toHaveValue('abcd');
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent('4/1200');
    expect(window.bridge.updateSettings).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.blur(instructions);
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        systemInstruction: 'abcd',
      });
    });
  });

  it('persists empty instructions on blur', async () => {
    renderPreferences({
      ...DEFAULT_DESKTOP_SETTINGS,
      systemInstruction: 'Custom instruction',
    });

    const instructions = screen.getByRole('textbox', { name: 'Instructions' });
    fireEvent.change(instructions, { target: { value: '' } });

    await act(async () => {
      fireEvent.blur(instructions);
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        systemInstruction: '',
      });
    });
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent('0/1200');
  });

  it('enforces the 1200 character limit in the UI', async () => {
    renderPreferences();

    const instructions = screen.getByRole('textbox', { name: 'Instructions' });
    const oversizedValue = 'x'.repeat(1300);

    fireEvent.change(instructions, { target: { value: oversizedValue } });

    expect(instructions).toHaveValue('x'.repeat(1200));
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent('1200/1200');

    await act(async () => {
      fireEvent.blur(instructions);
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        systemInstruction: 'x'.repeat(1200),
      });
    });
  });

  it('restores the default voice and instructions', async () => {
    renderPreferences({
      ...DEFAULT_DESKTOP_SETTINGS,
      voice: 'Aoede',
      systemInstruction: 'Custom instruction',
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        voice: 'Puck',
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
      });
    });

    expect(screen.getByRole('button', { name: 'Voice' })).toHaveTextContent('Puck');
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toHaveValue(
      DEFAULT_SYSTEM_INSTRUCTION,
    );
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent(
      `${DEFAULT_SYSTEM_INSTRUCTION.length}/1200`,
    );
  });
});
