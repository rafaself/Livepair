export function decodePcm16Le(chunk: Uint8Array): Float32Array {
  if (chunk.byteLength === 0 || chunk.byteLength % 2 !== 0) {
    throw new Error('Assistant audio chunk was malformed');
  }

  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const sampleCount = chunk.byteLength / 2;
  const decoded = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getInt16(index * 2, true);
    decoded[index] = sample < 0 ? sample / 32768 : sample / 32767;
  }

  return decoded;
}
