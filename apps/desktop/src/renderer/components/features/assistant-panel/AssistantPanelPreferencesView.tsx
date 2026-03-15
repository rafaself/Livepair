import { MessageSquareText, Palette, PanelRight, Timer } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  DEFAULT_DESKTOP_SETTINGS,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
  type DesktopVoice,
} from '../../../../shared';
import type { AssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import { useAssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import { FieldList } from '../../composite';
import { ViewSection } from '../../layout';
import { Button, Select, Switch, type SelectOptionItem } from '../../primitives';
import { ThemeToggle } from '../ThemeToggle';

const SILENCE_TIMEOUT_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'never', label: 'Never' },
  { value: '30s', label: '30 seconds' },
  { value: '3m', label: '3 minutes' },
];
const VOICE_OPTIONS: readonly SelectOptionItem[] = [
  { value: 'Puck', label: 'Puck' },
  { value: 'Kore', label: 'Kore' },
  { value: 'Aoede', label: 'Aoede' },
];


type PreferencesController = Pick<
  AssistantPanelSettingsController,
  | 'isPanelPinned'
  | 'themePreference'
  | 'speechSilenceTimeout'
  | 'chatTimestampVisibility'
  | 'voice'
  | 'systemInstruction'
  | 'togglePanelPinned'
  | 'setThemePreference'
  | 'setSpeechSilenceTimeout'
  | 'setChatTimestampVisibility'
  | 'setVoice'
  | 'setSystemInstruction'
  | 'restoreDefaultVoiceAndInstructions'
>;

export type AssistantPanelPreferencesViewProps = {
  controller: PreferencesController;
};

export function AssistantPanelPreferencesView({
  controller,
}: AssistantPanelPreferencesViewProps): JSX.Element {
  const {
    isPanelPinned,
    themePreference,
    speechSilenceTimeout,
    chatTimestampVisibility,
    voice,
    systemInstruction,
    togglePanelPinned,
    setThemePreference,
    setSpeechSilenceTimeout,
    setChatTimestampVisibility,
    setVoice,
    setSystemInstruction,
    restoreDefaultVoiceAndInstructions,
  } = controller;
  const instructionsId = useId();
  const [instructionsDraft, setInstructionsDraft] = useState(systemInstruction);

  useEffect(() => {
    setInstructionsDraft(systemInstruction);
  }, [systemInstruction]);

  const instructionsCharacterCount = instructionsDraft.length;
  const hasDefaultVoiceAndInstructions = useMemo(
    () =>
      voice === DEFAULT_DESKTOP_SETTINGS.voice
      && systemInstruction === DEFAULT_DESKTOP_SETTINGS.systemInstruction,
    [systemInstruction, voice],
  );

  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Preferences</h2>

      <div className="assistant-panel__settings-body">
        <ViewSection icon={Palette} title="Appearance">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Theme',
                value: (
                  <ThemeToggle
                    className="assistant-panel__settings-theme-toggle"
                    size="sm"
                    value={themePreference}
                    onChange={setThemePreference}
                  />
                ),
              },
              {
                label: 'Message timestamps',
                value: (
                  <Switch
                    aria-label="Message timestamps"
                    checked={chatTimestampVisibility === 'visible'}
                    className="assistant-panel__settings-switch"
                    onCheckedChange={(checked) =>
                      setChatTimestampVisibility(checked ? 'visible' : 'hidden')
                    }
                  />
                ),
              },
            ]}
          />
        </ViewSection>

        <ViewSection icon={PanelRight} title="Layout">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Lock panel',
                value: (
                  <Switch
                    aria-label="Lock panel"
                    checked={isPanelPinned}
                    className="assistant-panel__settings-switch"
                    onCheckedChange={() => togglePanelPinned()}
                  />
                ),
              },
            ]}
          />
        </ViewSection>

        <ViewSection icon={Timer} title="Session">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Silence timeout',
                value: (
                  <Select
                    aria-label="Silence timeout"
                    className="assistant-panel__settings-select assistant-panel__settings-audio-select"
                    options={SILENCE_TIMEOUT_OPTIONS}
                    value={speechSilenceTimeout}
                    onChange={(event) => {
                      const val = event.target.value;
                      if (val === 'never' || val === '30s' || val === '3m') {
                        setSpeechSilenceTimeout(val);
                      }
                    }}
                    size="sm"
                  />
                ),
              },
            ]}
          />
        </ViewSection>

        <ViewSection icon={MessageSquareText} title="Assistant">
          <FieldList
            className="assistant-panel__settings-field-list field-list--aligned-controls"
            items={[
              {
                label: 'Voice',
                value: (
                  <Select
                    aria-label="Voice"
                    className="assistant-panel__settings-select assistant-panel__settings-audio-select"
                    options={VOICE_OPTIONS}
                    value={voice}
                    onChange={(event) => {
                      const nextVoice = event.target.value;
                      if (
                        nextVoice === 'Puck'
                        || nextVoice === 'Kore'
                        || nextVoice === 'Aoede'
                      ) {
                        setVoice(nextVoice as DesktopVoice);
                      }
                    }}
                    size="sm"
                  />
                ),
              },
            ]}
          />

          <div className="assistant-panel__settings-persona-stack">
            <label
              className="assistant-panel__settings-persona-label"
              htmlFor={instructionsId}
            >
              Instructions
            </label>
            <textarea
              id={instructionsId}
              aria-label="Instructions"
              className="assistant-panel__settings-textarea"
              maxLength={MAX_SYSTEM_INSTRUCTION_LENGTH}
              value={instructionsDraft}
              onChange={(event) => {
                setInstructionsDraft(
                  event.currentTarget.value.slice(0, MAX_SYSTEM_INSTRUCTION_LENGTH),
                );
              }}
              onBlur={() => {
                if (instructionsDraft !== systemInstruction) {
                  setSystemInstruction(instructionsDraft);
                }
              }}
            />
            <div className="assistant-panel__settings-field-stack">
              <div className="assistant-panel__settings-persona-meta">
                <span className="assistant-panel__settings-hint">
                  Agent/system instructions used for future live sessions.
                </span>
                <output
                  aria-label="Instructions character count"
                  className="assistant-panel__settings-counter"
                >
                  {instructionsCharacterCount}/{MAX_SYSTEM_INSTRUCTION_LENGTH}
                </output>
              </div>
              <div className="assistant-panel__settings-persona-actions">
                <Button
                  aria-label="Restore defaults"
                  disabled={hasDefaultVoiceAndInstructions}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setInstructionsDraft(DEFAULT_DESKTOP_SETTINGS.systemInstruction);
                    restoreDefaultVoiceAndInstructions();
                  }}
                >
                  Restore defaults
                </Button>
              </div>
            </div>
          </div>
        </ViewSection>
      </div>
    </div>
  );
}

export function AssistantPanelPreferencesStandaloneView(): JSX.Element {
  const controller = useAssistantPanelSettingsController();
  return <AssistantPanelPreferencesView controller={controller} />;
}
