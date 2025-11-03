/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import cn from 'classnames';
import { FormEvent, useEffect, useState } from 'react';
// FIX: Fix imports for `useAgent`, `useUI`, and `useUser` by changing the path from `../../../lib/state` to `../../../lib/state/index.js`.
import { useAgent, useUI, useUser } from '../../../lib/state/index.js';
import { useAutonomyStore } from '../../../lib/state/autonomy';
import { useArenaStore, USER_ID } from '../../../lib/state/arena';
// FIX: Add .js extension for ES module compatibility.
import { apiService } from '../../../lib/services/api.service.js';
import useAudioInput from '../../../hooks/useAudioInput';
import styles from './ControlTray.module.css';

export default function ControlTray() {
  const { setChatContextToken, setIsAgentResponding, chatPrompt, setChatPrompt, setIsAgentTyping } = useUI();
  const { setActivity } = useAutonomyStore();
  const { current: currentAgent } = useAgent();
  const { addConversationTurn, agentConversations } = useArenaStore();
  const { name: userName, handle } = useUser();
  const [textInput, setTextInput] = useState('');
  const [isResearching, setIsResearching] = useState(false);

  const { isRecording, isTranscribing, startRecording, stopRecording } = useAudioInput({
    onTranscription: (text) => {
      setTextInput(text);
      // Automatically submit the transcribed text
      handleSubmit(text);
    }
  });

  useEffect(() => {
    if (chatPrompt) {
      setTextInput(chatPrompt);
      setChatPrompt(null); // Clear the prompt so it doesn't re-trigger
    }
  }, [chatPrompt, setChatPrompt]);

  const handleSubmit = async (text: string | FormEvent<HTMLFormElement>) => {
    if (typeof text !== 'string') {
      text.preventDefault();
    }
    const message = (typeof text === 'string' ? text : textInput).trim();
    if (!message) return;

    const conversationHistory = agentConversations[currentAgent.id]?.[USER_ID] || [];

    setActivity('CHATTING_WITH_USER');
    setTextInput('');
    setChatContextToken(null);

    // Add user's message to log immediately for optimistic UI update
    addConversationTurn(currentAgent.id, USER_ID, {
      agentId: USER_ID,
      agentName: userName || 'You',
      text: message,
      timestamp: Date.now(),
    });

    setIsAgentTyping(true); // Start typing indicator

    try {
      const { agentMessage } = await apiService.sendDirectMessage(message, conversationHistory);
      
      setIsAgentTyping(false); // Stop typing indicator
      setIsAgentResponding(true); // Start talking animation

      addConversationTurn(currentAgent.id, USER_ID, agentMessage);
      
      // Stop talking after a delay proportional to the message length
      const messageDuration = Math.max(1000, agentMessage.text.length * 50); // 50ms per char, 1s min
      setTimeout(() => {
        setIsAgentResponding(false);
        setActivity('IDLE'); // Return to idle only after talking
      }, messageDuration);

    } catch (error) {
      console.error('Error sending message:', error);
      setIsAgentTyping(false); // Ensure typing indicator stops on error
      addConversationTurn(currentAgent.id, USER_ID, {
        agentId: 'system',
        agentName: 'System',
        text: 'Sorry, I was unable to get a response. Please try again.',
        timestamp: Date.now(),
      });
      setIsAgentResponding(false); // Ensure it's off on error
      setActivity('IDLE');
    }
  };

  const handleStartResearch = async () => {
    setIsResearching(true);
    try {
      await apiService.startResearch(currentAgent.id, handle);
      // Server will send a toast notification for confirmation
    } catch (error) { 
      console.error('Failed to start research:', error);
      // Optionally show an error toast
    }
    // Add a small delay to give user feedback that the action was performed
    setTimeout(() => setIsResearching(false), 1000);
  };

  const isMicDisabled = isRecording || isTranscribing;

  return (
    <section className={styles.controlTray}>
      <form className={styles.controlsWrapper} onSubmit={handleSubmit}>
        {/* Audio recording button */}
        <button
          type="button"
          className={cn(styles.actionButton, { [styles.active]: isRecording })}
          onClick={isRecording ? stopRecording : startRecording}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <span className="material-symbols-outlined filled">{isRecording ? 'stop_circle' : 'mic'}</span>
        </button>
        
        {/* Enhanced text input */}
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={isRecording ? "Recording..." : isTranscribing ? "Transcribing..." : `Message ${currentAgent.name}...`}
          className={styles.chatInput}
          disabled={isMicDisabled}
        />
        
        {/* Research button */}
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleStartResearch}
          disabled={isResearching}
          aria-label="Start autonomous research"
        >
          <span className="material-symbols-outlined filled">psychology</span>
        </button>

        {/* Send button */}
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
