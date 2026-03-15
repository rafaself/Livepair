# Ephemeral Token Audit — Wave A0

Scope: audit only. This document maps the current `POST /session/token` flow, records the implemented contract, compares it with current Google guidance, and proposes a hardening-ready target contract for later waves. No runtime behavior changes are included in this wave.

## Current flow

### End-to-end call path

Initial speech-session start:

1. `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanel.tsx`
2. `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelController.ts`
3. `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
4. `apps/desktop/src/renderer/runtime/session/sessionPublicApi.ts`
5. `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts`
6. `apps/desktop/src/renderer/runtime/session/sessionTransportAssembly.ts`
7. `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`
8. `apps/desktop/src/renderer/api/backend.ts`
9. `apps/desktop/src/preload/preload.ts`
10. `apps/desktop/src/main/ipc/session/registerSessionIpcHandlers.ts`
11. `apps/desktop/src/main/backend/backendClient.ts`
12. `apps/api/src/session/session.controller.ts`
13. `apps/api/src/session/session.service.ts`
14. `apps/api/src/session/gemini-auth-token.client.ts`
15. Google Gemini Developer API `POST https://generativelanguage.googleapis.com/v1alpha/auth_tokens`

Resume / reconnect refresh path:

1. `apps/desktop/src/renderer/runtime/transport/transportEventRouterSessionHandlers.ts`
2. `apps/desktop/src/renderer/runtime/voice/session/voiceResumeController.ts`
3. `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`
4. Then the same desktop → backend → Gemini path above.

### Implemented backend ownership boundary

- The backend only issues the ephemeral token and never proxies realtime audio/video/frame traffic.
- The desktop connects directly to Gemini Live with the issued token.

That matches the repo architecture guidance in `AGENTS.md`, `WATCHOUTS.md`, and `docs/ARCHITECTURE.md`.

## Current contract

### Backend HTTP contract

Route:

- `POST /session/token` via `SessionController.createToken()`

Request shape:

```json
{
  "sessionId": "optional string"
}
```

Evidence:

- Shared contract: `packages/shared-types/src/index.ts`
- API DTO: `apps/api/src/session/dto/create-ephemeral-token.dto.ts`
- Desktop IPC validator: `apps/desktop/src/main/ipc/validators/sessionValidators.ts`

Important current behavior:

- `sessionId` is accepted but currently unused by the backend service. `SessionService.createEphemeralToken()` receives `_req` and does not read it.
- The desktop runtime currently requests tokens with `{}` in both the initial start and refresh flows; it does not pass `sessionId`.

Validation behavior:

- API: Nest global `ValidationPipe({ whitelist: true })` strips unknown fields and rejects invalid `sessionId` types with HTTP 400.
- Desktop main IPC: rejects non-object payloads, unknown keys, and non-string `sessionId` with `Error('Invalid token request payload')` before the HTTP request is made.

Response shape:

```json
{
  "token": "string",
  "expireTime": "ISO-8601 timestamp",
  "newSessionExpireTime": "ISO-8601 timestamp"
}
```

Evidence:

- Shared contract: `packages/shared-types/src/index.ts`
- API service mapping: `apps/api/src/session/session.service.ts`
- Desktop response parser: `apps/desktop/src/main/backend/backendClient.ts`

Current token configuration sent to Gemini:

```json
{
  "uses": 1,
  "newSessionExpireTime": "<now + EPHEMERAL_TOKEN_TTL_SECONDS>",
  "expireTime": "<now + EPHEMERAL_TOKEN_TTL_SECONDS + 30m>"
}
```

Notes:

- `uses` is hard-coded to `1`.
- `newSessionExpireTime` defaults to `now + 60s` because `EPHEMERAL_TOKEN_TTL_SECONDS` defaults to `60`.
- `expireTime` defaults to `now + 31m` with current defaults, because the code adds the start window and then another 30 minutes.
- No `liveConnectConstraints` / `LiveEphemeralParameters` / field-locking data is sent today.
- No model/config restrictions are enforced at token issuance time.

Evidence:

- `apps/api/src/config/env.ts`
- `apps/api/.env.example`
- `apps/api/src/session/session.service.ts`
- `apps/api/src/session/gemini-auth-token.client.ts`
- `apps/api/src/session/gemini-auth-token.client.spec.ts`

