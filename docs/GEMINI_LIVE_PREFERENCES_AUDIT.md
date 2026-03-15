# Gemini Live Preferences Audit (Wave B0)

This is an audit-only artifact for future voice and system-instruction preferences work.

No runtime behavior, UI behavior, or persistence behavior was changed in this wave.

## Current Gemini Live setup flow

1. Speech mode starts from the renderer.
   - `apps/desktop/src/renderer/runtime/useSessionRuntime.ts` calls `getDesktopSessionController()`, then `controller.startSession({ mode: 'speech' })`.
   - `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelController.ts` and `App.tsx` are the main UI entry points that reach that runtime API.

2. The desktop session controller assembles runtime dependencies.
   - `apps/desktop/src/renderer/runtime/sessionController.ts`
   - `createTransport` currently builds `createGeminiLiveTransport(...)`.
   - The only user setting already applied to transport creation is visual quality, via `settings.visualSessionQuality -> mediaResolutionOverride`.

3. Session lifecycle handles token acquisition and restore/fallback behavior.
   - `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts`
   - `apps/desktop/src/renderer/runtime/session/sessionVoiceConnection.ts`
   - `apps/desktop/src/renderer/runtime/voice/session/connectFallbackVoiceSession.ts`

4. Persisted Live-session bookkeeping is separate from Gemini Live connect config.
   - `apps/desktop/src/renderer/liveSessions/currentLiveSession.ts`
   - This creates, restores, updates, and ends backend `LiveSessionRecord`s through `window.bridge.createLiveSession/listLiveSessions/updateLiveSession/endLiveSession`.
   - The persisted record tracks resumption metadata and snapshots, not Gemini voice/instruction preferences.

5. The actual Gemini Live connect config is assembled in the renderer transport layer.
   - `apps/desktop/src/renderer/runtime/transport/liveConfig.ts`
   - `buildGeminiLiveConnectConfig(...)` returns the app's custom connect-config object.
   - `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.ts` calls that builder inside `GeminiLiveTransport.connect(...)`.

6. The SDK payload is finally mapped and sent here.
   - `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts`
   - `connectGeminiLiveSdkSession(...)` converts the app's custom config into Google SDK `LiveConnectConfig` and calls `ai.live.connect(...)`.

## Current Live session config

The current connect config is assembled from static env-backed Live config plus per-session resume state.

Source files:
- `apps/desktop/src/renderer/runtime/transport/liveConfig.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts`
- Verified shape in:
  - `apps/desktop/src/renderer/runtime/transport/liveConfig.test.ts`
  - `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.test.ts`

### Fields currently used

| Field | Current status | Where |
| --- | --- | --- |
| `model` | Used, env-driven | `liveConfig.ts` via `VITE_LIVE_MODEL` |
| `apiVersion` | Used, env-driven, validated to `v1alpha` today | `liveConfig.ts` |
| `responseModalities` | Used | `buildGeminiLiveConnectConfig(...)` |
| `inputAudioTranscription` | Supported by builder, only included when env enables it | `liveConfig.ts`, `geminiLiveSdkClient.ts` |
| `outputAudioTranscription` | Supported by builder, only included when env enables it | `liveConfig.ts`, `geminiLiveSdkClient.ts` |
| `mediaResolution` | Used | `liveConfig.ts`, overridden from settings in `sessionController.ts` |
| `sessionResumption` | Used for voice mode when enabled | `liveConfig.ts`, `geminiLiveTransport.ts` |
| `contextWindowCompression` | Used for voice mode when enabled | `liveConfig.ts`, `geminiLiveSdkClient.ts` |
| `tools` | Used for voice mode | `liveConfig.ts`, `geminiLiveSdkClient.ts` |
| `systemInstruction` | Not used | No current wiring |
| `speechConfig` | Not used | No current wiring |

### Current mode-specific behavior

- Text mode uses `responseModalities: ['TEXT']`.
- Voice mode uses `responseModalities: ['AUDIO']`.
- Voice mode may also include:
  - `mediaResolution`
  - `sessionResumption`
  - `contextWindowCompression`
  - `tools`

### Session resumption and related fields

Session resumption is implemented today.

Relevant files:
- `apps/desktop/src/renderer/runtime/transport/geminiLiveTransportInbound.ts`
- `apps/desktop/src/renderer/runtime/session/sessionTransportAssembly.ts`
- `apps/desktop/src/renderer/liveSessions/currentLiveSession.ts`
- `packages/shared-types/src/index.ts`

