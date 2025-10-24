/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Added missing 'React' import to resolve namespace errors.
import React from 'react';
import { useEffect, useState } from 'react';
// FIX: Import Agent type from canonical source.
import type { Agent } from '../../lib/types/index.js';
import { PRESET_AGENTS } from '../../lib/presets/agents';
import { useUser, createNewAgent } from '../../lib/state';
import c from 'classnames';
// FIX: Add .js extension for ES module compatibility.
import { apiService } from '../../lib/services/api.service.js';
import styles from './Onboarding.module.css';
import { VrmModel } from '../agents/VrmAvatar';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

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

  const [selectedPreset, setSelectedPreset] = useState<string>('tony-pump');
  // Default to TrenchBoudica preset
  const defaultPreset = PRESET_AGENTS.find(p => p.id === 'tony-pump') || PRESET_AGENTS[0];
  const [agent, setAgent] = useState<Partial<Agent>>({
    name: defaultPreset.name,
    personality: defaultPreset.personality,
    modelUrl: defaultPreset.modelUrl,
    voice: defaultPreset.voice,
    instructions: defaultPreset.instructions,
    topics: defaultPreset.topics,
    wishlist: defaultPreset.wishlist
  });

  const updateAgent = (updates: Partial<Agent>) => {
    setAgent(prev => ({ ...prev, ...updates }));
  };

  const handleBrainstorm = async () => {
    if (!personalityKeywords.trim()) return;
    setIsBrainstorming(true);
    try {
      // The AI call is now routed through the apiService to ensure it hits the correct backend endpoint.
      const data = await apiService.brainstormPersonality(personalityKeywords);
      updateAgent({ personality: data.personality });
    } catch (error) {
      console.error('Error brainstorming personality:', error);
      alert('Could not brainstorm a personality. Please try again.');
    } finally {
      setIsBrainstorming(false);
    }
  };

  const handleNext = () => {
    if (step === 2) {
      // Always sync fields from currently selected preset before entering step 3
      const preset = PRESET_AGENTS.find(p => p.id === selectedPreset);
      if (preset) {
        updateAgent({
          personality: preset.personality,
          name: agent.name || preset.name,
          voice: preset.voice,
          instructions: preset.instructions,
          topics: preset.topics,
          wishlist: preset.wishlist,
        });
      }
    }
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // When entering step 3, ensure personality is set from the selected preset
  useEffect(() => {
    if (step === 3) {
      const preset = PRESET_AGENTS.find(p => p.id === selectedPreset);
      if (preset && (!agent.personality || agent.personality.trim().length === 0)) {
        updateAgent({ personality: preset.personality });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedPreset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setUserName(agent.name || handle || 'User');
    
    // Create agent using the selected preset as a template if available
    const finalAgent = createNewAgent({
      ...agent,
      templateId: selectedPreset, // Pass the selected preset ID to use as a template
    });
    
    await apiService.saveNewAgent(finalAgent);
    
    completeOnboarding();
    setIsSaving(false);
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
                <label>Choose a Template</label>
                <div className={styles.modelSelectorGrid}>
                    <div className={styles.modelPreview}>
                        {agent.modelUrl && (
                          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                            <Canvas
                              camera={{ position: [0, 0.8, 3.0], fov: 30 }}
                              gl={{ antialias: true, alpha: true }}
                              shadows
                            >
                              <ambientLight intensity={1.5} />
                              <directionalLight position={[3, 1, 2]} intensity={2} castShadow />
                              <group position={[0.2, -1.0, 0]} rotation={[0, Math.PI, 0]} scale={1.0}>
                                <VrmModel 
                                  modelUrl={agent.modelUrl}
                                  isSpeaking={false}
                                  disableAutoGrounding={true}
                                />
                              </group>
                              <OrbitControls enableZoom={false} enablePan={false} target={[0, 0.0, 0]} />
                            </Canvas>
                          </div>
                        )}
                    </div>
                    <div className={styles.modelOptions}>
                        {PRESET_AGENTS.map(preset => (
                            <button
                                type="button"
                                key={preset.id}
                                className={c(styles.modelOption, { [styles.active]: selectedPreset === preset.id })}
                                onClick={() => {
                                    setSelectedPreset(preset.id);
                                    updateAgent({
                                        modelUrl: preset.modelUrl,
                                        name: preset.name,
                                        personality: preset.personality,
                                        voice: preset.voice,
                                        instructions: preset.instructions,
                                        topics: preset.topics,
                                        wishlist: preset.wishlist,
                                        // Don't copy the ID - we'll generate a new one
                                    });
                                }}
                            >
                                <div className={styles.presetName}>{preset.name}</div>
                                <div className={styles.presetPersonality}>{preset.personality}</div>
                            </button>
                        ))}
                    </div>
                </div>
                <p className={styles.stepHint}>
                    Select a template to start with. You can customize the name and personality in the next steps.
                </p>
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
                value={agent.personality || ''}
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
                  (step === 2 && !isStep2Valid)
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
        <div className={styles.digitalWave}>
            <svg viewBox="0 0 1440 320" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,160L48,181.3C96,203,192,245,288,250.7C384,256,480,224,576,213.3C672,203,768,213,864,202.7C960,192,1056,160,1152,149.3C1248,139,1344,149,1392,154.7L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
        </div>
      </div>
    </div>
  );
}
