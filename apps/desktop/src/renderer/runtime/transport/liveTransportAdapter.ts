import type { AssistantVoice } from '@livepair/shared-types';
import type { LiveTransport, TransportKind } from './transport.types';

export type LiveTransportAdapter = {
  key: TransportKind;
  create: (options?: { voice?: AssistantVoice }) => LiveTransport;
};