Current behavior:
- Gemini session resumption updates are consumed from SDK messages.
- Resume handles are persisted to backend `LiveSessionRecord.resumptionHandle`.
- Restore/fallback logic uses those persisted handles on the next speech-session startup.

## Current voice state

The current voice is **not explicitly configured in code**.

Evidence:
- `apps/desktop/src/renderer/runtime/transport/liveConfig.ts` does not define `systemInstruction`, `speechConfig`, or any voice-selection field in `GeminiLiveConnectConfig`.
- `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts` only maps:
  - `responseModalities`
  - `inputAudioTranscription`
  - `outputAudioTranscription`
  - `mediaResolution`
  - `sessionResumption`
  - `contextWindowCompression`
  - `tools`
- Repo search over `apps/desktop/src` found no current `systemInstruction`, `speechConfig`, or `voiceName` usage.

Because no `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` is set today, the runtime is implicitly using the documented default voice: `Puck`.

## Current Preferences implementation

### Where the Preferences tab UI lives

- `apps/desktop/src/renderer/store/uiStore.ts`
  - `PanelView` already includes `'preferences'`.
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanel.tsx`
  - Renders `AssistantPanelPreferencesView` when `panelView === 'preferences'`.
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanelPreferencesView.tsx`
  - Current Preferences UI sections:
    - Appearance
    - Layout
    - Session

### How preferences/state are modeled

- `apps/desktop/src/shared/settings.ts`
  - `DesktopSettings` is the app-local settings contract.
  - `DEFAULT_DESKTOP_SETTINGS` defines defaults.
  - `normalizeDesktopSettings(...)` and `normalizeDesktopSettingsPatch(...)` validate/normalize persisted values and patches.

- `apps/desktop/src/renderer/store/settingsStore.ts`
  - Zustand store for persisted settings.
  - `hydrate()` loads settings once from `window.bridge.getSettings()`.
  - `updateSetting(...)` and `updateSettings(...)` persist through `window.bridge.updateSettings(...)`.

- `apps/desktop/src/renderer/components/features/assistant-panel/settings/useAssistantPanelSettingsController.ts`
  - Central renderer controller for Settings/Preferences surfaces.
  - Reads from `useSettingsStore`.
  - Most simple settings use immediate `updateSetting(...)`.

### How persistence currently works

1. Renderer bootstraps settings:
   - `apps/desktop/src/renderer/bootstrap.ts`
   - Calls `useSettingsStore.getState().hydrate()`.

2. Preload exposes the bridge:
   - `apps/desktop/src/preload/preload.ts`
   - `getSettings` and `updateSettings` are thin `ipcRenderer.invoke(...)` wrappers.

3. Main validates and persists:
   - `apps/desktop/src/main/ipc/settings/registerSettingsIpcHandlers.ts`
   - `apps/desktop/src/main/ipc/validators/settingsValidators.ts`
   - `apps/desktop/src/main/settings/settingsService.ts`
   - `apps/desktop/src/main/settings/settingsRepository.ts`

4. Disk storage:
   - `settingsRepository.ts` writes JSON to:
     - `join(app.getPath('userData'), 'desktop-settings.json')`

### Best insertion points for future voice/instructions UI

Voice select:
- Best UI location:
  - `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanelPreferencesView.tsx`
- Best controller location:
  - `apps/desktop/src/renderer/components/features/assistant-panel/settings/useAssistantPanelSettingsController.ts`
- Best data contract:
  - `apps/desktop/src/shared/settings.ts`

Instructions textarea:
- Best UI location:
  - `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanelPreferencesView.tsx`
- Best controller/persistence path:
  - same settings controller and settings store path as other persisted preferences
- Draft-handling note:
  - a textarea should probably avoid calling `updateSettings(...)` on every keystroke
  - the smallest cohesive fit is a local draft in `AssistantPanelPreferencesView.tsx` (or a nearby preferences-specific hook) that commits on blur/save, similar in spirit to the delayed-write pattern already used for backend URL in `useAssistantPanelSettingsController.ts`

## Smallest cohesive future implementation path

Goal:
- `voice: 'Puck' | 'Kore' | 'Aoede'`
- `systemInstruction: string`
- persisted desktop preferences
- applied on the next Gemini Live session creation

### Recommended path

1. Extend desktop-local settings.
   - Add new fields to `apps/desktop/src/shared/settings.ts`:
     - `voice`
     - `systemInstruction`
   - Add defaults:
     - `voice: 'Puck'`
     - `systemInstruction: ''`
   - Extend normalizers and patch normalizers.

