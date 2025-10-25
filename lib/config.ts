/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file centralizes environment-specific configurations.
// It uses Vite's built-in environment variables to determine if the
// application is running in a production or development build.
// https://vitejs.dev/guide/env-and-mode.html

// FIX: Reverted to using `process.env.NODE_ENV` for better compatibility
// between client (Vite) and server (Node.js) environments.
const isProduction = process.env.NODE_ENV === 'production';

// Use the production domain if in production, otherwise use the local server.
// `process.env.VITE_PUBLIC_APP_URL` is supplied by Vite on the client and dotenv on the server.
const PROD_DOMAIN = process.env.VITE_PUBLIC_APP_URL || 'https://polymarket-cafe.sliplane.app/';

export const API_BASE_URL = isProduction
  ? `${PROD_DOMAIN}`
  : 'http://localhost:3001';

export const SOCKET_URL = isProduction
  ? `${PROD_DOMAIN}`
  : 'http://localhost:3001';