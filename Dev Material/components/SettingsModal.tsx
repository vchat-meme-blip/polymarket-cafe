
import React, { useState, useEffect } from 'react';
import { AppSettings } from '../core/types/state.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveApiKey: (apiKey: string) => void;
  onSaveSettings: (settings: AppSettings) => void;
  onManageTwitter: () => void;
  currentApiKey: string | null;
  currentSettings: AppSettings;
}

const voices = [
  { name: 'Orus (Male)', value: 'Orus' },
  { name: 'Aries (Male)', value: 'Aries' },
  { name: 'Leda (Female)', value: 'Leda' },
  { name: 'Luna (Female)', value: 'Luna' },
];

const languages = [
  { name: 'English (US)', value: 'en-US' },
  { name: 'English (UK)', value: 'en-GB' },
  { name: 'Spanish', value: 'es-US' },
  { name: 'French', value: 'fr-FR' },
  { name: 'German', value: 'de-DE' },
  { name: 'Japanese', value: 'ja-JP' },
  { name: 'Hindi', value: 'hi-IN' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, onClose, onSaveApiKey, onSaveSettings, onManageTwitter, currentApiKey, currentSettings 
}) => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [settings, setSettings] = useState<AppSettings>(currentSettings);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(currentApiKey || '');
      setSettings(currentSettings);
    }
  }, [isOpen, currentApiKey, currentSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (apiKeyInput.trim() && apiKeyInput.trim() !== currentApiKey) {
      onSaveApiKey(apiKeyInput.trim());
    }
    onSaveSettings(settings);
    onClose();
  };
  
  const handleSettingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSettings(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text rounded-2xl shadow-2xl w-full max-w-md m-4 border border-light-border dark:border-dark-border"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-light-border dark:border-dark-border flex justify-between items-center">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onClose} className="p-1 rounded-full text-light-text/60 dark:text-dark-text/60 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Close settings">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium mb-1.5">Gemini API Key</label>
            <input
              id="api-key" type="password" value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="Enter your API key"
              className="w-full px-3 py-2 bg-white/80 dark:bg-black/20 border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-orange"
              autoFocus
            />
            <p className="text-xs text-light-text/70 dark:text-dark-text/70 mt-2">
              Your key is stored securely in your browser and is never sent to our servers.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="voiceName" className="block text-sm font-medium mb-1.5">Agent Voice</label>
              <select id="voiceName" name="voiceName" value={settings.voiceName} onChange={handleSettingChange} className="w-full px-3 py-2 bg-white/80 dark:bg-black/20 border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-orange">
                {voices.map(voice => <option key={voice.value} value={voice.value}>{voice.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="languageCode" className="block text-sm font-medium mb-1.5">Language</label>
              <select id="languageCode" name="languageCode" value={settings.languageCode} onChange={handleSettingChange} className="w-full px-3 py-2 bg-white/80 dark:bg-black/20 border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-orange">
                {languages.map(lang => <option key={lang.value} value={lang.value}>{lang.name}</option>)}
              </select>
            </div>
          </div>
           <div>
            <label className="block text-sm font-medium mb-1.5">Social Intelligence</label>
             <button
              onClick={onManageTwitter}
              className="w-full px-3 py-2 text-left bg-white/80 dark:bg-black/20 border border-light-border dark:border-dark-border rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Manage Twitter Lists...
            </button>
             <p className="text-xs text-light-text/70 dark:text-dark-text/70 mt-2">
              Configure KOLs, hashtags, and keywords for the AI to monitor.
            </p>
          </div>
        </div>
        <div className="p-6 bg-black/5 dark:bg-white/5 rounded-b-2xl flex justify-end">
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-primary-orange text-white font-semibold rounded-lg shadow-md hover:bg-opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-primary-orange focus:ring-offset-2 focus:ring-offset-light-bg dark:focus:ring-offset-dark-bg disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!apiKeyInput.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
