// FIX: Removed duplicate ImportMetaEnv and ImportMeta definitions to resolve conflicts with src/vite-env.d.ts.

declare module '*.module.css' {
  // FIX: Renamed identifier to 'styles' to resolve a duplicate identifier error. This avoids a name collision with ambient types from Vite that also declare this module.
  // FIX: Renamed 'content' to 'styles' to resolve a duplicate identifier error and align with the comment.
  // FIX: Changed identifier to 'classes' to address the "Duplicate identifier 'classes'" error.
  // FIX: Changed identifier from 'classes' to 'moduleClasses' to resolve a "Duplicate identifier 'classes'" error. This avoids conflicts with ambient type declarations from Vite.
  const moduleClasses: { [key: string]: string };
  export default moduleClasses;
}
