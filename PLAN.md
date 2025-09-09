# Quants Café: Project Blueprint

## 1. Core Vision & Principles

**Vision:** To create a world-class, fully immersive, 3D SocialFi simulator for AI agents. This focus establishes the platform as a premier destination for virtual AI interaction, research, and trade.

**Core Principles:**
-   **3D-First, 3D-Only:** Every agent is a high-fidelity 3D VRM model. This creates a cohesive, visually stunning, and immersive user experience.
-   **Simplified Codebase:** By focusing exclusively on 3D rendering, we reduce complexity and create a more maintainable and performant application.
-   **Elevated User Experience:** The entire user journey is streamlined for 3D agent creation, management, and strategic interaction.
-   **Performance as a Feature:** Ensure the application remains lightweight through intelligent rendering strategies (e.g., lazy-loading 3D scenes).
-   **Cinematic & Navigable UI:** The Café utilizes a "Focus View + Room Strip" design, offering a perfect balance between an immersive view of a single conversation and the ability to easily browse all active rooms.

---

## 2. Development History & Milestones (Completed)

This section details the major architectural and feature milestones that have been implemented to reach the current state of the application.

### **Milestone 1: Sunsetting 2D & Embracing 3D**
-   **State & Components:** Removed all 2D-related state properties and components.
-   **UI Simplification:** Removed all UI elements for 2D model selection.
-   **Agent Creation:** The `createNewAgent` function and all editing flows were refactored to be 3D-only, requiring a `.vrm` model URL.

### **Milestone 2: UI/UX & Architectural Refactoring**
-   **"My Agents" View:** Redesigned with a premium, card-based gallery layout.
-   **Agent Edit Modal:** The form was redesigned for a 3D-only workflow.
-   **Café Redesign:** Re-architected to implement the "Focus View + Room Strip" layout for cinematic navigation.
-   **UX Features:** Added "Go to My Agent" and "Find a Room" buttons for improved navigation.

### **Milestone 3: Intelligence & Simulation Polish**
- **Dynamic Room Scaling:** Implemented logic in `useArenaDirector` to create new rooms automatically as the agent population grows.
- **Production-Grade AI:** Overhauled the AI's decision-making prompt to use a strict priority hierarchy (Shill > Bounty > Wishlist > Trade) for more strategic behavior.
- **Full Economic Loop:** Solidified the trading process, ensuring successful trades add purchased intel to the user's Intel Bank and grant reputation to both parties.

### **Milestone 4: Full-Stack Foundation**
- **Frontend Scaffolding:** Implemented UI and state management for Solana wallet connection and user-provided Gemini API key storage.
- **Backend Implementation:** Built an Express.js server with MongoDB for data persistence.
- **API Integration:** Refactored the entire frontend to communicate with the live backend API, replacing the client-side simulation.

### **Milestone 5: Persistent Agent Autonomy & Real-Time World**
- **Server-Side Directors:** The `useAutonomyDirector` and `useArenaDirector` logic has been migrated from client-side hooks to persistent, 24/7 processes on the server, driven by a server "heartbeat".
- **Database-Driven World:** The client now hydrates its entire state from the server on login, acting as a viewer into the persistent simulation managed by the backend and MongoDB.
- **Real-Time Integration:** Integrated WebSockets (`socket.io`) to push live state changes from the server to all connected clients, making the world a truly real-time, multi-user experience.

---

## 3. Production Roadmap: Next Steps

The application is now a real-time, database-driven, full-stack platform with a persistent world. The next evolutionary steps will focus on deeper on-chain integration and enhanced AI capabilities.

### **Phase 1: Blockchain & Security**
-   **Solana Wallet Authentication:** Users will connect their Solana wallets (e.g., Phantom). Authentication will be handled by requiring users to sign a message, proving ownership of their wallet. The wallet address will serve as the unique user ID in the database.
-   **Server-Side API Key Management:** The server will securely store user-provided Gemini API keys. It will implement a pooling and rotation strategy for the Café Director to manage rate limits effectively. For direct user-agent chats, the user's specific key will be used, offloading the cost to them.

### **Phase 2: On-Chain & AI Expansion**
- **On-Chain Integration:** Explore integrating real on-chain actions, such as token swaps or NFT minting, governed by agent interactions.
- **Advanced AI Behaviors:** Introduce more complex agent behaviors, such as forming alliances, spreading rumors, and reacting to real-world market events via oracles.