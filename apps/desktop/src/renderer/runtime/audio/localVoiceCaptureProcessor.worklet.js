// Adaptive noise-floor detector constants (mirror of speechActivityDetector.ts).
const SAD_MIN_NOISE_FLOOR = 0.0004;
const SAD_NOISE_ALPHA = 0.02;
const SAD_ENTER_MULT = 2.5;
const SAD_EXIT_MULT = 1.5;
const SAD_ENTER_ABS_MIN = 0.006;
const SAD_EXIT_ABS_MIN = 0.004;

class LivepairLocalVoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Each render quantum is 128 samples; sampleRate is the AudioWorklet global.
    // attack ≈ 60 ms, release ≈ 150 ms.
    this._attackQuanta = Math.ceil((sampleRate * 0.06) / 128);
    this._releaseQuanta = Math.ceil((sampleRate * 0.15) / 128);
    this._isSpeaking = false;
    this._attackCount = 0;
    this._releaseCount = 0;
    this._noiseFloor = SAD_MIN_NOISE_FLOOR;
  }

  process(inputs) {
    const input = inputs[0];

    if (!input || input.length === 0) {
      return true;
    }

    // Compute RMS on the first channel before copying buffers for transfer.
    const channel = input[0];
    let sumSquares = 0;
    for (let i = 0; i < channel.length; i++) {
      sumSquares += channel[i] * channel[i];
    }
    const rms = channel.length > 0 ? Math.sqrt(sumSquares / channel.length) : 0;

    const channels = input.map((ch) => new Float32Array(ch));
    const transfer = channels.map((ch) => ch.buffer);
    this.port.postMessage({ channels }, transfer);

    // Step 1: compute adaptive thresholds from current noise floor.
    const enterThreshold = Math.max(this._noiseFloor * SAD_ENTER_MULT, SAD_ENTER_ABS_MIN);
    const exitThreshold = Math.max(this._noiseFloor * SAD_EXIT_MULT, SAD_EXIT_ABS_MIN);

    // Step 2: hysteresis state machine.
    let nextSpeaking = this._isSpeaking;

    if (!this._isSpeaking) {
      if (rms > enterThreshold) {
        this._attackCount++;
        this._releaseCount = 0;
        if (this._attackCount >= this._attackQuanta) {
          nextSpeaking = true;
          this._attackCount = 0;
        }
      } else {
        this._attackCount = 0;
      }
    } else {
      if (rms < exitThreshold) {
        this._releaseCount++;
        this._attackCount = 0;
        if (this._releaseCount >= this._releaseQuanta) {
          nextSpeaking = false;
          this._releaseCount = 0;
        }
      } else {
        this._releaseCount = 0;
      }
    }

    if (nextSpeaking !== this._isSpeaking) {
      this._isSpeaking = nextSpeaking;
      this.port.postMessage({ type: 'speech-activity', active: nextSpeaking });
    }

    // Step 3: update noise floor only while not speaking so speech energy
    // does not contaminate the ambient baseline.
    if (!this._isSpeaking) {
      this._noiseFloor = Math.max(
        SAD_MIN_NOISE_FLOOR,
        this._noiseFloor * (1 - SAD_NOISE_ALPHA) + rms * SAD_NOISE_ALPHA,
      );
    }

    return true;
  }
}

registerProcessor('livepair-local-voice-capture', LivepairLocalVoiceCaptureProcessor);
