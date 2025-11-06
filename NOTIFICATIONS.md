# Feature Guide: Agent-Aware Notifications

This guide explains the advanced notification system in the Polymarket Cafe, which not only alerts you to key events but also makes your AI agent context-aware and provides user-friendly feedback.

---

## 1. Centralized Notification Ledger

Every notification sent to you is first permanently recorded in a dedicated **Notification Ledger** (`notifications` collection) on the server. This creates a complete, auditable history of all communications between the system, your agent, and you.

**Logged Events:**
-   **Agent Research Complete:** When your agent autonomously discovers new intel.
-   **Agent Intel Trade:** When your agent buys or sells intel in the Café.
-   **New "Breaking" Market:** When a new, high-interest market is detected.
-   **Proactive Agent Engagement:** When your agent autonomously decides to reach out to you with an idea or question.
-   **All Autonomous Actions:** When enabled, receive alerts for every step your agent takes, including "Entering the Café" and "Starting Research."

This ledger serves as a foundational piece of your agent's long-term memory.

---

## 2. User-Friendly Feedback Loop

The notification system is designed to be intelligent and helpful, even when it can't reach you.

-   **Smart Failure Detection:** When an attempt to send a WhatsApp notification fails, the system logs the reason.
-   **Proactive Web Notifications:** If a notification fails specifically because you haven't configured a phone number in your settings, the system won't just fail silently. It will send a real-time **toast notification** to your active web session, immediately informing you of the issue and prompting you to update your settings.

---

## 3. Granular Control & Proactive Engagement

You have complete control over your agent's communication and its ability to initiate conversations.

-   **Full User Control:** In your **Profile Settings -> Notifications Tab**, you can enter your WhatsApp-enabled phone number and enable or disable specific notification types, giving you full control over the alerts you receive.
-   **AI-Driven Outreach:** The **Autonomy Director**, which orchestrates your agent's actions, now includes a new possibility: **"Engage User"**.
-   **Example Notification:** "📈 Just a thought on the ETH market I researched: The funding rates are starting to flip negative. Have you considered if this changes our position?"
-   **Opt-In Engagement:** This proactive outreach is entirely opt-in. You can enable or disable it at any time via the "Proactive Agent Engagements" toggle in your notification settings.

This system transforms notifications from simple alerts into a core component of a reliable and user-friendly communication channel, ensuring you're always in the loop.