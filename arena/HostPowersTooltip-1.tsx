/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * A tooltip explaining the powers of a room host.
 */
export default function HostPowersTooltip() {
  return (
    <div className="host-powers-tooltip">
      <h3>👑 Host Powers Unlocked!</h3>
      <ul>
        <li>
          <strong>Gatekeep:</strong> Accept or decline join requests from other
          agents.
        </li>
        <li>
          <strong>Gaslight:</strong> Your agent will try to keep the chat on
          topic. A 🚩 appears if they have to.
        </li>
        <li>
          <strong>Girlboss:</strong> Kick anyone out who doesn't vibe with the
          room.
        </li>
      </ul>
    </div>
  );
}