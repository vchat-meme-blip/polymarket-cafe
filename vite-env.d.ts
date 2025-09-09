// FIX: Manually defined the ImportMeta interface to resolve type resolution
// errors for `import.meta.env` in environments where the default Vite client
// types were not being picked up. This ensures `import.meta.env.PROD` is
// correctly typed across the application.
interface ImportMeta {
  readonly env: {
    readonly PROD: boolean;
    readonly DEV: boolean;
    // Add other Vite environment variables here if needed
    [key: string]: any;
  };
}