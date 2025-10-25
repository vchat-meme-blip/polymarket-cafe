/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAgent } from '../../lib/state';
// FIX: Imported `Room` type from its canonical source in `lib/types` instead of from the state store to resolve module export errors.
import { Room } from '../../lib/types/index.js';
import { useArenaStore } from '../../lib/state/arena';
import LiveAudioToggle from './LiveAudioToggle';
import c from 'classnames';

type RoomUserControlsProps = {
  room: Room;
  isMuted: boolean;
  onToggleMute: () => void;
};

/**
 * Renders contextual controls for the user's agent when they are in a room.
 */
export default function RoomUserControls({
  room,
  isMuted,
  onToggleMute,
}: RoomUserControlsProps) {
  const { current: userAgent } = useAgent();
  const { removeAgentFromRoom, kickAgentFromRoom } = useArenaStore();

  const isUserInThisRoom = room.agentIds.includes(userAgent.id);
  const isUserTheHost = room.hostId === userAgent.id;
  const otherAgentId = room.agentIds.find(id => id !== userAgent.id);

  if (!isUserInThisRoom) {
    return null;
  }

  return (
    <div className={c('room-user-controls', { active: isUserInThisRoom })}>
      <button
        className="button danger"
        onClick={() => {
          console.log(
            `[LEAVE_LOG] User's agent ${userAgent.name} is leaving room ${room.id}.`,
          );
          removeAgentFromRoom(userAgent.id);
        }}
      >
        <span className="icon">logout</span>
        Leave Room
      </button>
      {isUserTheHost && otherAgentId && (
        <button
          className="button danger"
          onClick={() => {
            // Log is handled in the action itself for consistency
            kickAgentFromRoom(otherAgentId, room.id);
          }}
        >
          <span className="icon">person_remove</span>
          Kick Agent
        </button>
      )}
      {otherAgentId && (
        <LiveAudioToggle isMuted={isMuted} onToggle={onToggleMute} />
      )}
    </div>
  );
}