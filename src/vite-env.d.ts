/// <reference types="vite/client" />

// Extends Vite's built-in ImportMetaEnv
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  // add other environment variables here as needed
}

// This ensures `import.meta.env` is correctly typed with our extensions
interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}
