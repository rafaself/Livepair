class LivepairLocalVoiceCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];

    if (!input || input.length === 0) {
      return true;
    }

    const channels = input.map((channel) => new Float32Array(channel));
    const transfer = channels.map((channel) => channel.buffer);
    this.port.postMessage({ channels }, transfer);
    return true;
  }
}

registerProcessor('livepair-local-voice-capture', LivepairLocalVoiceCaptureProcessor);
