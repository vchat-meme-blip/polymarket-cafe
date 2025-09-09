/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import cn from 'classnames';
import { FormEvent, useEffect, useState } from 'react';
import { useAgent, useUI, useUser } from '../../../lib/state';
import { useAutonomyStore } from '../../../lib/state/autonomy';
import { useArenaStore, USER_ID } from '../../../lib/state/arena';
import { apiService } from '../../../lib/services/api.service';
import useAudioInput from '../../../hooks/useAudioInput';
import styles from './ControlTray.module.css';

export default function ControlTray() {
  // FIX: Removed unused `agentToEditId` from the `useUI` hook destructuring. This property was renamed to `agentDossierId` and is not used in this component.
  const { showProfileView, setChatContextToken, setIsAgentResponding } = useUI();
  const { setActivity } = useAutonomyStore();
  const { current: currentAgent } = useAgent();
  const { addConversationTurn } = useArenaStore();
  const { name: userName } = useUser();
  const [textInput, setTextInput] = useState('');

  const { isRecording, isTranscribing, startRecording, stopRecording } = useAudioInput({
    onTranscription: (text) => {
      setTextInput(text);
      // Automatically submit the transcribed text
      handleSubmit(text);
    }
  });

  const handleSubmit = async (text: string | FormEvent<HTMLFormElement>) => {
    if (typeof text !== 'string') {
      text.preventDefault();
    }
    const message = (typeof text === 'string' ? text : textInput).trim();
    if (!message) return;

    setActivity('CHATTING_WITH_USER');
    setTextInput('');
    setIsAgentResponding(true);
    setChatContextToken(null);

    // Add user's message to log immediately for optimistic UI update
    addConversationTurn(currentAgent.id, USER_ID, {
      agentId: USER_ID,
      agentName: userName || 'You',
      text: message,
      timestamp: Date.now(),
    });

    try {
      const response = await apiService.sendDirectMessage(message);
      // Add agent's response to the log
      addConversationTurn(currentAgent.id, USER_ID, response.agentMessage);
      if (response.contextToken) {
        setChatContextToken(response.contextToken);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Optionally, add an error message to the chat log
      addConversationTurn(currentAgent.id, USER_ID, {
        agentId: 'system',
        agentName: 'System',
        text: 'Sorry, I was unable to get a response. Please try again.',
        timestamp: Date.now(),
      });
    } finally {
      setIsAgentResponding(false);
      // Return agent to idle so autonomy can take over if needed
      setActivity('IDLE');
    }
  };

  const isMicDisabled = isRecording || isTranscribing;

  return (
    <section className={styles.controlTray}>
      <form className={styles.controlsWrapper} onSubmit={handleSubmit}>
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={isRecording ? "Recording..." : isTranscribing ? "Transcribing..." : `Message ${currentAgent.name}...`}
          className={styles.chatInput}
          disabled={isMicDisabled}
        />
        <button
          type="button"
          className={cn(styles.actionButton, { [styles.active]: isRecording })}
          onClick={isRecording ? stopRecording : startRecording}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <span className="material-symbols-outlined filled">{isRecording ? 'stop_circle' : 'mic'}</span>
        </button>
        <button
          type="submit"
          className={styles.actionButton}
          disabled={!textInput.trim() || isMicDisabled}
          aria-label="Send message"
        >
          <span className="material-symbols-outlined filled">send</span>
        </button>
      </form>
    </section>
  );
}
