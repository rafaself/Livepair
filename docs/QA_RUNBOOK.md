# Manual QA Runbook

Last updated: 2026-03-12

This runbook defines the real-machine manual checks required before a release or demo sign-off.

## Scope

This runbook covers the current implemented product flows only:

- text happy path
- enter speech mode
- typed input inside speech mode
- speaking flow
- interruption
- transcription behavior
- screen context
- tool call behavior
- GoAway / resumption behavior
- mode switching
- panel closed while speech mode is active
- silence timeout behavior

This document does not change product behavior. It defines how to validate the current behavior on a developer machine.

## Pass Criteria

A release candidate is ready for manual sign-off only when:

- every required flow below is marked `Pass`, `Fail`, `Inconclusive`, or `Not run by config`
- every `Fail` and `Inconclusive` result is logged in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- no failed item is accepted without an owner and follow-up decision

## Test Environment

Run the checks on a real Linux desktop machine with:

- a working microphone
- system audio output enabled
- screen capture support and permission
- access to a valid Gemini-backed backend configuration

Use a dev build for this runbook. The `Developer tools` panel is only available in development mode and is required for several checks.

## Required Setup

1. Copy and fill the app env files if they do not already exist.
2. In `apps/api/.env`, provide a valid `GEMINI_API_KEY`.
3. In `apps/desktop/.env`, keep the required speech-mode values from `apps/desktop/.env.example` populated, especially `VITE_LIVE_MODEL`, and set these manual-QA flags:

```bash
OPEN_DEVTOOLS=true
VITE_LIVE_API_VERSION=v1alpha
VITE_LIVE_VOICE_RESPONSE_MODALITY=AUDIO
VITE_LIVE_INPUT_AUDIO_TRANSCRIPTION=true
VITE_LIVE_OUTPUT_AUDIO_TRANSCRIPTION=true
VITE_LIVE_SESSION_RESUMPTION=true
VITE_LIVE_CONTEXT_COMPRESSION=true
```

4. Start the backend:

```bash
pnpm --filter @livepair/api dev
```

5. Start the desktop app:

```bash
pnpm --filter @livepair/desktop dev
```

6. Grant microphone and screen permissions when prompted.
7. Open the panel with `Open panel`.
8. Confirm the `Developer tools` tab is visible in the panel header.

If either transcription flag is disabled, run the rest of the checklist but mark the transcription case `Not run by config`.

## Evidence To Capture

For every run, record:

- git commit under test
- date and tester name
- OS version
- input and output device used
- whether transcription flags were enabled
- screenshots or short recordings for any failure
- terminal logs from the API and desktop processes for any failure
- relevant values from the `Developer tools` panel for any speech, screen, tool, or resumption failure

## Failure Logging

For every failed or inconclusive result:

