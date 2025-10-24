/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useRef, useCallback } from 'react';
import { AudioRecorder } from '../lib/audio-recorder';
// FIX: Add .js extension for ES module compatibility.
import { apiService } from '../lib/services/api.service.js';

type UseAudioInputProps = {
  onTranscription: (text: string) => void;
};

export default function useAudioInput({ onTranscription }: UseAudioInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const audioChunksRef = useRef<string[]>([]);

  // FIX: Define the event handler with useCallback so its reference is stable
  // and can be passed to both .on() and .off() of the event emitter.
  const onData = useCallback((base64: string) => {
    audioChunksRef.current.push(base64);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (!audioRecorderRef.current) {
        audioRecorderRef.current = new AudioRecorder();
      }
      audioChunksRef.current = [];
      
      audioRecorderRef.current.on('data', onData);
      await audioRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not start recording. Please ensure microphone permissions are granted.');
    }
  }, [onData]);

  const stopRecording = useCallback(async () => {
    if (!audioRecorderRef.current || !isRecording) return;
    
    setIsRecording(false);
    audioRecorderRef.current.stop();
    // FIX: Pass the specific listener function to .off() to correctly remove it.
    audioRecorderRef.current.off('data', onData);

    if (audioChunksRef.current.length > 0) {
      setIsTranscribing(true);
      const fullAudioBase64 = audioChunksRef.current.join('');
      try {
        const { text } = await apiService.transcribeAudio(fullAudioBase64);
        onTranscription(text);
      } catch (error) {
        console.error('Transcription failed:', error);
        alert('Sorry, I couldn\'t understand that. Please try again.');
      } finally {
        setIsTranscribing(false);
        audioChunksRef.current = [];
      }
    }
  }, [isRecording, onTranscription, onData]);

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
  };
}
