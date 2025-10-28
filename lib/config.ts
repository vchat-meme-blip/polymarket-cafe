/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file centralizes environment-specific configurations.
// It uses Vite's built-in environment variables to determine if the
// application is running in a production or development build.
// https://vitejs.dev/guide/env-and-mode.html

const isProduction = process.env.NODE_ENV === 'production';

// In production, API calls should be relative paths to the current domain.
// In development, they should point to the backend server defined in vite.config.js proxy.
export const API_BASE_URL = isProduction ? '' : '/api';

// In production, the socket connects to the same host.
// In development, it uses the path proxied by vite.config.js.
export const SOCKET_URL = isProduction ? '/' : '/';
