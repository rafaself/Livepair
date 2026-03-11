export const TARGET_VOICE_SAMPLE_RATE = 16_000;
export const PCM16_BYTES_PER_SAMPLE = 2;
export const PCM16_CHUNK_DURATION_MS = 20;
export const PCM16_CHUNK_SAMPLE_COUNT =
  (TARGET_VOICE_SAMPLE_RATE * PCM16_CHUNK_DURATION_MS) / 1_000;
export const PCM16_CHUNK_BYTE_SIZE = PCM16_CHUNK_SAMPLE_COUNT * PCM16_BYTES_PER_SAMPLE;

function concatFloat32Arrays(
  buffers: readonly Float32Array<ArrayBufferLike>[],
): Float32Array<ArrayBufferLike> {
  const totalLength = buffers.reduce((length, buffer) => length + buffer.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    merged.set(buffer, offset);
    offset += buffer.length;
  }

  return new Float32Array(merged);
}

function concatUint8Arrays(buffers: readonly Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((length, buffer) => length + buffer.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    merged.set(buffer, offset);
    offset += buffer.length;
  }

  return merged;
}

export function mixToMono(
  channels: readonly Float32Array<ArrayBufferLike>[],
): Float32Array<ArrayBufferLike> {
  const firstChannel = channels[0];

  if (!firstChannel) {
    return new Float32Array();
  }

  if (channels.length === 1) {
    return firstChannel.slice();
  }

  const mixed = new Float32Array(firstChannel.length);

  for (let index = 0; index < firstChannel.length; index += 1) {
    let sum = 0;

    for (const channel of channels) {
      sum += channel[index] ?? 0;
    }

    mixed[index] = sum / channels.length;
  }

  return mixed;
}

export class StreamingFloat32Resampler {
  private readonly inputSampleRate: number;
  private readonly outputSampleRate: number;
  private readonly step: number;
  private pendingInput: Float32Array<ArrayBufferLike> = new Float32Array();
  private nextInputIndex = 0;

  constructor(inputSampleRate: number, outputSampleRate: number) {
    if (inputSampleRate <= 0 || outputSampleRate <= 0) {
      throw new Error('Sample rates must be positive');
    }

    this.inputSampleRate = inputSampleRate;
    this.outputSampleRate = outputSampleRate;
    this.step = inputSampleRate / outputSampleRate;
  }

  push(input: Float32Array<ArrayBufferLike>): Float32Array<ArrayBufferLike> {
    if (input.length === 0) {
      return new Float32Array();
    }

    if (this.inputSampleRate === this.outputSampleRate) {
      return input.slice();
    }

    this.pendingInput = concatFloat32Arrays([this.pendingInput, input]);
    const output: number[] = [];

    while (this.nextInputIndex + 1 < this.pendingInput.length) {
      const baseIndex = Math.floor(this.nextInputIndex);
      const fraction = this.nextInputIndex - baseIndex;
      const baseSample = this.pendingInput[baseIndex] ?? 0;
      const nextSample = this.pendingInput[baseIndex + 1] ?? baseSample;
      output.push(baseSample + ((nextSample - baseSample) * fraction));
      this.nextInputIndex += this.step;
    }

    const consumedSamples = Math.floor(this.nextInputIndex);

    if (consumedSamples > 0) {
      this.pendingInput = new Float32Array(this.pendingInput.slice(consumedSamples));
      this.nextInputIndex -= consumedSamples;
    }

    return Float32Array.from(output);
  }

  reset(): void {
    this.pendingInput = new Float32Array();
    this.nextInputIndex = 0;
  }
}

export function encodePcm16Le(input: Float32Array<ArrayBufferLike>): Uint8Array {
  const bytes = new Uint8Array(input.length * PCM16_BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    const encoded = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    view.setInt16(index * PCM16_BYTES_PER_SAMPLE, encoded, true);
  }

  return bytes;
}

export class Pcm16Chunker {
  private readonly chunkByteSize: number;
  private pendingBytes = new Uint8Array();

  constructor(chunkByteSize = PCM16_CHUNK_BYTE_SIZE) {
    if (chunkByteSize <= 0) {
      throw new Error('Chunk size must be positive');
    }

    this.chunkByteSize = chunkByteSize;
  }

  push(bytes: Uint8Array): Uint8Array[] {
    if (bytes.length === 0) {
      return [];
    }

    const merged = concatUint8Arrays([this.pendingBytes, bytes]);
    const chunks: Uint8Array[] = [];
    let offset = 0;

    while (offset + this.chunkByteSize <= merged.length) {
      chunks.push(merged.slice(offset, offset + this.chunkByteSize));
      offset += this.chunkByteSize;
    }

    this.pendingBytes = merged.slice(offset);
    return chunks;
  }

  getPendingByteLength(): number {
    return this.pendingBytes.length;
  }

  reset(): void {
    this.pendingBytes = new Uint8Array();
  }
}
