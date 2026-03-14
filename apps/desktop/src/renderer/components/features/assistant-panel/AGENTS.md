# assistant-panel AGENTS.md

## Scope
Applies to `apps/desktop/src/renderer/components/features/assistant-panel/`.

## Local conventions
- Keep `useAssistantPanelController.ts` as the public composition hook for `AssistantPanel.tsx`; preserve its return shape when extracting internals.
- Keep `AssistantPanel.tsx` as a composition shell; move chat-session loading and shared chat/history navigation into adjacent `useAssistantPanel*` hooks instead of re-growing the component.
- Place controller sub-concerns in adjacent `useAssistantPanel*` helpers grouped by responsibility instead of growing the top-level controller again.
- Keep view-owned async loading in the view module that renders it (`chat/`, `history/`, `settings/`, `debug/`) unless multiple assistant-panel surfaces truly share the behavior.
- Add focused hook tests beside extracted helpers before widening controller-level regression coverage.