1. Add an entry to [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
2. Use the exact flow ID from this runbook.
3. Include repro steps, expected result, actual result, evidence path, and owner.
4. If a GitHub issue or PR exists, link it from the issue log entry.

Do not leave a failure only in chat or terminal scrollback.

## Preflight

Complete this before the flow-by-flow checks:

1. Verify the backend is reachable.
Expected result: the app opens without a startup crash and the `Developer tools` connection section does not remain in a failed backend state.

2. Open `Settings` and set `Silence timeout` to `3 minutes`.
Expected result: the setting persists immediately and speech mode should not auto-end during the main voice checks.

3. Open `Chat`.
Expected result: the composer is visible and shows `Start speech mode` when the input is empty.

## Flow Checklist

Use the following status values while executing the run:

- `Pass`
- `Fail`
- `Inconclusive`
- `Not run by config`

### QA-01 Text Happy Path

Steps:

1. Keep the app in text mode.
2. In the composer, enter `Summarize what Livepair can do today in three bullets.`
3. Submit the message.

Expected results:

- the user turn appears in the conversation immediately
- no session token request UI or speech-mode transition is required
- assistant text streams into the conversation
- the turn completes without the desktop entering speech mode
- no runtime error banner appears

Capture on failure:

- panel screenshot
- last API log lines around `POST /session/chat`

### QA-02 Enter Speech Mode

Steps:

1. Clear the composer so the mic action is visible.
2. Click `Start speech mode`.
3. Wait for the session to connect.

Expected results:

- the action changes to `Starting speech mode` and is temporarily disabled
- the panel shows `Live voice transcript`
- speech mode becomes active without an extra microphone click
- the dock shows microphone and screen-context controls
- `Developer tools` shows voice session `Ready` and voice capture active

Capture on failure:

- panel screenshot
- `Developer tools` values for `Voice session`, `Voice capture`, and `Token request`

### QA-03 Typed Input Inside Speech Mode

Steps:

1. Stay in active speech mode.
2. Type `Keep going, but answer in one sentence.` into the composer.
3. Submit the message.

Expected results:

- the typed user turn is added to the conversation
- speech mode stays active throughout the request
- the session does not tear down or fall back to text mode
- the assistant replies without losing voice-session readiness
- `Developer tools` still shows voice session `Ready` after the turn

Capture on failure:

- conversation screenshot
- `Developer tools` values for `Voice session` and `Session resumption`

### QA-04 Speaking Flow

Steps:

1. Stay in active speech mode.
2. Say `Tell me what you can help with right now.`
3. Wait for the assistant to speak back.

Expected results:

- the `Current voice turn` section updates with your live transcript
- the assistant audio plays through the selected output device
- the assistant transcript updates during or after playback
- when the turn completes, a durable assistant turn is visible in the conversation
- the app returns to a listening state after the response

Capture on failure:

- short screen recording if audio timing is part of the problem
- `Developer tools` values for `Voice capture`, `Voice playback`, and `Playback error`

### QA-05 Interruption

Steps:

1. Start a voice prompt that produces a spoken answer.
2. While the assistant is still speaking, speak over it with `Stop, I want to change direction.`

Expected results:

- assistant playback stops promptly
- the app does not disconnect the voice session
- speech state moves back toward listening after the interruption
- if the assistant had already produced partial transcript text, that latest partial text can remain as the final assistant turn

Capture on failure:

- short screen recording
- `Developer tools` values for `Voice playback`, `Voice session`, and `Resumption detail`

### QA-06 Transcription Behavior

Precondition:

- `VITE_LIVE_INPUT_AUDIO_TRANSCRIPTION=true`
- `VITE_LIVE_OUTPUT_AUDIO_TRANSCRIPTION=true`

Steps:

1. In speech mode, say `Transcription check: banana rocket calendar.`
2. Let the assistant finish one spoken response.
3. End speech mode.

Expected results:

- the `You` transcript updates while you speak
- the `Assistant` transcript updates when the assistant responds
- corrective updates overwrite older partial transcript text rather than duplicating it
- the completed assistant transcript is promoted into conversation history when the turn finishes
- ending the session clears the live voice transcript area for the next session

Capture on failure:

- screenshot before end-session and after end-session
- note whether the failure affected input transcript, output transcript, or transcript cleanup

### QA-07 Screen Context

Steps:

1. Enter speech mode if not already active.
2. Put a distinctive window on screen, such as a page with a unique heading.
3. In the dock, click `Start screen context`.
4. Ask `What can you see on my screen right now?`
5. After the answer, click `Stop screen context`.

Expected results:

- screen context can only be started while speech mode is active
- `Developer tools` screen state moves from `Disabled` to `Capturing` or `Streaming`
- frame count increases while screen context is active
- the answer references visible screen content instead of replying generically
- stopping screen context returns the state to `Disabled`
- the voice session stays active during start and stop

Capture on failure:

- screenshot of the visible screen content under test
- `Developer tools` values for `Screen state`, `Frame count`, `Last upload`, and `Screen error`

### QA-08 Tool Call Behavior

Note:

The current repo implements local voice-tool handling, but model-triggered tool use is not guaranteed on every prompt. Treat a missing tool invocation after repeated clear prompts as `Inconclusive`, not an automatic failure.

Steps:

1. Open `Developer tools`.
2. In speech mode, ask `Before you answer, verify the current mode using any available tool and tell me the current mode.`
3. Retry once with a similar prompt if no tool activity appears.

Expected results:

- if the model chooses a tool, `Tool state` leaves `Idle` and returns to `Idle`
- `Current tool` shows the invoked tool name
- the voice session remains `Ready`
- the assistant answer is still delivered after the tool path completes
- any unsupported tool attempt is surfaced as a visible tool error without crashing the session

Capture on failure or inconclusive result:

- full `Developer tools` screenshot
- the exact prompt used

### QA-09 GoAway / Resumption Behavior

Note:

Real-machine `GoAway` is timing-dependent. The practical validation target is session resumption after a transient live-session interruption while resumption is enabled.

Steps:

1. Open `Developer tools` and confirm `Session resumption` is visible.
2. Start speech mode and speak once so the session has live activity.
3. Trigger a brief live-session interruption:
   - preferred: disable network access for 3 to 5 seconds, then restore it
   - acceptable: reproduce a real `GoAway` or transport recycle if it occurs naturally during the session
4. Wait for recovery.

Expected results:

- if a resume handle is available and the interruption is recoverable, the session attempts to resume automatically
- `Session resumption` shows a non-idle transition such as `GoAway`, `Reconnecting`, or `Resumed`
- after recovery, speech mode remains usable without restarting the app
- if recovery fails, the app falls back to a safe text/off state with an explicit runtime error instead of hanging or crashing

Capture on failure:

- short recording of the interruption and recovery attempt
- `Developer tools` values for `Session resumption`, `Resumable`, `Latest handle`, `Token refreshing`, and `Durability detail`

### QA-10 Mode Switching

Steps:

1. In text mode, send `Give me a short answer.`
2. Before or after the text turn completes, clear the composer and click `Start speech mode`.
3. After the speech session is active, click `End speech mode`.
4. Send another text prompt.

Expected results:

- switching into speech mode does not leave text and speech active at the same time
- speech mode starts cleanly and auto-starts capture
- ending speech mode returns the product to text mode
- text sending still works after the speech session ends

Capture on failure:

- conversation screenshot
- `Developer tools` values for `Voice session` and `Session resumption`

### QA-11 Panel Closed While Speech Mode Is Active

Steps:

1. Start speech mode.
2. Click `Close panel`.
3. Use the dock controls while the panel is closed.
4. Reopen the panel with `Open panel`.

Expected results:

- closing the panel does not end speech mode
- the dock still shows microphone, screen-context, and end-session controls while speech mode is active
- microphone and screen-context controls still work from the dock
- reopening the panel shows the existing conversation and current transcript state instead of resetting the session

Capture on failure:

- short recording of the close and reopen sequence

### QA-12 Silence Timeout Behavior

Steps:

1. Open `Settings`.
2. Set `Silence timeout` to `30 seconds`.
3. Start speech mode.
4. Do not speak and do not send typed input for at least 35 seconds.
5. After the timeout case passes or fails, set `Silence timeout` back to `3 minutes`.

Expected results:

- the speech session shuts down cleanly after about 30 seconds of silence
- microphone capture stops
- the voice session disconnects cleanly
- the product returns to text mode
- no crash or hung intermediate state remains

Optional regression check:

- with `Silence timeout` set to `Never`, the app should stay in speech mode past 45 seconds of silence

Capture on failure:

- timestamped note of observed timeout duration
- `Developer tools` values for `Voice session`, `Voice capture`, and `Session resumption`

## Run Summary Template

Copy this block into the PR description or release notes when the run completes:

```md
## Manual QA Summary

- Commit:
- Tester:
- Date:
- Machine / OS:
- Backend env:
- Desktop env:

| Flow ID | Result | Notes |
| --- | --- | --- |
| QA-01 |  |  |
| QA-02 |  |  |
| QA-03 |  |  |
| QA-04 |  |  |
| QA-05 |  |  |
| QA-06 |  |  |
| QA-07 |  |  |
| QA-08 |  |  |
| QA-09 |  |  |
| QA-10 |  |  |
| QA-11 |  |  |
| QA-12 |  |  |
```
