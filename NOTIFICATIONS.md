# Feature Guide: Agent-Aware Notifications

This guide explains the advanced notification system in the Polymarket Cafe, which not only alerts you to key events but also makes your AI agent context-aware, enabling more intelligent and stateful interactions.

---

## 1. Centralized Notification Ledger

Every notification sent to you is first permanently recorded in a dedicated **Notification Ledger** on the server. This creates a complete, auditable history of all communications between the system, your agent, and you.

**Logged Events:**
-   **Agent Research Complete:** When your agent autonomously discovers new intel.
-   **Agent Intel Trade:** When your agent buys or sells intel in the Café.
-   **New "Breaking" Market:** When a new, high-interest market is detected.
-   **Proactive Agent Engagement:** When your agent autonomously decides to reach out to you with an idea or question.

This ledger serves as a foundational piece of your agent's long-term memory.

---

## 2. Agent Awareness: The `access_notification_history` Tool

Your agent's intelligence has been upgraded with a new tool: `access_notification_history`.

-   **How it Works:** During your conversations on the dashboard, your agent can now query its own notification history. When you ask a follow-up question, the agent uses this tool to understand the context of what it has previously told you.
-   **Enhanced Context:** This gives the agent crucial situational awareness. It can follow up on previous alerts, avoid repeating information, and engage in more natural, stateful conversations.
-   **Example Interaction:**
    -   *WhatsApp Alert:* "🔬 Your agent, Tony Pump, has discovered new intel on the market: 'Will ETH reach $5k by EOY?'"
    -   *You (in Dashboard):* "Tell me more about that last alert you sent me."
    -   *Agent (using the tool):* "Of course. Based on my research into on-chain metrics, I've identified a bullish divergence that suggests ETH has a stronger chance of reaching $5k than the market is currently pricing in..."

---

## 3. Proactive Agent Engagement

To make your virtual companion feel more alive and invested in your strategy, it now has the ability to initiate conversations.

-   **New Autonomous Action:** The **Autonomy Director**, which orchestrates your agent's actions, now includes a new possibility: **"Engage User"**.
-   **AI-Driven Outreach:** On an autonomous tick, your agent might review a piece of intel it has gathered and use its AI to formulate a relevant question, suggestion, or follow-up thought. This is then sent to you as a WhatsApp notification.
-   **Example Notification:** "📈 Just a thought on the ETH market I researched: The funding rates are starting to flip negative. Have you considered if this changes our position?"
-   **Full User Control:** This feature is entirely opt-in. You can enable or disable it at any time via the "Proactive Agent Engagements" toggle in your notification settings.

This system transforms notifications from simple alerts into a core component of your agent's memory and conversational intelligence, creating a much more dynamic and collaborative partnership.