### Desktop consumer contract

The token endpoint is consumed only by the speech runtime.

Current consumers:

- Initial voice-session bootstrap:
  - `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts`
  - `apps/desktop/src/renderer/runtime/session/sessionTransportAssembly.ts`
  - `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`
- Token refresh before resume/reconnect:
  - `apps/desktop/src/renderer/runtime/transport/transportEventRouterSessionHandlers.ts`
  - `apps/desktop/src/renderer/runtime/voice/session/voiceResumeController.ts`
  - `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`

How the desktop uses the response:

- `token` is passed to the Gemini JS SDK as the `apiKey` for direct `ai.live.connect(...)`.
- `expireTime` and `newSessionExpireTime` are logged, stored in runtime durability state, and exposed in debug state.
- `expireTime` is also used to decide whether a token is still valid for reconnects with a 60-second leeway.
- `newSessionExpireTime` is not used for any proactive runtime behavior after parsing; it is only surfaced in state/logging.

Evidence:

- `apps/desktop/src/main/backend/backendClient.ts`
- `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`
- `apps/desktop/src/renderer/runtime/voice/session/voiceSessionToken.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveTransport.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts`

### Current Gemini Live setup actually used by the desktop

The token itself is unconstrained, but the desktop currently builds a v1alpha constrained-session connection with renderer-owned env/config:

- model from `VITE_LIVE_MODEL`
- API version `VITE_LIVE_API_VERSION` and speech-mode guard requiring `v1alpha`
- voice response modality `AUDIO`
- optional input/output audio transcription flags
- media resolution, default `MEDIA_RESOLUTION_LOW`
- session resumption, default enabled
- context window compression, default enabled
- local tool declarations in voice mode

Evidence:

- `apps/desktop/.env.example`
- `apps/desktop/src/renderer/runtime/transport/liveConfig.ts`
- `apps/desktop/src/renderer/runtime/transport/geminiLiveSdkClient.ts`

## Error paths

### Backend route / service

- HTTP 400: invalid request body (for example `sessionId: 123`)
  - Evidence: `apps/api/src/app.e2e.spec.ts`, `apps/api/src/observability/observability.http.spec.ts`
- HTTP 503: missing `GEMINI_API_KEY`
  - Evidence: `apps/api/src/session/session.service.ts`
- HTTP 502: Gemini token request network failure
  - Evidence: `apps/api/src/session/gemini-auth-token.client.ts`
- HTTP 502: Gemini upstream non-OK response
  - Evidence: `apps/api/src/session/gemini-auth-token.client.ts`
- HTTP 502: malformed Gemini payload or blank `name`
  - Evidence: `apps/api/src/session/gemini-auth-token.client.ts`, `apps/api/src/session/gemini-auth-token.client.spec.ts`

### Desktop main / renderer

- IPC-layer rejection before HTTP:
  - `Error('Invalid token request payload')`
- HTTP non-OK from backend:
  - `Error('Token request failed: <status> - <detail>')`
- Invalid JSON body from backend:
  - `Error('Token response was invalid')`
- Already-expired timestamps from backend:
  - `Error('Token response was expired before Live connect')`

Evidence:

- `apps/desktop/src/main/ipc/session/registerSessionIpcHandlers.ts`
- `apps/desktop/src/main/backend/backendClient.ts`
- `apps/desktop/src/main/backend/backendClient.test.ts`

### Runtime error handling

Initial token request failure:

- `voiceTokenManager.request()` sets:
  - `tokenRequestState = 'error'`
  - `backendState = 'failed'`
  - durability `tokenValid = false`, `tokenRefreshFailed = true`
  - session event `session.token.request.failed`
  - `lastRuntimeError` through the injected `onError`
- `startSessionInternal()` then aborts session start if no token is returned.

Refresh failure during resume:

- `voiceTokenManager.refresh()` sets durability `tokenValid = false`, `tokenRefreshFailed = true`
- `voiceResumeController.resume()` marks resumption `resumeFailed`, clears in-flight resumption, and surfaces the failure detail as a runtime error.

UI/debug surfacing:

