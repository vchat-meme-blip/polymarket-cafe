/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
// FIX: Imported `Room` type from its canonical source in `lib/types` instead of from the state store to resolve module export errors.
import { Room } from '../../lib/types/index.js';
import c from 'classnames';
import styles from './Arena.module.css';

type RoomStripProps = {
    rooms: Room[];
    focusedRoomId: string | null;
    onRoomSelect: (roomId: string) => void;
};

const RoomPreview = ({ room, isFocused, onSelect }: { room: Room; isFocused: boolean; onSelect: () => void; }) => {
    // Ensure agentIds exists and is an array
    const agentCount = room?.agentIds?.length || 0;
    
    return (
        <button
            className={c(styles.roomStripPreview, { 
                [styles.focused]: isFocused,
                [styles.owned]: room.isOwned,
            })}
            onClick={onSelect}
            data-room-id={room.id}
        >
            {room.isOwned && <span className={`icon ${styles.ownedRoomIcon}`}>crown</span>}
            <div className={styles.roomStripIcon}>
                <span className="icon">{agentCount > 0 ? 'meeting_room' : 'no_meeting_room'}</span>
            </div>
            <div className={styles.roomStripInfo}>
                <p className={styles.roomStripName}>{room.name || `Room ${room?.id?.split('-')[1] || '?'}`}</p>
                <p className={styles.roomStripOccupants}>{agentCount} / 2 Occupants</p>
            </div>
        </button>
    );
};

const RoomStrip = React.forwardRef<HTMLDivElement, RoomStripProps>(({ rooms, focusedRoomId, onRoomSelect }, ref) => {
    return (
        <div className={styles.roomStripContainer}>
            <div className={styles.roomStripScroll} ref={ref}>
                {rooms.map(room => (
                    <RoomPreview
                        key={room.id}
                        room={room}
                        isFocused={room.id === focusedRoomId}
                        onSelect={() => onRoomSelect(room.id)}
                    />
                ))}
            </div>
        </div>
    );
});

export default RoomStrip;
