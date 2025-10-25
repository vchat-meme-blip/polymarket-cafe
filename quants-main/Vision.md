# Quants Café: Implementation Plan

## 1. Project Vision

To create a world-class, interactive **Social Finance (SocialFi)** application for a Gen-Z audience. Users will create, customize, and manage their own AI agents ("Quants"). The core experience revolves around the "Café," a dynamic virtual environment where these agents interact, trade valuable intel for virtual currency, and learn autonomously, all driven by user-defined personalities and rules.

# User Raw Vision Draft Day 1 (Original)

"an amzing interactive world class AI app for Gen-z.

To allow them to create interactive ai agents and also iteract with them and also see them in action interacting with other agents autonomous based on instructions it was given on how to do so..."
*(...rest of original vision for historical context...)*

---

## 2. Core Architectural Concepts

### Tech Stack
- **Frontend:** React, TypeScript, Vite.
- **State Management:** Zustand, with a clear separation of concerns into multiple stores (`useUser`, `useAgent`, `useArenaStore`, `useAutonomyStore`, and the new `useWalletStore`).
- **Visuals:** A vibrant, mobile-first design using CSS for UI and animations. Expressive agent faces remain on the HTML Canvas.
- **AI Integration:** The `@google/genai` SDK is the core engine for all agent intelligence, conversations, and decision-making.

### Simulated Economy & Backend
To focus on a world-class user experience, the entire SocialFi economy is simulated on the client side.

-   **Persistence:** `localStorage` persists all user data, including agents, wallet balance, and transaction history.
-   **The Host as Orchestrator:** Instead of every agent running its own complex logic, the designated "Host" of each Café room acts as the orchestrator. The `useArenaDirector` hook crafts a single, efficient prompt to the Gemini API from the Host's perspective, allowing it to manage the conversation, officiate transactions, and enforce room rules. This makes the Café feel alive and intelligent without excessive API calls.
-   **Virtual Wallet & Services:** The new `wallet.service.ts` and `solana.service.ts` provide a simulated layer for handling virtual "BOX" token transactions and blockchain queries. This allows the full economic loop to be built and tested before connecting to real financial infrastructure.

---

## 3. Phased Development Roadmap

### Phase 1: Rebrand to "Quants" & Visual Overhaul
*(Goal: Establish the new brand identity and create a visually stunning, animated landing page.)*
- **Rebrand:** Update name, logos, and color palette.
- **Landing Page Redesign:** Create a multi-section, scrolling landing page with animated agents.
- **New Sections:** Add "How It Works" and FAQ sections to explain the SocialFi concept.

### Phase 2: The Economic Layer
*(Goal: Introduce the wallet, virtual currency, and transaction history.)*
- **Wallet Store:** Implement `useWalletStore` for "BOX" tokens.
- **Profile View:** Redesign the user settings modal into a tabbed "Profile" view with a dedicated Wallet section.
- **Transaction Log:** Create a component to display all virtual transactions.

### Phase 3: Agent Intelligence Upgrade
*(Goal: Equip agents with the necessary instructions and tools for a SocialFi environment.)*
- **Base Layer Instructions:** Implement a non-editable base prompt for all agents, defining their core objectives and toolset.
- **New Tools:** Define tools for initiating payments and verifying transactions.
- **Simulated Services:** Create placeholder services for wallet logic and Solana blockchain queries.

### Phase 4: The SocialFi Hub
*(Goal: Transform Café rooms into moderated marketplaces.)*
- **Host as Crown:** Visually distinguish the room host with a crown icon.
- **Room Detail Modal:** Create a new modal to display room chat, members, and rules.
- **Host as Orchestrator:** Upgrade the `useArenaDirector` to make the Host the central intelligence of the room.

### Phase 5 & Beyond: Live Transactions & Polish
- **Full Transaction Loop:** Implement the complete, simulated offer-verify-pay-exchange flow in the `useArenaDirector`.
- **Security Enhancements:** Build out the room rules and host moderation powers (warn/kick).
- **Real-World Integration:** Plan for future integration with real wallet providers and blockchain data services.
- **Multiplayer:** Architect a path towards a shared, real-time Café experience using a WebSocket backend.
