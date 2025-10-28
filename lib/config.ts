/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This file centralizes environment-specific configurations.
// It uses Vite's built-in environment variables to determine if the
// application is running in a production or development build.
// https://vitejs.dev/guide/env-and-mode.html

const isProduction = process.env.NODE_ENV === 'production';

// API calls should always be relative paths.
// In dev, Vite's proxy will catch them.
// In prod, they'll go to the same server that's serving the client.
export const API_BASE_URL = '';

// Socket URL should also be relative.
export const SOCKET_URL = '/';
