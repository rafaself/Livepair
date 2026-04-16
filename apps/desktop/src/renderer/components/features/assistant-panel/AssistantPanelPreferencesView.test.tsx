import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DESKTOP_SETTINGS,
  DEFAULT_SYSTEM_INSTRUCTION,
  getMaxUserSystemInstructionLength,
} from '../../../../shared';
import { useSettingsStore } from '../../../store/settingsStore';
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

  return render(<AssistantPanelPreferencesStandaloneView />);
}

describe('AssistantPanelPreferencesView', () => {
  const groundedInstructionBudget = getMaxUserSystemInstructionLength({
    groundingEnabled: true,
  });
  const ungroundedInstructionBudget = getMaxUserSystemInstructionLength({
    groundingEnabled: false,
  });

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

  it('renders persisted voice and instructions values with tooltips and a counter', async () => {
    renderPreferences({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: true,
      voice: 'Kore',
      systemInstruction: 'Keep answers short.',
    });

    expect(screen.getByRole('button', { name: 'Voice' })).toHaveTextContent('Kore');
    expect(
      screen.getByRole('textbox', {
        name: 'Instructions',
      }),
    ).toHaveValue('Keep answers short.');
    expect(screen.getByRole('switch', { name: 'Grounding' })).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.queryByText('Agent/system instructions used for future live sessions.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Uses project knowledge and Google Search for future live sessions.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore defaults' })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.mouseEnter(screen.getByLabelText('About lock panel'));
    });
    expect(
      screen.getByText('Keep the panel open when the app window loses focus.'),
    ).toBeVisible();
    await act(async () => {
      fireEvent.mouseEnter(screen.getByLabelText('About silence timeout'));
    });
    expect(
      screen.getByText('Automatically end speech mode after this much silence.'),
    ).toBeVisible();
    await act(async () => {
      fireEvent.mouseEnter(screen.getByLabelText('About grounding'));
    });
    expect(
      screen.getByText('Uses project knowledge and Google Search for future live sessions.'),
    ).toBeVisible();
    await act(async () => {
      fireEvent.mouseEnter(screen.getByLabelText('About voice'));
    });
    expect(
      screen.getByText('Choose the voice used for future live sessions.'),
    ).toBeVisible();
    await act(async () => {
      fireEvent.mouseEnter(screen.getByLabelText('About instructions'));
    });
    expect(
      screen.getByText('Agent/system instructions used for future live sessions.'),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toHaveAttribute(
      'maxlength',
      String(groundedInstructionBudget),
    );
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent(
      `19/${groundedInstructionBudget}`,
    );
  });

  it('persists grounding changes through the settings bridge', async () => {
    renderPreferences();
    const instructions = screen.getByRole('textbox', { name: 'Instructions' });

    expect(instructions).toHaveAttribute('maxlength', String(ungroundedInstructionBudget));
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent(
      `${DEFAULT_SYSTEM_INSTRUCTION.length}/${ungroundedInstructionBudget}`,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Grounding' }));
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({ groundingEnabled: true });
    });
    expect(screen.getByRole('switch', { name: 'Grounding' })).toHaveAttribute('aria-checked', 'true');
    expect(instructions).toHaveAttribute('maxlength', String(groundedInstructionBudget));
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent(
      `${DEFAULT_SYSTEM_INSTRUCTION.length}/${groundedInstructionBudget}`,
    );
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
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent(
      `4/${ungroundedInstructionBudget}`,
    );
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

  it('round-trips empty instructions on blur back to the default instruction', async () => {
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
    expect(instructions).toHaveValue(DEFAULT_SYSTEM_INSTRUCTION);
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent(
      `${DEFAULT_SYSTEM_INSTRUCTION.length}/${ungroundedInstructionBudget}`,
    );
  });

  it('enforces the dynamic instruction budget in the UI', async () => {
    renderPreferences({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: true,
    });

    const instructions = screen.getByRole('textbox', { name: 'Instructions' });
    const oversizedValue = 'x'.repeat(groundedInstructionBudget + 100);

    fireEvent.change(instructions, { target: { value: oversizedValue } });

    expect(instructions).toHaveValue('x'.repeat(groundedInstructionBudget));
    expect(instructions).toHaveAttribute('maxlength', String(groundedInstructionBudget));
    expect(screen.getByLabelText('Instructions character count')).toHaveTextContent(
      `${groundedInstructionBudget}/${groundedInstructionBudget}`,
    );

    await act(async () => {
      fireEvent.blur(instructions);
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        systemInstruction: 'x'.repeat(groundedInstructionBudget),
      });
    });
  });

});
