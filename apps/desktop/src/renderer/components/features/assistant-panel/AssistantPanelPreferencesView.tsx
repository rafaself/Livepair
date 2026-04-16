import { MessageSquareText, Palette, PanelRight, Timer } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  getMaxUserSystemInstructionLength,
  type DesktopVoice,
} from '../../../../shared';
import type { AssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import { useAssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import { FieldList } from '../../composite';
import { ViewSection } from '../../layout';
import { Select, Switch, Tooltip, type SelectOptionItem } from '../../primitives';
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

function renderLabelWithTooltip(
  text: string,
  content: string,
  label: string,
): JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {text}
      <Tooltip content={content} label={label} />
    </span>
  );
}


type PreferencesController = Pick<
  AssistantPanelSettingsController,
  | 'isPanelPinned'
  | 'themePreference'
  | 'speechSilenceTimeout'
  | 'chatTimestampVisibility'
  | 'groundingEnabled'
  | 'voice'
  | 'systemInstruction'
  | 'togglePanelPinned'
  | 'setThemePreference'
  | 'setSpeechSilenceTimeout'
  | 'setChatTimestampVisibility'
  | 'setGroundingEnabled'
  | 'setVoice'
  | 'setSystemInstruction'
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
    groundingEnabled,
    voice,
    systemInstruction,
    togglePanelPinned,
    setThemePreference,
    setSpeechSilenceTimeout,
    setChatTimestampVisibility,
    setGroundingEnabled,
    setVoice,
    setSystemInstruction,
  } = controller;
  const instructionsId = useId();
  const [instructionsDraft, setInstructionsDraft] = useState(systemInstruction);

  useEffect(() => {
    setInstructionsDraft(systemInstruction);
  }, [systemInstruction]);

  const instructionsMaxLength = getMaxUserSystemInstructionLength({
    groundingEnabled,
  });
  const instructionsCharacterCount = instructionsDraft.length;

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
                label: 'Show message timestamps',
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
                label: renderLabelWithTooltip(
                  'Lock panel',
                  'Keep the panel open when the app window loses focus.',
                  'About lock panel',
                ),
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
                label: renderLabelWithTooltip(
                  'Silence timeout',
                  'Automatically end speech mode after this much silence.',
                  'About silence timeout',
                ),
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
                label: renderLabelWithTooltip(
                  'Grounding',
                  'Uses project knowledge and Google Search for future live sessions.',
                  'About grounding',
                ),
                value: (
                  <Switch
                    aria-label="Grounding"
                    checked={groundingEnabled}
                    className="assistant-panel__settings-switch"
                    onCheckedChange={setGroundingEnabled}
                  />
                ),
              },
              {
                label: renderLabelWithTooltip(
                  'Voice',
                  'Choose the voice used for future live sessions.',
                  'About voice',
                ),
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
              {renderLabelWithTooltip(
                'Instructions',
                'Agent/system instructions used for future live sessions.',
                'About instructions',
              )}
            </label>
            <textarea
              id={instructionsId}
              aria-label="Instructions"
              autoCapitalize="off"
              autoCorrect="off"
              className="assistant-panel__settings-textarea"
              maxLength={instructionsMaxLength}
              spellCheck={false}
              value={instructionsDraft}
              onChange={(event) => {
                setInstructionsDraft(
                  event.currentTarget.value.slice(0, instructionsMaxLength),
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
                <output
                  aria-label="Instructions character count"
                  className="assistant-panel__settings-counter"
                >
                  {instructionsCharacterCount}/{instructionsMaxLength}
                </output>
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
