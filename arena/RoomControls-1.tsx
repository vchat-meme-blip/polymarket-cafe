/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Imported `Agent` and `Room` types from their canonical source in `lib/types` instead of from other modules to resolve module export errors.
import { Agent, Room } from '../../lib/types/index.js';
import c from 'classnames';

type RoomControlsProps = {
  room: Room;
  userAgent: Agent;
  joinRequest: string | null | undefined;
  agentLocation: string | null;
  onCreateRequest: () => void;
  onResolveRequest: (accepted: boolean) => void;
};

export default function RoomControls({
  room,
  userAgent,
  joinRequest,
  agentLocation,
  onCreateRequest,
  onResolveRequest,
}: RoomControlsProps) {
  const isRoomOccupied = room.agentIds.length === 1;
  const isUserInARoom = agentLocation !== null;
  const isUserTheHost = room.hostId === userAgent.id;
  const hasPendingRequestFromUser = joinRequest === userAgent.id;

  // Case 1: User is host and there is a join request for this room.
  if (isUserTheHost && joinRequest && !hasPendingRequestFromUser) {
    return (
      <div className="room-controls">
        <button
          className="room-control-button accept"
          onClick={() => onResolveRequest(true)}
        >
          <span className="icon">check_circle</span> Accept
        </button>
        <button
          className="room-control-button decline"
          onClick={() => onResolveRequest(false)}
        >
          <span className="icon">cancel</span> Decline
        </button>
      </div>
    );
  }

  // Case 2: Room has one person, user is not in a room, and can request to join.
  if (isRoomOccupied && !isUserInARoom) {
    return (
      <button
        className={c('request-prompt', { pending: hasPendingRequestFromUser })}
        onClick={hasPendingRequestFromUser ? undefined : onCreateRequest}
        disabled={hasPendingRequestFromUser}
      >
        {hasPendingRequestFromUser ? 'Request Sent...' : 'Request to Join'}
      </button>
    );
  }

  return null;
}