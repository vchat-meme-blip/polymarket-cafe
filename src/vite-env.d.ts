/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly VITE_PUBLIC_APP_URL: string;
  readonly VITE_API_URL: string;
  // Add other Vite environment variables here if needed
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


// FIX: Moved Express Request type augmentation here to ensure it's applied globally.
// This resolves errors related to custom properties on the Request object and
// incorrect type inference for Express middleware.
declare global {
  namespace Express {
    interface Request {
      arenaWorker?: import('worker_threads').Worker;
      resolutionWorker?: import('worker_threads').Worker;
      autonomyWorker?: import('worker_threads').Worker;
      // FIX: Added missing dashboardWorker property to the Express Request interface.
      dashboardWorker?: import('worker_threads').Worker;
    }
  }
}

// FIX: Added an empty export to make this file a module, which is required for `declare global` to work. This fixes the error "Augmentations for the global scope can only be directly nested in external modules..." and allows the Express Request type to be correctly augmented across the project.
export {};