2. Extend main-process validation for the new keys.
   - `apps/desktop/src/main/ipc/validators/settingsValidators.ts`
   - Add strict validation for:
     - allowed voice enum
     - string instructions

3. Expose the new settings through the existing renderer settings stack.
   - `apps/desktop/src/renderer/store/settingsStore.ts`
   - `apps/desktop/src/renderer/components/features/assistant-panel/settings/useAssistantPanelSettingsController.ts`
   - `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanelPreferencesView.tsx`

4. Keep env-backed Live config and user-backed preferences separate.
   - Keep `apps/desktop/src/renderer/runtime/transport/liveConfig.ts` responsible for static/env-backed session config.
   - Do **not** fold user preferences into the env `LiveConfig` object.
   - Instead, extend `buildGeminiLiveConnectConfig(...)` options with preference overrides for:
     - `systemInstruction`
     - `voice`

5. Apply preferences at transport creation time so they affect the next session.
   - Best current insertion point:
     - `apps/desktop/src/renderer/runtime/sessionController.ts`
   - Rationale:
     - this file already reads `useSettingsStore.getState().settings.visualSessionQuality` when creating the transport
     - voice/instruction preferences can follow that same pattern
   - This keeps the change local to renderer runtime and makes the new values apply on the next speech-session startup without changing current-session behavior.

6. Pass the new config through the transport and SDK mapping layers.
   - `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.ts`
   - `apps/desktop/src/renderer/runtime/transport/liveConfig.ts`
   - `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts`

7. Map to the documented Google Live fields.
   - `systemInstruction`
   - `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`

## Exact files/modules involved

### Current files involved in the flow today

- `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
- `apps/desktop/src/renderer/runtime/sessionController.ts`
- `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts`
- `apps/desktop/src/renderer/runtime/session/sessionVoiceConnection.ts`
- `apps/desktop/src/renderer/runtime/voice/session/connectFallbackVoiceSession.ts`
- `apps/desktop/src/renderer/liveSessions/currentLiveSession.ts`
- `apps/desktop/src/renderer/runtime/transport/liveConfig.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveTransportInbound.ts`
- `packages/shared-types/src/index.ts`
- `apps/desktop/src/shared/settings.ts`
- `apps/desktop/src/renderer/store/settingsStore.ts`
- `apps/desktop/src/preload/preload.ts`
- `apps/desktop/src/main/ipc/settings/registerSettingsIpcHandlers.ts`
- `apps/desktop/src/main/ipc/validators/settingsValidators.ts`
- `apps/desktop/src/main/settings/settingsService.ts`
- `apps/desktop/src/main/settings/settingsRepository.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanel.tsx`
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanelPreferencesView.tsx`
- `apps/desktop/src/renderer/components/features/assistant-panel/settings/useAssistantPanelSettingsController.ts`
- `apps/desktop/src/renderer/store/uiStore.ts`

### Recommended future change set

- `apps/desktop/src/shared/settings.ts`
- `apps/desktop/src/main/ipc/validators/settingsValidators.ts`
- `apps/desktop/src/renderer/store/settingsStore.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/settings/useAssistantPanelSettingsController.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanelPreferencesView.tsx`
- `apps/desktop/src/renderer/runtime/sessionController.ts`
- `apps/desktop/src/renderer/runtime/transport/liveConfig.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts`

### Likely tests to update in later waves

- `apps/desktop/src/renderer/store/settingsStore.test.ts`
- `apps/desktop/src/main/settings/settingsRepository.test.ts`
- `apps/desktop/src/main/ipc/validators.test.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/settings/AssistantPanelSettingsView.test.tsx`
- `apps/desktop/src/renderer/components/features/assistant-panel/settings/useAssistantPanelSettingsController.test.tsx`
- `apps/desktop/src/renderer/runtime/transport/liveConfig.test.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.test.ts`

## Boundary notes for later waves

- Renderer/main/preload:
  - keep using the existing typed settings bridge
  - no new preload capability should be needed if this remains a settings-only change

- Desktop/backend:
  - voice and instructions can remain desktop-local preferences
  - no backend audio/video proxying should be introduced

- Shared contracts:
  - `packages/shared-types` does not need to change for the basic preference feature
  - only revisit backend/shared contracts if you later decide voice/instructions must be stored with backend `LiveSessionRecord`s

## What this audit could not verify from current code

- Whether future product requirements want voice/instructions persisted only locally or also recorded per backend `LiveSessionRecord`.
- Any Google-side semantics beyond the documented field names supplied for this audit.
