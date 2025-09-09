
import React, { useState, useEffect } from 'react';
import { AppSettings, TwitterMonitoringSettings } from '../core/types/state.js';

interface TwitterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
  currentSettings: AppSettings;
}

const ListItem: React.FC<{ item: string; onRemove: () => void }> = ({ item, onRemove }) => (
    <div className="flex items-center justify-between bg-black/10 dark:bg-white/5 px-3 py-1.5 rounded-md text-sm">
        <span className="truncate">{item}</span>
        <button onClick={onRemove} className="ml-2 text-light-text/50 dark:text-dark-text/50 hover:text-red-500 transition-colors">&times;</button>
    </div>
);

const ListEditor: React.FC<{ title: string; items: string[]; setItems: (items: string[]) => void; placeholder: string }> = 
({ title, items, setItems, placeholder }) => {
    const [inputValue, setInputValue] = useState('');

    const handleAddItem = () => {
        const newItem = inputValue.trim();
        if (newItem && !items.includes(newItem)) {
            setItems([...items, newItem]);
        }
        setInputValue('');
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddItem();
        }
    }

    const handleRemoveItem = (indexToRemove: number) => {
        setItems(items.filter((_, index) => index !== indexToRemove));
    };

    return (
        <div>
            <label className="block text-sm font-medium mb-1.5">{title}</label>
            <div className="flex gap-2 mb-2">
                <input
                    type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="flex-grow px-3 py-2 bg-white/80 dark:bg-black/20 border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-orange"
                />
                <button onClick={handleAddItem} className="px-4 bg-primary-orange/20 text-primary-orange font-semibold rounded-lg hover:bg-primary-orange/30 transition-colors">+</button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {items.map((item, index) => <ListItem key={index} item={item} onRemove={() => handleRemoveItem(index)} />)}
            </div>
        </div>
    );
};

const TwitterSettingsModal: React.FC<TwitterSettingsModalProps> = ({ isOpen, onClose, onSaveSettings, currentSettings }) => {
  const [twitterSettings, setTwitterSettings] = useState<TwitterMonitoringSettings>({ kols: [], hashtags: [], trenchesKeywords: [] });

  useEffect(() => {
    if (isOpen) {
      setTwitterSettings(currentSettings.twitterMonitoring);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveSettings({ twitterMonitoring: twitterSettings });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[101] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div className="bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text rounded-2xl shadow-2xl w-full max-w-lg m-4 border border-light-border dark:border-dark-border" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-light-border dark:border-dark-border flex justify-between items-center">
          <h2 className="text-xl font-bold">Manage Twitter Lists</h2>
          <button onClick={onClose} className="p-1 rounded-full text-light-text/60 dark:text-dark-text/60 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>
          </button>
        </div>
        <div className="p-6 space-y-6">
            <ListEditor 
                title="Key Opinion Leaders (KOLs)"
                items={twitterSettings.kols}
                setItems={newKols => setTwitterSettings(s => ({...s, kols: newKols}))}
                placeholder="Add @handle (e.g., @elonmusk)"
            />
            <ListEditor 
                title="Hashtags"
                items={twitterSettings.hashtags}
                setItems={newHashtags => setTwitterSettings(s => ({...s, hashtags: newHashtags}))}
                placeholder="Add #hashtag (e.g., #solana)"
            />
             <ListEditor 
                title="Trenches Keywords"
                items={twitterSettings.trenchesKeywords}
                setItems={newKeywords => setTwitterSettings(s => ({...s, trenchesKeywords: newKeywords}))}
                placeholder="Add keyword (e.g., 100x gem)"
            />
        </div>
        <div className="p-6 bg-black/5 dark:bg-white/5 rounded-b-2xl flex justify-end">
          <button onClick={handleSave} className="px-5 py-2 bg-primary-orange text-white font-semibold rounded-lg shadow-md hover:bg-opacity-90 transition-all">
            Save Lists
          </button>
        </div>
      </div>
    </div>
  );
};

export default TwitterSettingsModal;
