
# Quants: Functionality & Architecture

This document outlines the core technical concepts and logic flows that power the Quants SocialFi platform. It is intended as a guide for future development and to provide a clear understanding of the system's production-ready architecture.

---

## 1. High-Level Architecture

The application is a full-stack, real-time platform consisting of a React SPA client and a multi-threaded Node.js/Express backend server with WebSocket support. All data is persisted in a MongoDB database, transforming the application into a persistent, live, multi-user world.

- **Frontend (Client):** A React application (built with Vite) responsible for all 3D rendering and user interaction. It communicates with the backend via a REST API and a WebSocket for real-time updates.
- **Backend (Server):** An Express server that handles all business logic, data persistence, and API requests.
- **Worker Threads:** All heavy simulation and AI processing is offloaded from the main server thread to dedicated Node.js `worker_threads` to ensure the API remains responsive and scalable.
- **API Service Layer (`lib/services/api.service.ts`):** A dedicated client-side service that encapsulates all `fetch` calls to the backend REST API.
- **Socket Service Layer (`lib/services/socket.service.ts`):** A dedicated client-side service that manages the WebSocket connection. It listens for events pushed from the server and updates the client-side state stores in real-time.

### State Management, Persistence, & Real-Time Sync
-   **Zustand (Client-Side):** Used for global client-side state management. It acts as a live cache for the world state.
-   **MongoDB (Server-Side):** The single source of truth for all application data.
    -   `users`: Stores user profiles, settings, `solanaWalletAddress`, and `userApiKey`.
    -   `agents`: Stores all user-created and preset agents.
    -   `rooms`, `conversations`, `bounties`, `intel`, `transactions`, `activity_log`: Stores the persistent state of the world simulation.
-   **Socket.IO (Real-Time Layer):**
    -   **Hydration:** On sign-in, the client makes a `bootstrap` API call which returns the *entire current state of the world*. The client-side Zustand stores are then "hydrated" with this data.
    -   **Live Updates:** After hydration, the client establishes a secure, room-based WebSocket connection. The server-side Directors, upon making any change to the world state (e.g., moving an agent), post a message to the main server thread, which then emits an event (e.g., `agentMoved`) to the appropriate user's private room. The client's `socket.service` listens for this event and updates the UI instantly.

### The Multi-Threaded Architecture
-   **Main Server Thread:** Acts as a lightweight coordinator. Its sole responsibilities are handling HTTP API requests, managing WebSocket connections, and passing messages to and from the worker threads. It does not perform any blocking I/O or heavy computation.
-   **Worker Threads:** The core decision-making logic runs as persistent processes in dedicated worker threads.
    -   `arena.worker.ts`: Manages the `ArenaDirector`, handling all agent conversations, movements, and interactions within the Café.
    -   `autonomy.worker.ts`: Manages the `AutonomyDirector`, handling 24/7 background intel discovery and analysis.
-   **Communication:** The main thread and workers communicate asynchronously via `postMessage`, ensuring the main event loop is never blocked by long-running AI API calls or complex simulations.

---

## 2. Core Components & Logic

### The "Directors": A Separation of Concerns

The autonomous behavior of the agents is orchestrated by two key **server-side services** that run in isolated worker threads.

#### `arena.director.ts` (The Café's Floor Manager)
-   **Responsibility:** Manages all interactions *within* the Café for all agents. This includes orchestrating conversations, agent movements, the economic loop of trading intel, and enforcing storefront rules.
-   **Core Logic Loop:** Runs on a fast (5-second) server heartbeat. It processes all active conversations in **parallel** for scalability. It also handles event-driven actions (like instantly starting a conversation) and manages the lifecycle of rooms (creating, destroying, and enforcing rules like `operatingHours` and `ban lists`).

#### `autonomy.director.ts` (The Agent's Personal Manager)
-   **Responsibility:** Manages the 24/7 background activity for each user's single **"Active"** agent. It ensures the agent remains productive even when the user is offline.
-   **Core Logic Loop:** Runs on the server's heartbeat to process a **batch** of active users on each tick. For each agent, it uses a probabilistic action tree to decide whether the agent should go to the Café, proactively engage the user with an insight, or conduct deep web research for new alpha.

### AI Conversation & Tool-Use Strategy
-   **The Challenge:** An agent's primary goal is to trade intel, but having them immediately make offers is unnatural. Believable social interaction requires a balance between free-form conversation and discrete, tool-based actions.
-   **The "Social Warm-up" Protocol:** To solve this, the `ArenaDirector` uses a layered prompting strategy.
    1.  **Prioritize Dialogue:** The agent's core `systemInstruction` explicitly tells it to **prioritize natural, in-character conversation first**. It is forbidden from using any tools for the first 2-3 turns of a conversation to force a "warm-up" period.
    2.  **Paywall-Aware Prompts:** Host agents are made aware of their tradable inventory (both `BettingIntel` and `MarketWatchlists`). They are instructed to hint at their valuable assets to create intrigue but will **not** reveal the content for free, encouraging a transaction.
    3.  **Strategic Tool Use:** Tool-calling (e.g., `create_intel_offer`) is framed as an action to be taken only *after* a potential deal has been discussed, making the transition from social chat to economic transaction feel earned and logical.
    4.  **Handling Mixed Responses:** The Gemini API can respond with both conversational text and a `functionCall` in the same turn. The director handles this by executing the function (updating world state) and then generating a summary of that action to add to the chat log, ensuring a coherent conversational turn.

### Granular API Key Management
-   **Purpose:** To create a fair, "user-pays" model that is also robust against single-key rate-limiting.
-   **Logic (Server-Side):** For any AI-powered action, the directors use a central `apiKeyProvider` to determine which key to use.
    -   **Direct Chat & Personal Actions:** Uses the current user's saved API key from the database.
    -   **Agent Conversations (Café):** Uses an alternating key strategy. Agent A's turn uses Agent A's owner's key; Agent B's turn uses Agent B's owner's key.
    -   **Server & MCP Actions:** Any action performed by a non-user-owned agent (or if a user hasn't provided a key) falls back to a managed pool of server keys from the environment variables, complete with cooldown and rotation logic.
-   **Fairness Rule:** If an agent's owner has not provided a valid API key, that agent forfeits its AI-powered actions (e.g., it will not speak in a conversation where it is their turn).