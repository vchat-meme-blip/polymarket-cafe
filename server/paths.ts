import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// @ts-ignore - Handle both ESM and CommonJS
const __filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta?.url || '');
const __dirname = dirname(__filename);

export const PATHS = {
  root: resolve(__dirname, '..'),
  lib: resolve(__dirname, '..', 'lib'),
  server: __dirname,
  sharedTypes: resolve(__dirname, '..', 'lib', 'types', 'shared.ts')
};

export const getImportPath = (from: string, to: string): string => {
  const relativePath = `./${to}`.replace(/\//g, '/');
  return relativePath;
};
