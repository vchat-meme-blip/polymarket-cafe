/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useState } from 'react';
import {
  // FIX: Replaced outdated voice types with the new system.
  VoiceID,
  AVAILABLE_VOICES,
  VoiceProfile,
} from '../../lib/presets/agents';
// FIX: Import Agent type from canonical source.
import { Agent } from '../../lib/types/index.js';
// FIX: Fix imports for `useAgent` and `useUI` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useAgent, useUI } from '../../lib/state/index.js';
import { GoogleGenAI } from '@google/genai';
import AgentRenderer from '../agents/AgentRenderer';
import { ttsService } from '../../lib/services/tts.service.js';

const API_KEY = process.env.API_KEY;
// FIX: Add a null check for the API key before initializing the client.
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY as string }) : null;

export default function AgentEditModal() {
  // FIX: Updated to use the correct state properties `agentDossierId` and `closeAgentDossier`.
  const { agentDossierId, closeAgentDossier } = useUI();
  const { availablePersonal, availablePresets, update: updateAgentInStore } =
    useAgent();
  
  const agentData = [...availablePersonal, ...availablePresets].find(
    // FIX: Use `agentDossierId` to find the correct agent.
    a => a.id === agentDossierId,
  );

  const [formData, setFormData] = useState<Partial<Agent>>({});
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [personalityKeywords, setPersonalityKeywords] = useState('');
  const [voices, setVoices] = useState<VoiceProfile[]>(() => [...AVAILABLE_VOICES]);

  useEffect(() => {
    if (agentData) {
      setFormData(agentData);
    }
  }, [agentData]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const fetched = await ttsService.getAvailableVoices();
        if (!isMounted) return;
        const mapped: VoiceProfile[] = fetched.map(voice => ({ id: voice.id, name: voice.label }));
        const currentVoice = agentData?.voice;
        const list = [...mapped];
        if (currentVoice && !list.some(v => v.id === currentVoice)) {
          list.push({ id: currentVoice, name: 'Current Voice' });
        }
        setVoices(list.length > 0 ? list : [...AVAILABLE_VOICES]);
      } catch (error) {
        console.error('[AgentEditModal] Failed to load ElevenLabs voices', error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [agentData?.voice]);

  if (!agentData) return null;

  const updateFormData = (adjustments: Partial<Agent>) => {
    setFormData(prev => ({ ...prev, ...adjustments }));
  };

  const handleBrainstorm = async () => {
    // FIX: Use the initialized `ai` client and check for its existence.
    if (!ai) {
      alert('API key is not configured. Cannot use AI brainstorming.');
      return;
    }
    if (!personalityKeywords.trim()) return;
    setIsBrainstorming(true);
    try {
      const prompt = `Brainstorm a detailed, first-person personality for an AI agent in a SocialFi simulation called "Quants Café". The agent's personality should be based on these keywords: "${personalityKeywords}". The description should be under 80 words.`;
      const response = await ai.models.generateContent({
        // FIX: Corrected model name from deprecated 'gemini-pro' to 'gemini-2.5-flash'.
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      // FIX: Access the `text` property directly, not as a method.
      updateFormData({ personality: response.text });
    } catch (error) {
      console.error('Error brainstorming personality:', error);
      alert('Could not brainstorm a personality. Please try again.');
    } finally {
      setIsBrainstorming(false);
    }
  };

  const handleSave = () => {
    updateAgentInStore(agentData.id, formData);
    // FIX: Use `closeAgentDossier` to close the modal.
    closeAgentDossier();
  };

  return (
    <div className="modalShroud agent-edit-modal">
      <div className="modal">
        <div className="modal-header">
          <h2>Edit Agent</h2>
          {/* FIX: Use `closeAgentDossier` to close the modal. */}
          <button onClick={closeAgentDossier} className="modalClose">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="agent-edit-modal-content">
          <div className="agent-edit-modal-preview">
            <div className="preview-renderer">
              <AgentRenderer
                agent={formData as Agent}
                isSpeaking={false}
              />
            </div>
             <div className="voice-selector">
                  <p>Agent Voice</p>
                  <select
                    value={formData.voice}
                    onChange={e =>
                      updateFormData({
                        // FIX: Cast to the correct `VoiceID` type.
                        voice: e.target.value as VoiceID,
                      })
                    }
                  >
                    {/* FIX: Iterate over `AVAILABLE_VOICES` and use correct properties. */}
                    {voices.map(voice => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                </div>
          </div>
          <div className="agent-edit-modal-form">
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              <div className="form-section">
                 <label>
                    <span>Name</span>
                    <input
                      type="text"
                      placeholder="Agent Name"
                      value={formData.name || ''}
                      onChange={e => updateFormData({ name: e.target.value })}
                    />
                  </label>
              </div>

               <div className="form-section">
                <h3>Personality & Goals</h3>
                 <label>
                    <span>Personality</span>
                     <div className="personality-copilot">
                      <input
                        type="text"
                        value={personalityKeywords}
                        onChange={e => setPersonalityKeywords(e.target.value)}
                        placeholder="Help me brainstorm..."
                      />
                      <button
                        type="button"
                        className="button"
                        onClick={handleBrainstorm}
                        disabled={isBrainstorming || !personalityKeywords.trim()}
                      >
                        <span className="icon">auto_awesome</span>
                        {isBrainstorming ? '...' : 'Go'}
                      </button>
                    </div>
                    <textarea
                      value={formData.personality}
                      onChange={e => updateFormData({ personality: e.target.value })
                      }
                      rows={5}
                      placeholder="How should I act? What’s my purpose?"
                    />
                  </label>
                   <label>
                    <span>Wishlist (Intel it wants)</span>
                    <input
                      className="topics-input"
                      type="text"
                      placeholder="e.g. $WIF, $BONK, Rare Birkin Bags"
                      value={formData.wishlist?.join(', ') || ''}
                      onChange={e => updateFormData({ wishlist: e.target.value.split(',').map(t => t.trim()) })
                      }
                    />
                  </label>
               </div>

                <div className="form-section">
                    <h3>Visual Model</h3>
                    <div>
                        <label>
                            <span>Model URL (.vrm)</span>
                            <input
                                type="text"
                                placeholder="https://.../model.vrm"
                                value={formData.modelUrl || ''}
                                onChange={e => updateFormData({ modelUrl: e.target.value })}
                            />
                        </label>
                         <p className="step-hint" style={{marginTop: '8px'}}>Provide a link to a VRM file. You can create your own at VRoid Studio.</p>
                    </div>
                </div>

                <div className="agent-edit-modal-footer">
                    {/* FIX: Use `closeAgentDossier` to close the modal. */}
                    <button type="button" className="button secondary" onClick={closeAgentDossier}>Cancel</button>
                    <button type="submit" className="button primary">Save Changes</button>
                </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}