- token state becomes `Requesting token...`, `Token received`, or `Connection failed`
- assistant runtime state becomes `error` when token request fails
- debug panel exposes backend state, token feedback, resumption state, and durability timestamps

Evidence:

- `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`
- `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts`
- `apps/desktop/src/renderer/runtime/voice/session/voiceResumeController.ts`
- `apps/desktop/src/renderer/runtime/selectors.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanel.tsx`

## Expiration and session-lifetime handling

What is implemented today:

- Initial token parsing rejects tokens that are already expired before Live connect begins.
- Long-lived sessions rely on Gemini Live `go-away` / connection termination events plus session resumption.
- When the runtime needs to reconnect and the current token is within 60 seconds of expiry, it requests a fresh token before resume.
- Session resumption handles are stored and updated from Gemini `session-resumption-update` events.

What is not implemented today:

- No proactive renewal timer based on `expireTime` during a healthy connection.
- No runtime behavior keyed off `newSessionExpireTime`.
- No backend-side issuance constraints tying the token to the renderer’s actual model/config/tool setup.

Evidence:

- `apps/desktop/src/renderer/runtime/voice/session/voiceSessionToken.ts`
- `apps/desktop/src/renderer/runtime/voice/session/voiceResumeController.ts`
- `apps/desktop/src/renderer/runtime/transport/transportEventRouterSessionHandlers.ts`
- `apps/desktop/src/renderer/runtime/sessionController.resumption.test.ts`

## Env vars, configuration, and secrets involved

Backend:

- `GEMINI_API_KEY` — server-side secret used to mint Gemini auth tokens
- `EPHEMERAL_TOKEN_TTL_SECONDS` — start-window TTL for `newSessionExpireTime` (default 60)
- `HOST`, `PORT` — route exposure only

Desktop / consumer-side config affecting the eventual Live session:

- `backendUrl` desktop setting — selects which backend base URL receives `/session/token`
- `VITE_LIVE_MODEL`
- `VITE_LIVE_API_VERSION`
- `VITE_LIVE_VOICE_RESPONSE_MODALITY`
- `VITE_LIVE_INPUT_AUDIO_TRANSCRIPTION`
- `VITE_LIVE_OUTPUT_AUDIO_TRANSCRIPTION`
- `VITE_LIVE_MEDIA_RESOLUTION`
- `VITE_LIVE_SESSION_RESUMPTION`
- `VITE_LIVE_CONTEXT_COMPRESSION`

## Risks in the current implementation

1. Missing backend authentication
   - Google recommends secure backend authentication before provisioning ephemeral tokens.
   - Current API route has no auth guard, no auth decorator, and no caller identity check.

2. No rate limiting
   - No throttler/rate-limiter is wired into the Nest app or token controller.
   - Any caller that can reach the backend can request tokens repeatedly.

3. Token is broader than necessary
   - The backend does not constrain the token to the specific Live setup.
   - The renderer chooses model/config/tools at connect time, so the minted token is reusable with any compatible Live v1alpha configuration.

4. Token lifetime is slightly longer than Google’s default example
   - Google documents a default `expireTime` of 30 minutes in the future and `newSessionExpireTime` of 1 minute in the future.
   - Current code effectively sets the token lifetime to `TTL + 30m`, which is 31 minutes with defaults.

5. Missing server-owned Live setup constraints
   - No model lock
   - No response-modality lock
   - No tool/config lock
   - No server-side enforcement that token setup matches desktop env

6. Weak request contract semantics
   - `sessionId` exists in the contract but is not used.
   - The request carries no caller identity, reason (`start` vs `resume`), or correlation metadata.

7. Observability is minimal for security operations
   - Current metrics cover request counts/duration and upstream token outcomes.
   - There is no request ID, user/session identity, rate-limit visibility, or structured audit trail for token issuance.

8. Expiration handling is partial
   - Resume-time refresh is implemented.
   - Initial-connect and healthy-session flows do not use `newSessionExpireTime` beyond storage/logging.

## Gap analysis vs current Google guidance

Aligned:

- The backend, not the client, holds `GEMINI_API_KEY`.
- The desktop connects directly to Gemini Live instead of routing media through the backend.
- Tokens are single-use (`uses: 1`).
- The speech path requires `v1alpha`, which matches current ephemeral-token support.
- The runtime already treats reconnect/resume as normal and refreshes the token before resume when needed.

