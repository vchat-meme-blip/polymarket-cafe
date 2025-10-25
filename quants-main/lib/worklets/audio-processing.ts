/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const AudioRecordingWorklet = `
class AudioProcessingWorklet extends AudioWorkletProcessor {
  // Buffer to send, 2048 samples at 16khz is about 8 times a second
  _buffer = new Int16Array(2048);
  _bufferWriteIndex = 0;

  // Resampling state
  _nativeSampleRate;
  _targetSampleRate;
  _resampleRatio;
  _inputBuffer = new Float32Array(0);

  constructor(options) {
    super();
    this._nativeSampleRate = options.processorOptions.nativeSampleRate;
    this._targetSampleRate = options.processorOptions.targetSampleRate;
    if (this._nativeSampleRate !== this._targetSampleRate) {
      this._resampleRatio = this._nativeSampleRate / this._targetSampleRate;
    }
  }

  process(inputs) {
    const channelData = inputs[0]?.[0];
    if (!channelData) {
      return true;
    }

    // If no resampling is needed, process directly
    if (!this._resampleRatio) {
      this._processChunk(channelData);
      return true;
    }

    // Buffer new data
    const newLength = this._inputBuffer.length + channelData.length;
    const newBuffer = new Float32Array(newLength);
    newBuffer.set(this._inputBuffer, 0);
    newBuffer.set(channelData, this._inputBuffer.length);
    this._inputBuffer = newBuffer;

    const outputLength = Math.floor(
      this._inputBuffer.length / this._resampleRatio
    );
    if (outputLength === 0) {
      return true;
    }

    const resampled = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * this._resampleRatio;
      const index1 = Math.floor(inputIndex);
      const index2 = index1 + 1;
      const fraction = inputIndex - index1;

      const val1 = this._inputBuffer[index1];
      const val2 =
        index2 < this._inputBuffer.length ? this._inputBuffer[index2] : val1;

      resampled[i] = val1 + (val2 - val1) * fraction;
    }

    this._processChunk(resampled);

    const consumedInput = Math.ceil(outputLength * this._resampleRatio);
    this._inputBuffer = this._inputBuffer.slice(consumedInput);

    return true;
  }

  _sendAndClearBuffer() {
    if (this._bufferWriteIndex > 0) {
      this.port.postMessage({
        event: 'chunk',
        data: {
          int16arrayBuffer: this._buffer.slice(0, this._bufferWriteIndex)
            .buffer,
        },
      });
    }
    this._bufferWriteIndex = 0;
  }

  _processChunk(float32Array) {
    for (let i = 0; i < float32Array.length; i++) {
      // convert float32 to int16 and clamp
      const int16Value = Math.max(
        -32768,
        Math.min(32767, float32Array[i] * 32768)
      );
      this._buffer[this._bufferWriteIndex++] = int16Value;
      if (this._bufferWriteIndex >= this._buffer.length) {
        this._sendAndClearBuffer();
      }
    }
  }
}
`;

export default AudioRecordingWorklet;