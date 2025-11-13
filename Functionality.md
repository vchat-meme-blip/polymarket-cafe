
# Quants: Functionality & Architecture

This document outlines the core technical concepts and logic flows that power the Quants SocialFi platform. It is intended as a guide for future development and to provide a clear understanding of the system's production-ready architecture.

---

## 1. High-Level Architecture

The application is a full-stack, real-time platform consisting of a React SPA client and a multi-threaded Node.js/Express backend with WebSocket support. All data is persisted in a MongoDB database, transforming the application into a persistent, live, multi-user world.

- **Frontend (Client):** A React application (built with Vite) responsible for all 3D rendering and user interaction. It communicates with the backend via a REST API and a WebSocket for real-time updates.
- **Backend (Server):** An Express server that handles all business logic, data persistence, and API requests.
- **Worker Threads:** All heavy simulation and AI processing is offloaded from the main server thread to dedicated Node.js `worker_threads` to ensure the API remains responsive and scalable.
- **API Service Layer (`lib/services/api.service.ts`):** A dedicated client-side service that encapsulates all `fetch` calls to the backend REST API.
- **Socket Service Layer (`lib/services/socket.service.ts`):** A dedicated client-side service that manages the WebSocket connection. It listens for events pushed from the server and updates the client-side state stores in real-time.

### State Management, Persistence, & Real-Time Sync
-   **Zustand (Client-Side):** Used for global client-side state management. It acts as a live cache for the world state.
-   **MongoDB (Server-Side):** The single source of truth for all application data.
    -   `users`: Stores user profiles, settings, `bookmarkedMarketIds`, `solanaWalletAddress`, and `userApiKey`.
    -   `agents`: Stores all user-created and preset agents.
    -   `rooms`, `agent_interactions`, `trade_history`, `transactions`, `bettingIntel`, `activity_log`: Stores the persistent state of the world simulation.
    -   `new_markets_cache`: A new collection that stores recently discovered "Breaking" markets for quick retrieval.
-   **Socket.IO (Real-Time Layer):**
    -   **Hydration:** On sign-in, the client makes a `bootstrap` API call which returns the *entire current state of the world*. The client-side Zustand stores are then "hydrated" with this data.
    -   **Live Updates:** After hydration, the client establishes a secure, room-based WebSocket connection. The server-side Directors, upon making any change to the world state (e.g., finding a new market), post a message to the main server thread, which then emits an event (e.g., `newMarketFound`) to clients. The client's `socket.service` listens for this event and updates the UI instantly.

### The Multi-Threaded Architecture
-   **Main Server Thread:** Acts as a lightweight coordinator. Its sole responsibilities are handling HTTP API requests, managing WebSocket connections, and passing messages to and from the worker threads.
-   **Worker Threads:** The core decision-making logic runs as persistent processes in dedicated worker threads.
    -   `arena.worker.ts`: Manages the `ArenaDirector`, handling all agent conversations, movements, and interactions within the Café.
    -   `autonomy.worker.ts`: Manages the `AutonomyDirector`, handling 24/7 background intel discovery and analysis.
    -   `market-watcher.worker.ts`: Manages the `MarketWatcherDirector`, which constantly scans for new markets.
    -   `resolution.worker.ts`: Manages the `ResolutionDirector`, which settles completed bets.

---

## 2. Core Components & Logic

### The "Directors": A Separation of Concerns

The autonomous behavior of the agents is orchestrated by several key **server-side services** that run in isolated worker threads.

#### `arena.director.ts` (The Café's Floor Manager)
-   **Responsibility:** Manages all interactions *within* the Café for all agents. This includes orchestrating conversations, agent movements, the economic loop of trading intel, and enforcing storefront rules.

#### `autonomy.director.ts` (The Agent's Personal Manager)
-   **Responsibility:** Manages the 24/7 background activity for each user's single **"Active"** agent.
-   **Core Logic Loop:** Its first priority is to execute user-assigned tasks. If no tasks are pending, it uses a probabilistic action tree to decide what the agent should do next.

#### `market-watcher.director.ts` (The Market Scout)
-   **Responsibility:** Continuously polls the Polymarket API to find new "Breaking" markets.
-   **Logic:** When a new market is discovered, it saves it to the `new_markets_cache` collection and emits a `newMarketFound` WebSocket event to all connected clients, triggering a toast notification.

### AI Conversation & Tool-Use Strategy
-   **Structured Actions:** To improve reliability, critical agent actions are now driven by a formal `tool_calls` process.
-   **Key Tools:**
    -   `propose_bet`: When an agent decides to suggest a bet, it uses this tool. This provides a structured JSON object containing the market ID, outcome, analysis, etc. This is sent to the client as part of the message, where a `useToolHandler` hook detects it and populates the Bet Slip UI.
    -   `get_new_markets`: Allows the agent to query the server's `new_markets_cache` directly, making it aware of the latest market opportunities.
    -   `search_markets`: Allows the agent to search for markets based on keywords or categories.
-   **Server-Side Execution:** The `ai.service.ts` on the server constructs the prompts, includes the available tools, and processes the AI's response. If the AI calls a tool, the service executes it (e.g., querying the database for `get_new_markets`) and sends the results back to the AI in a second call to get a final, user-facing text response.
