
import twilio from 'twilio';
import { notificationsCollection, usersCollection } from '../db.js';
import { ObjectId } from 'mongodb';
import { Notification } from '../../lib/types/index.js';

export type SendStatus = {
    sent: boolean;
    reason?: 'NO_PHONE' | 'NO_CLIENT' | 'DISABLED' | 'ERROR' | 'NOT_FOUND';
};

class NotificationService {
    private client: twilio.Twilio | null = null;
    private fromNumber: string | null = null;

    constructor() {
        const accountSid = process.env.TWILIO_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (accountSid && authToken && fromNumber) {
            try {
                this.client = twilio(accountSid, authToken);
                this.fromNumber = fromNumber;
                console.log('[NotificationService] Twilio client initialized successfully.');
            } catch (error) {
                console.error('[NotificationService] Failed to initialize Twilio client:', error);
            }
        } else {
            console.warn('[NotificationService] Twilio credentials not fully configured. WhatsApp notifications are disabled.');
        }
    }

    public async logAndSendNotification(notificationData: Omit<Notification, 'id' | 'timestamp' | 'wasSent'>): Promise<SendStatus> {
        const newNotification: Notification = {
            ...notificationData,
            id: new ObjectId().toHexString(),
            timestamp: Date.now(),
            wasSent: false,
        };

        try {
            // Always log the notification attempt
            await notificationsCollection.insertOne(newNotification as any);
            
            const user = await usersCollection.findOne({ handle: notificationData.userId });

            if (!user) {
                return { sent: false, reason: 'NOT_FOUND' };
            }

            if (!this.client || !this.fromNumber) {
                return { sent: false, reason: 'NO_CLIENT' };
            }

            if (!user.phone) {
                 return { sent: false, reason: 'NO_PHONE' };
            }
            
            const settings = user.notificationSettings;
            let shouldSend = false;

            // Check if this specific notification type is enabled by the user
            switch (notificationData.type) {
                case 'agentResearch': shouldSend = settings?.agentResearch ?? false; break;
                case 'agentTrade': shouldSend = settings?.agentTrades ?? false; break;
                case 'newMarkets': shouldSend = settings?.newMarkets ?? false; break;
                case 'agentEngagement': shouldSend = settings?.agentEngagements ?? false; break;
                case 'autonomyCafe': shouldSend = settings?.autonomyCafe ?? false; break;
                case 'autonomyEngage': shouldSend = settings?.autonomyEngage ?? false; break;
                case 'autonomyResearch': shouldSend = settings?.autonomyResearch ?? false; break;
            }

            if (shouldSend) {
                await this.client.messages.create({
                    body: newNotification.message,
                    from: `whatsapp:${this.fromNumber}`,
                    to: `whatsapp:${user.phone}`
                });
                
                // Update the log entry to mark it as sent
                await notificationsCollection.updateOne({ _id: new ObjectId(newNotification.id) }, { $set: { wasSent: true } });
                console.log(`[NotificationService] Logged and sent WhatsApp message to ${user.handle}`);
                return { sent: true };
            } else {
                return { sent: false, reason: 'DISABLED' };
            }
        } catch (error) {
            console.error(`[NotificationService] Failed to log or send notification:`, error);
            return { sent: false, reason: 'ERROR' };
        }
    }
}

export const notificationService = new NotificationService();