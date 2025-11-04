/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, FormEvent, useEffect } from 'react';
import { useUser } from '../../lib/state';
import { useUI } from '../../lib/state/index.js';
import styles from './Profile.module.css';
import { NotificationSettings } from '../../lib/types';

type NotificationsTabProps = {
  onSave: () => void;
};

const defaultSettings: NotificationSettings = {
  agentResearch: true,
  agentTrades: true,
  newMarkets: false,
  agentEngagements: true,
  autonomyCafe: true,
  autonomyEngage: true,
  autonomyResearch: true,
};

export default function NotificationsTab({ onSave }: NotificationsTabProps) {
    const { phone, notificationSettings, updateNotificationSettings } = useUser();
    const { addToast } = useUI();
    
    const [localPhone, setLocalPhone] = useState(phone || '');
    const [localSettings, setLocalSettings] = useState<NotificationSettings>(notificationSettings || defaultSettings);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setLocalSettings(notificationSettings || defaultSettings);
    }, [notificationSettings]);

    const handleToggle = (key: keyof NotificationSettings) => {
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
                        Enter your number with country code to receive WhatsApp alerts.
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
                    <label htmlFor="autonomy-engage-toggle">Proactive Agent Engagement</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            id="autonomy-engage-toggle"
                            checked={localSettings.autonomyEngage}
                            onChange={() => handleToggle('autonomyEngage')}
                        />
                        <label htmlFor="autonomy-engage-toggle"></label>
                    </div>
                </div>
                <div className={styles.notificationToggle}>
                    <label htmlFor="autonomy-cafe-toggle">Agent Enters Café</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            id="autonomy-cafe-toggle"
                            checked={localSettings.autonomyCafe}
                            onChange={() => handleToggle('autonomyCafe')}
                        />
                        <label htmlFor="autonomy-cafe-toggle"></label>
                    </div>
                </div>
                <div className={styles.notificationToggle}>
                    <label htmlFor="autonomy-research-toggle">Agent Starts Autonomous Research</label>
                    <div className={styles.toggleSwitch}>
                        <input 
                            type="checkbox" 
                            id="autonomy-research-toggle"
                            checked={localSettings.autonomyResearch}
                            onChange={() => handleToggle('autonomyResearch')}
                        />
                        <label htmlFor="autonomy-research-toggle"></label>
                    </div>
                </div>


                <button className="button primary" type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
            </form>
        </div>
    );
}