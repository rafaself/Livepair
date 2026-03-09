import { Monitor } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import { FieldList } from '../composite';
import { ViewSection } from '../layout';
import { Badge, Select } from '../primitives';
import { useUiStore } from '../../store/uiStore';

type DisplaySettingsController = Pick<
  AssistantPanelSettingsController,
  | 'captureDisplayOptions'
  | 'overlayDisplayOptions'
  | 'selectedCaptureDisplayId'
  | 'selectedOverlayDisplayId'
  | 'setSelectedCaptureDisplayId'
  | 'setSelectedOverlayDisplayId'
  | 'displayIssueSummaries'
>;

export type AssistantPanelDisplaySettingsSectionProps = {
  controller: DisplaySettingsController;
};

export function AssistantPanelDisplaySettingsSection({
  controller,
}: AssistantPanelDisplaySettingsSectionProps): JSX.Element {
  const {
    captureDisplayOptions,
    overlayDisplayOptions,
    selectedCaptureDisplayId,
    selectedOverlayDisplayId,
    setSelectedCaptureDisplayId,
    setSelectedOverlayDisplayId,
    displayIssueSummaries,
  } = controller;
  const settingsFocusTarget = useUiStore((state) => state.settingsFocusTarget);
  const clearSettingsFocusTarget = useUiStore((state) => state.clearSettingsFocusTarget);
  const sectionRef = useRef<HTMLElement | null>(null);
  const captureSelectRef = useRef<HTMLButtonElement | null>(null);
  const overlaySelectRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (settingsFocusTarget === null) {
      return;
    }

    const focusTarget =
      settingsFocusTarget === 'capture-display' ? captureSelectRef.current : overlaySelectRef.current;

    sectionRef.current?.scrollIntoView?.({ block: 'center' });
    focusTarget?.focus();
    clearSettingsFocusTarget();
  }, [clearSettingsFocusTarget, settingsFocusTarget]);

  return (
    <ViewSection icon={Monitor} title="Display" ref={sectionRef}>
      <FieldList
        className="assistant-panel__settings-field-list field-list--aligned-controls"
        items={[
          {
            label: 'Screen capture',
            value: (
              <Select
                ref={captureSelectRef}
                aria-label="Screen capture display"
                className="assistant-panel__settings-select assistant-panel__settings-display-select"
                options={captureDisplayOptions}
                value={selectedCaptureDisplayId}
                onChange={(event) => {
                  setSelectedCaptureDisplayId(event.target.value);
                }}
                size="sm"
              />
            ),
          },
          {
            label: 'Dock and panel',
            value: (
              <Select
                ref={overlaySelectRef}
                aria-label="Dock and panel display"
                className="assistant-panel__settings-select assistant-panel__settings-display-select"
                options={overlayDisplayOptions}
                value={selectedOverlayDisplayId}
                onChange={(event) => {
                  setSelectedOverlayDisplayId(event.target.value);
                }}
                size="sm"
              />
            ),
          },
        ]}
      />

      {displayIssueSummaries.length > 0 ? (
        <div className="assistant-panel__settings-issues" role="status" aria-live="polite">
          {displayIssueSummaries.map((summary) => (
            <p key={summary} className="assistant-panel__settings-issue">
              <Badge variant="warning">Warning</Badge>
              <span>{summary}</span>
            </p>
          ))}
        </div>
      ) : null}
    </ViewSection>
  );
}
