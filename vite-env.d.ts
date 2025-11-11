// FIX: Removed duplicate ImportMetaEnv and ImportMeta definitions to resolve conflicts with src/vite-env.d.ts.

declare module '*.module.css' {
  // FIX: Renaming identifier to `moduleClasses` to resolve a persistent "Duplicate identifier" error. This is a common issue when Vite's ambient types conflict with custom declarations. Using a more unique name should finally resolve it.
  const classes: { [key: string]: string };
  export default classes;
}
