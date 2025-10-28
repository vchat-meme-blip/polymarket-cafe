// FIX: Removed the non-resolving vite/client type reference. The necessary types for import.meta.env are manually defined below.

interface ImportMetaEnv {
  // API and App URLs
  readonly VITE_API_BASE_URL: string
  readonly VITE_PUBLIC_APP_URL: string
  readonly VITE_SOCKET_URL: string
  
  // Authentication
  readonly NEXTAUTH_URL: string
  readonly NEXTAUTH_SECRET: string

  // AI Services
  readonly OPENAI_API_KEYS: string
  readonly OPENAI_MODEL: string
  readonly ELEVENLABS_API_KEY: string
  readonly GEMINI_API_KEY: string
  readonly GEMINI_API_KEY_1: string
  readonly GEMINI_API_KEY_2: string
  readonly GEMINI_API_KEY_3: string
  readonly GEMINI_API_KEY_4: string
  readonly GEMINI_API_KEY_5: string

  // External Services
  readonly POLYMARKET_API_KEY: string
  readonly KALSHI_API_KEY: string
  readonly TWITTER_BEARER_TOKEN: string
  readonly SOLSCAN_API_KEY: string

  // Environment
  readonly NODE_ENV: 'development' | 'production' | 'test'
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.module.css' {
  const classes: { [key: string]: string }
  export default classes
}