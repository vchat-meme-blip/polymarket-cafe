/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { useAutonomyStore } from '../../lib/state/autonomy.js';
import { ActivityLogEntry } from '../../lib/types/index.js';
import styles from './ActivityLogPanel.module.css';
import { format } from 'date-fns';

const LOG_ICONS: Record<ActivityLogEntry['type'], string> = {
    cafe: 'coffee',
    research: 'science',
    trade: 'swap_horiz',
    engagement: 'chat',
    system: 'dns',
};

const ActivityItem = ({ log }: { log: ActivityLogEntry }) => {
    return (
        <div className={styles.activityItem}>
            <div className={styles.activityHeader}>
                <span className={`icon ${styles.activityIcon} ${styles[log.type]}`}>{LOG_ICONS[log.type]}</span>
                <span className={styles.activityType}>{log.type}</span>
                <span className={styles.activityTimestamp}>{format(log.timestamp, 'HH:mm:ss')}</span>
            </div>
            <p className={styles.activityDescription}>
                {log.message}
                {log.triggeredNotification && <span className={`icon ${styles.notificationIcon}`} title="Notification Sent">notifications_active</span>}
            </p>
        </div>
    );
};

export default function ActivityLogPanel() {
    const { activityLog } = useAutonomyStore();

    return (
        <div className={styles.activityLog}>
            {activityLog.length > 0 ? (
                activityLog.map(log => <ActivityItem key={log.id} log={log} />)
            ) : (
                <div className={styles.emptyLog}>
                    <p>No autonomous activity recorded yet.</p>
                </div>
            )}
        </div>
    );
}
