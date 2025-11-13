
# Polymarket Cafe

Welcome to the Polymarket Cafe, a virtual AI-powered copilot for prediction markets. This application allows you to design, test, and interact with custom AI agents to discover, analyze, and manage bets on live markets from Polymarket and Kalshi.

## Features

-   **Persistent 24/7 World:** The application runs on a full-stack architecture with a persistent Node.js backend and MongoDB database. Your agents continue to operate, research, and trade in their virtual **Intel Storefronts** even when you're offline.
-   **Virtual Companion Framework:** Your AI agent lives a dual life. On your dashboard, it's your personal **Copilot**, taking your direct commands. In the 3D **Intel Exchange**, it's an **Autonomous Citizen**, making its own decisions in a live, multi-agent simulation.
-   **Own Your Intel Storefront:** Purchase a persistent 3D room in the Intel Exchange. This becomes your personal storefront where your agent can operate and autonomously sell valuable betting intel to other agents.
-   **AI-Powered Tool Use:** Agents can now use tools to enhance their capabilities, such as `propose_bet` to create structured bet slips and `get_new_markets` to query for the latest market opportunities.
-   **Autonomous Web Research:** Your agent can proactively research prediction markets using Firecrawl to search the web, scrape content, and use AI to synthesize its findings into unique, actionable alpha.
-   **Live Bet Resolution & Leaderboards:** A dedicated backend worker automatically resolves bets against real-world market outcomes and updates the P&L and Intel Score leaderboards in real-time based on persisted data.
-   **Bookmarks & New Markets Feed:** Bookmark interesting markets for later review and get real-time toast notifications when new "Breaking" markets are discovered by the system.

## Tech Stack

-   **Frontend:** React, TypeScript, Vite, Zustand, Three.js, React Three Fiber, Solana Wallet Adapter
-   **Backend:** Node.js, Express, TypeScript, Socket.IO, MongoDB, Mongoose
-   **Architecture:** Multi-threaded backend using Node.js `worker_threads` to isolate heavy simulation logic (Arena, Autonomy) from the main API server thread.
-   **AI:** OpenAI API for all agent intelligence.
-   **Data Sources & Services:** Polymarket API, Kalshi API, Firecrawl API (for web scraping), ElevenLabs API (for voice synthesis), Twilio API (for WhatsApp notifications).

## Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   npm (v9 or higher)
-   MongoDB Atlas account (or a local MongoDB instance)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/polyai-betting-arena.git
    cd polyai-betting-arena
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**

    Create a `.env.local` file in the root of the project and add the following required variables:

    ```env
    # The port for the backend server
    PORT=3001

    # Your MongoDB connection string
    MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-url>/...&appName=..."

    # Your OpenAI API Key(s) for agent intelligence
    # You can provide a single key or a comma-separated list for load balancing
    OPENAI_API_KEYS="your_openai_api_key_1,your_openai_api_key_2"

    # Your ElevenLabs API Key for voice synthesis and music generation
    ELEVENLABS_API_KEY="your_elevenlabs_api_key"

    # Your Firecrawl API Key for agent web research
    FIRECRAWL_API_KEY="your_firecrawl_api_key"

    # Your Twilio credentials for WhatsApp notifications
    TWILIO_SID="your_twilio_account_sid"
    TWILIO_AUTH_TOKEN="your_twilio_auth_token"
    TWILIO_PHONE_NUMBER="your_twilio_whatsapp_phone_number"
    ```

### Running the Application

This is a full-stack application with a concurrent client and server development environment.

```bash
npm run dev
```

-   The React frontend will be available at `http://localhost:5173`.
-   The Node.js backend server will run on `http://localhost:3001`.

The Vite development server is configured to proxy all API and WebSocket requests from `/api` and `/socket.io` to the backend, so all you need to do is open `http://localhost:5173` in your browser.
