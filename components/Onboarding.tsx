/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Added missing 'React' import to resolve namespace errors.
import React from 'react';
import { useState } from 'react';
// FIX: The 'Agent' type is not exported from 'presets'. It is now imported from its correct source file 'lib/types/index.js'.
import type { Agent } from '../lib/types/index.js';
import { PRESET_AGENTS } from '../lib/presets/agents';
// FIX: Added useAgent import to manage agent state.
import { useUser, createNewAgent, useAgent } from '../lib/state';
import c from 'classnames';
// FIX: Add .js extension for ES module compatibility.
import { apiService } from '../lib/services/api.service.js';
import styles from './onboarding/Onboarding.module.css';
import { VrmAvatarCanvas } from './agents/VrmAvatar';

const TOTAL_STEPS = 3;

/**
 * A dedicated, full-screen onboarding flow for first-time users to create
 * their first AI agent in a celebrated "Genesis" event.
 */
export default function Onboarding() {
  const [step, setStep] = useState(1);
  const { setName: setUserName, handle, completeOnboarding } = useUser();
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [personalityKeywords, setPersonalityKeywords] = useState('');

  const [agent, setAgent] = useState<Partial<Agent>>({
    name: '',
    personality: '',
    modelUrl: PRESET_AGENTS[1].modelUrl, // Default to "The Stranger"
  });

  const updateAgent = (updates: Partial<Agent>) => {
    setAgent(prev => ({ ...prev, ...updates }));
  };

  const handleBrainstorm = async () => {
    if (!personalityKeywords.trim()) return;
    setIsBrainstorming(true);
    try {
      // FIX: The AI call is now handled securely by the server.
      const response = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: personalityKeywords }),
      });
      if (!response.ok) {
        throw new Error('Brainstorm request failed');
      }
      const data = await response.json();
      updateAgent({ personality: data.personality });
    } catch (error) {
      console.error('Error brainstorming personality:', error);
      alert('Could not brainstorm a personality. Please try again.');
    } finally {
      setIsBrainstorming(false);
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setUserName(agent.name || handle || 'User');
    const finalAgent = createNewAgent({
      name: agent.name,
      personality: agent.personality,
      modelUrl: agent.modelUrl,
    });
    
    // FIX: Awaited agent creation and added the agent returned from the server to the state store.
    try {
        const { agent: savedAgent } = await apiService.saveNewAgent(finalAgent);
        useAgent.getState().addAgent(savedAgent);
        completeOnboarding();
    } catch (error) {
        console.error("Failed to save agent:", error);
        alert("There was a problem creating your agent. Please try again.");
    } finally {
        setIsSaving(false);
    }
  };

  const isStep1Valid = agent.name && agent.name.trim().length > 0;
  const isStep2Valid = !!agent.modelUrl;
  const isStep3Valid = agent.personality && agent.personality.trim().length > 0;

  return (
    <div className={styles.onboardingContainer}>
      <div className={styles.onboardingCard}>
        <div className={styles.onboardingHeader}>
          <h2>Agent Genesis</h2>
          <p>
            Welcome to the Café, <strong>{handle}</strong>! Let's bring your
            first Quant to life.
          </p>
        </div>

        <div className={styles.onboardingProgress}>
          {[...Array(TOTAL_STEPS)].map((_, i) => (
            <div
              key={i}
              className={c(styles.progressStep, {
                [styles.active]: i + 1 === step,
                [styles.completed]: i + 1 < step,
              })}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit} className={styles.onboardingForm}>
          {step === 1 && (
            <div className={styles.formStep}>
              <label htmlFor="agentName">What is your agent's name?</label>
              <input
                id="agentName"
                type="text"
                value={agent.name}
                onChange={e => updateAgent({ name: e.target.value })}
                placeholder="e.g., Alpha Hunter"
                required
              />
              <p className={styles.stepHint}>
                This is how other agents will see them in the Café.
              </p>
            </div>
          )}
          {step === 2 && (
             <div className={styles.formStep}>
                <label>Choose a 3D Model</label>
                <div className={styles.modelSelectorGrid}>
                    <div className={styles.modelPreview}>
                        {agent.modelUrl && <VrmAvatarCanvas modelUrl={agent.modelUrl} isSpeaking={false} />}
                    </div>
                    <div className={styles.modelOptions}>
                        {PRESET_AGENTS.map(preset => (
                            <button
                                type="button"
                                // FIX: Access id property which now exists on Agent type
                                key={preset.id}
                                className={c(styles.modelOption, { [styles.active]: agent.modelUrl === preset.modelUrl })}
                                onClick={() => updateAgent({ modelUrl: preset.modelUrl })}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
          )}
          {step === 3 && (
            <div className={styles.formStep}>
              <label htmlFor="agentPersonality">
                Describe their personality.
              </label>
              <div className={styles.personalityCopilot}>
                <input
                  type="text"
                  value={personalityKeywords}
                  onChange={e => setPersonalityKeywords(e.target.value)}
                  placeholder="Help me brainstorm with keywords..."
                />
                <button
                  type="button"
                  className="button"
                  onClick={handleBrainstorm}
                  disabled={isBrainstorming || !personalityKeywords.trim()}
                >
                  <span className="icon">auto_awesome</span>
                  {isBrainstorming ? 'Thinking...' : 'Brainstorm'}
                </button>
              </div>
              <textarea
                id="agentPersonality"
                value={agent.personality}
                onChange={e => updateAgent({ personality: e.target.value })}
                rows={5}
                placeholder="e.g., A cynical but brilliant crypto trader who speaks in memes and sarcasm."
                required
              />
            </div>
          )}

          <div className={styles.onboardingNavigation}>
            {step > 1 && (
              <button
                type="button"
                className="button secondary"
                onClick={handleBack}
              >
                Back
              </button>
            )}
            {step < TOTAL_STEPS && (
              <button
                type="button"
                className="button primary"
                onClick={handleNext}
                disabled={
                  (step === 1 && !isStep1Valid) ||
                  (step === 2 && !isStep2Valid) ||
                  (step === 3 && !isStep3Valid)
                }
              >
                Next
              </button>
            )}
            {step === TOTAL_STEPS && (
              <button
                type="submit"
                className="button primary"
                disabled={!isStep3Valid || isSaving}
              >
                {isSaving ? 'Saving...' : 'Enter the Café'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}