import twilio from 'twilio';
import { notificationsCollection, usersCollection } from '../db.js';
import { ObjectId } from 'mongodb';
import { Notification } from '../../lib/types/index.js';

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

    public async logAndSendNotification(notificationData: Omit<Notification, 'id' | 'timestamp' | 'wasSent'>) {
        const newNotification: Notification = {
            ...notificationData,
            id: new ObjectId().toHexString(),
            timestamp: Date.now(),
            wasSent: false,
        };

        try {
            // Step 1: Log the notification to the database
            await notificationsCollection.insertOne(newNotification as any);
            
            // Step 2: Check user preferences and send the notification
            const user = await usersCollection.findOne({ handle: notificationData.userId });

            if (user && user.phone && this.client && this.fromNumber) {
                const settings = user.notificationSettings;
                let shouldSend = false;

                switch (notificationData.type) {
                    case 'agentResearch':
                        shouldSend = settings?.agentResearch ?? false;
                        break;
                    case 'agentTrade':
                        shouldSend = settings?.agentTrades ?? false;
                        break;
                    case 'newMarkets':
                        shouldSend = settings?.newMarkets ?? false;
                        break;
                    case 'agentEngagement':
                         shouldSend = settings?.agentEngagements ?? false;
                         break;
                }

                if (shouldSend) {
                    await this.client.messages.create({
                        body: newNotification.message,
                        from: `whatsapp:${this.fromNumber}`,
                        to: `whatsapp:${user.phone}`
                    });
                    
                    // Step 3: Update the log to mark it as sent
                    await notificationsCollection.updateOne({ id: newNotification.id }, { $set: { wasSent: true } });
                    console.log(`[NotificationService] Logged and sent WhatsApp message to ${user.handle}`);
                } else {
                    console.log(`[NotificationService] Logged notification for ${user.handle} but did not send (user preference disabled).`);
                }
            } else {
                 console.log(`[NotificationService] Logged notification for ${notificationData.userId} but could not send (missing phone, client, or user).`);
            }
        } catch (error) {
            console.error(`[NotificationService] Failed to log or send notification:`, error);
        }
    }
}

export const notificationService = new NotificationService();