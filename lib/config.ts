/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file centralizes environment-specific configurations.
// It uses Vite's built-in environment variables to determine if the
// application is running in a production or development build.
// https://vitejs.dev/guide/env-and-mode.html

const isProduction = process.env.NODE_ENV === 'production';

// In development, the proxy is used. In production, requests are same-origin.
export const API_BASE_URL = '';

// In development, connect to the local server. In production, connect to the same host that served the page.
export const SOCKET_URL = isProduction ? '/' : 'http://localhost:3001';
