// FIX: Removed duplicate ImportMetaEnv and ImportMeta definitions to resolve conflicts with src/vite-env.d.ts.

declare module '*.module.css' {
  // FIX: Renamed identifier to 'styles' to resolve a duplicate identifier error. This avoids a name collision with ambient types from Vite that also declare this module.
  const content: { [key: string]: string };
  export default content;
}
