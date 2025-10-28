import { Agent, Room } from '../../lib/types/index.js';
import { roomsCollection } from '../db.js';
import { shuffle } from 'lodash';
import { ObjectId } from 'mongodb';

class CafeService {
    public findWanderingAgents(
        agents: Map<string, Agent>,
        agentLocations: Map<string, string | null>
    ): Agent[] {
        const wandering: Agent[] = [];
        for (const agentId of agentLocations.keys()) {
            if (agentLocations.get(agentId) === null) {
                const agent = agents.get(agentId);
                if (agent) {
                    wandering.push(agent);
                }
            }
        }
        return wandering;
    }

    public findAvailableRoom(rooms: Map<string, Room>): Room | null {
        for (const room of rooms.values()) {
            if (room.agentIds.length === 1) {
                return room;
            }
        }
        return null;
    }

    public async createRoom(host: Agent): Promise<Room> {
        const newId = new ObjectId();
        const newRoom: Room = {
            _id: newId,
            id: newId.toHexString(),
            agentIds: [host.id],
            hostId: host.id,
            topics: host.topics,
            warnFlags: 0,
            rules: ['All intel trades are final.', 'No spamming.', 'Be respectful.'],
            activeOffer: null,
            vibe: 'General Chat ☕️',
        };
        await roomsCollection.insertOne(newRoom as any);
        // Ensure the returned object has the string ID for immediate use
        return { ...newRoom, id: newId.toHexString() };
    }
}

export const cafeService = new CafeService();