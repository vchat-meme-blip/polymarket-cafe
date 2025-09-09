/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { Room } from '../../lib/state/arena';
import c from 'classnames';
import styles from './Arena.module.css';

type RoomStripProps = {
    rooms: Room[];
    focusedRoomId: string | null;
    onRoomSelect: (roomId: string) => void;
};

const RoomPreview = ({ room, isFocused, onSelect }: { room: Room; isFocused: boolean; onSelect: () => void; }) => {
    return (
        <button
            className={c(styles.roomStripPreview, { [styles.focused]: isFocused })}
            onClick={onSelect}
        >
            <div className={styles.roomStripIcon}>
                <span className="icon">{room.agentIds.length > 0 ? 'meeting_room' : 'no_meeting_room'}</span>
            </div>
            <div className={styles.roomStripInfo}>
                <p className={styles.roomStripName}>Room {room.id.split('-')[1]}</p>
                <p className={styles.roomStripOccupants}>{room.agentIds.length} / 2 Occupants</p>
            </div>
        </button>
    );
};

export default function RoomStrip({ rooms, focusedRoomId, onRoomSelect }: RoomStripProps) {
    return (
        <div className={styles.roomStripContainer}>
            <div className={styles.roomStripScroll}>
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
}