Gaps:

- Google says the client should authenticate to the backend before the backend provisions the token; this route currently has no backend auth.
- Google recommends keeping ephemeral token lifetime short; the backend adds the session start window on top of the 30-minute window.
- Google documents locking ephemeral tokens to a specific Live setup/model/config; the current backend does not send any constraints.
- Google guidance emphasizes secure client-to-server issuance and reduced exposure; current route has no rate limiting or issuer-side audit context.

Official references reviewed:

- Gemini ephemeral tokens: <https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens>
- Live session management: <https://ai.google.dev/gemini-api/docs/live-api/session-management>
- JS SDK token docs: <https://googleapis.github.io/js-genai/release_docs/classes/tokens.Tokens.html>

## Recommended target contract for later waves

This is a proposal only for the hardening waves; it is not implemented in Wave A0.

### Proposed request

`POST /session/token`

Headers:

- `Authorization: Bearer <backend-authenticated desktop session>`
- `X-Request-Id: <uuid>` (optional but recommended for tracing)

Body:

```json
{
  "purpose": "start" | "resume",
  "liveSessionId": "optional string for correlation",
  "resumeHandle": "optional string for correlation when purpose=resume"
}
```

Rules:

- Remove the currently unused `sessionId`, or repurpose it only if it becomes a real correlation key.
- Do not let the client submit model/config/tool constraints.
- The server should derive allowed Live constraints from server-owned configuration.

### Proposed response

```json
{
  "token": "string",
  "issuedAt": "ISO-8601 timestamp",
  "expireTime": "ISO-8601 timestamp",
  "newSessionExpireTime": "ISO-8601 timestamp",
  "constraints": {
    "model": "models/...",
    "responseModalities": ["AUDIO"],
    "sessionResumption": true,
    "contextWindowCompression": true,
    "mediaResolution": "MEDIA_RESOLUTION_LOW"
  },
  "requestId": "uuid"
}
```

Rules:

- Keep `uses = 1`.
- Set `expireTime` explicitly and independently; do not derive it as `start-window + 30m`.
- Lock the token to the intended Live setup using Gemini ephemeral-token constraints.
- Return enough metadata for the desktop to detect mismatches and log correlated failures.

### Proposed error contract

Use a stable JSON envelope for future hardening:

```json
{
  "error": {
    "code": "token_auth_required | token_rate_limited | token_upstream_failed | token_config_invalid",
    "message": "human-readable detail",
    "retryable": true,
    "requestId": "uuid"
  }
}
```

Suggested status mapping:

- `401` unauthenticated
- `403` authenticated but not allowed
- `429` rate limited
- `502` Gemini upstream/network/invalid payload
- `503` backend misconfigured

### Proposed server-side hardening requirements

- Require backend authentication before token issuance.
- Add per-user and per-device rate limits.
- Lock the token to the exact approved Live setup:
  - model
  - response modality
  - session resumption setting
  - context compression setting
  - tool surface
- Emit structured issuance logs and metrics with:
  - request ID
  - user/session correlation
  - outcome
  - rate-limit outcome
  - constrained model/config summary

## Realtime review

**Implemented path reviewed:**
- Desktop renderer speech runtime -> preload bridge -> main-process IPC -> backend `POST /session/token` -> Gemini `v1alpha/auth_tokens`, followed by direct desktop -> Gemini Live connection.

**Latency risks:**
- None from the current architecture boundary. The backend remains off the media hot path and only handles control-plane token issuance.

**Architecture risks:**
- The token is minted without server-owned Live constraints, so backend policy does not currently control the actual Live setup used on the direct Gemini connection.

**Correctness/UX risks:**
- Resume-time token refresh is implemented, but `newSessionExpireTime` is not actively enforced by the runtime.
- Token issuance failures surface as generic connection failures rather than a typed contract.

**Cannot verify from current context:**
- Whether future production deployment adds external auth, API gateway rate limiting, or additional observability outside this repository.

**Recommended fixes:**
- Add backend auth and rate limiting.
- Lock tokens to the approved Live setup.
- Standardize the token endpoint error/response contract with correlation IDs and server-owned constraints.
