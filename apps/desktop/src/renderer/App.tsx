import { useState } from 'react';
import type {
  HealthResponse,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

declare global {
  interface Window {
    bridge: {
      checkHealth: () => Promise<HealthResponse>;
      requestSessionToken: (req?: {
        sessionId?: string;
      }) => Promise<CreateEphemeralTokenResponse>;
    };
  }
}

type HealthStatus = 'unknown' | 'ok' | 'error';

export function App(): JSX.Element {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('unknown');
  const [healthTimestamp, setHealthTimestamp] = useState<string | null>(null);
  const [tokenResult, setTokenResult] =
    useState<CreateEphemeralTokenResponse | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkHealth(): Promise<void> {
    setLoading(true);
    try {
      const res = await window.bridge.checkHealth();
      setHealthStatus('ok');
      setHealthTimestamp(res.timestamp);
    } catch {
      setHealthStatus('error');
      setHealthTimestamp(null);
    } finally {
      setLoading(false);
    }
  }

  async function requestToken(): Promise<void> {
    setLoading(true);
    setTokenError(null);
    try {
      const res = await window.bridge.requestSessionToken();
      setTokenResult(res);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'Unknown error');
      setTokenResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>Livepair</h1>
      <p className="subtitle">Realtime Multimodal Desktop Assistant</p>

      <section className="card">
        <h2>Backend Status</h2>
        <p>
          Status:{' '}
          <span className={`status status--${healthStatus}`}>
            {healthStatus}
          </span>
        </p>
        {healthTimestamp && (
          <p className="detail">Last checked: {healthTimestamp}</p>
        )}
        <button onClick={checkHealth} disabled={loading}>
          Check Health
        </button>
      </section>

      <section className="card">
        <h2>Session Token</h2>
        <p>
          Session:{' '}
          <span className="status status--unknown">not started</span>
        </p>
        <button onClick={requestToken} disabled={loading}>
          Request Token
        </button>
        {tokenResult && (
          <pre className="result">
            {JSON.stringify(tokenResult, null, 2)}
          </pre>
        )}
        {tokenError && <p className="error">Error: {tokenError}</p>}
      </section>
    </div>
  );
}
