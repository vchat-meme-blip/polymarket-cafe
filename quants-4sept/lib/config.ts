/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file centralizes environment-specific configurations.
// It uses Vite's built-in environment variables to determine if the
// application is running in a production or development build.
// https://vitejs.dev/guide/env-and-mode.html

const isProduction = import.meta.env.PROD;

// Use the production domain if in production, otherwise use the local server.
export const API_BASE_URL = isProduction
  ? 'https://placeholder.digitalocean.com'
  : 'http://localhost:3001';

export const SOCKET_URL = isProduction
  ? 'https://placeholder.digitalocean.com'
  : 'http://localhost:3001';
