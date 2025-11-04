/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, FormEvent } from 'react';
import { useUser, useUI } from '../../lib/state/index.js';
import styles from './Profile.module.css';

type NotificationsTabProps = {
  onSave: () => void;
};

export default function NotificationsTab({ onSave }: NotificationsTabProps) {
    const { phone, notificationSettings, updateNotificationSettings } = useUser();
    const { addToast } = useUI();
    
    const [localPhone, setLocalPhone] = useState(phone || '');
    const [localSettings, setLocalSettings] = useState(notificationSettings || {
        agentResearch: true,
        agentTrades: true,
        newMarkets: false,
        agentEngagements: true, // Default new setting to true
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleToggle = (key: keyof typeof localSettings) => {
        setLocalSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await updateNotificationSettings({
                phone: localPhone,
                notificationSettings: localSettings,
            });
            addToast({ type: 'system', message: 'Notification settings saved!' });
            onSave();
        } catch (error) {
            addToast({ type: 'error', message: 'Failed to save settings.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={styles.notificationsTabContent}>
            <form onSubmit={handleSubmit}>
                <div>
                    <p>WhatsApp Phone Number</p>
                    <input
                        type="tel"
                        value={localPhone}
                        onChange={e => setLocalPhone(e.target.value)}
                        placeholder="e.g., +14155552671"
                    />
                    <p className={styles.stepHint}>
                        Enter your number with country code to receive WhatsApp alerts from your agent.
                    </p>
                </div>

                <div className={styles.notificationToggle}>
                    <label htmlFor="research-toggle">Agent Research Complete</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            id="research-toggle"
                            checked={localSettings.agentResearch}
                            onChange={() => handleToggle('agentResearch')}
                        />
                        <label htmlFor="research-toggle"></label>
                    </div>
                </div>
                <div className={styles.notificationToggle}>
                    <label htmlFor="trades-toggle">Agent Intel Trades</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            id="trades-toggle"
                            checked={localSettings.agentTrades}
                            onChange={() => handleToggle('agentTrades')}
                        />
                        <label htmlFor="trades-toggle"></label>
                    </div>
                </div>
                <div className={styles.notificationToggle}>
                    <label htmlFor="markets-toggle">New "Breaking" Markets</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            id="markets-toggle"
                            checked={localSettings.newMarkets}
                            onChange={() => handleToggle('newMarkets')}
                        />
                        <label htmlFor="markets-toggle"></label>
                    </div>
                </div>
                <div className={styles.notificationToggle}>
                    <label htmlFor="engagements-toggle">Proactive Agent Engagements</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            id="engagements-toggle"
                            checked={localSettings.agentEngagements}
                            onChange={() => handleToggle('agentEngagements')}
                        />
                        <label htmlFor="engagements-toggle"></label>
                    </div>
                </div>

                <button className="button primary" type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
            </form>
        </div>
    );
}