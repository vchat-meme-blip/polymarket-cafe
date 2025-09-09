/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * The client-side Arena Director is now deprecated. All of its simulation,
 * conversation, and movement logic has been migrated to a persistent, 24/7
 * process on the server (`server/directors/arena.director.ts`).
 * The client is now a "viewer" of the state managed by the server. This hook remains
 * as an empty shell to prevent import errors in components that used it.
 */
export default function useArenaDirector() {
  // All logic has been moved to the server.
}
