/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file centralizes environment-specific configurations.
// It uses Vite's built-in environment variables to determine if the
// application is running in a production or development build.
// https://vitejs.dev/guide/env-and-mode.html

const isProduction = process.env.NODE_ENV === 'production';

// For production, use the dedicated API URL from env. For development, use a relative path
// which will be handled by the Vite proxy.
export const API_BASE_URL = isProduction
  ? process.env.VITE_API_BASE_URL || 'https://api.polymarketcafe.sliplane.app'
  : '';

export const SOCKET_URL = isProduction
  ? process.env.VITE_SOCKET_URL || 'https://api.polymarketcafe.sliplane.app'
  : 'http://localhost:3001';
