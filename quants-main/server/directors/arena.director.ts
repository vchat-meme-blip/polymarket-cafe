import { ObjectId, WithId } from 'mongodb';
import { agentsCollection, roomsCollection, activityLogCollection } from '../db.js';
import { Agent, Room } from '../../lib/types/index.js';
import { cafeService } from '../services/cafe.service.js';

type EmitToMainThread = (
  message:
    | { type: 'socketEmit'; event: string; payload: any; room?: string }
    | { type: 'worldState'; payload: any }
    | { type: 'globalPause'; payload: { duration: number; reason: string; resumeTime: number } }
) => void;

const INTERACTION_COOLDOWN = 15 * 60 * 1000;
const CAFE_ACTIVE_DURATION = 15 * 60 * 1000;
const CAFE_PAUSE_DURATION = 15 * 60 * 1000;
const CAFE_STATUS_CHECK_DELAY = 60 * 1000;

export class ArenaDirector {
  private emitToMain?: EmitToMainThread;
  private agentLocations: Record<string, string | null> = {};
  private readonly cafeService = cafeService;
  private isTicking = false;
  private initialized = false;
  private systemPaused = false;
  private pauseUntil = 0;
  private manualPauseDepth = 0;
  private scheduledPauseActive = false;
  private cafeCycleTimeout: NodeJS.Timeout | null = null;
  private recentInteractions: Map<string, number> = new Map();

  constructor() {
    console.log('[ArenaDirector] Instance created.');
  }

  public initialize(emitCallback: EmitToMainThread) {
    this.emitToMain = emitCallback;
    this.cafeService.initialize(emitCallback);
    this.cafeService.onConversationEnded((roomId, agentIds) => {
      this.handleConversationEnd(roomId, agentIds).catch(error => {
        console.error('[ArenaDirector] Failed to handle conversation end cleanup:', error);
      });
    });
    this.startCafeCycle();
  }

  public handleSystemPause(until: number, context: { scheduled?: boolean; reason?: string } = {}) {
    const wasPaused = this.systemPaused;

    if (context.scheduled) {
      this.scheduledPauseActive = true;
    } else {
      this.manualPauseDepth += 1;
    }

    this.systemPaused = true;
    this.pauseUntil = Math.max(this.pauseUntil, until);
    const logReason = context.reason ? ` Reason: ${context.reason}` : '';
    console.log(
      `[ArenaDirector] System paused until ${new Date(this.pauseUntil).toISOString()}.${logReason}`
    );

    this.cafeService.setPauseState(true, this.pauseUntil);

    if (!wasPaused && this.emitToMain) {
      const duration = Math.max(0, this.pauseUntil - Date.now());
      this.emitToMain({
        type: 'globalPause',
        payload: {
          duration,
          reason: context.reason || 'System pause initiated',
          resumeTime: this.pauseUntil
        }
      });
    }
  }

  public handleSystemResume(context: { scheduled?: boolean } = {}) {
    if (context.scheduled) {
      this.scheduledPauseActive = false;
    } else if (this.manualPauseDepth > 0) {
      this.manualPauseDepth = Math.max(0, this.manualPauseDepth - 1);
    }

    if (this.manualPauseDepth > 0 || this.scheduledPauseActive) {
      console.log('[ArenaDirector] Resume requested but other pauses are still active.');
      return;
    }

    if (!this.systemPaused) {
      return;
    }

    this.systemPaused = false;
    this.pauseUntil = 0;
    console.log('[ArenaDirector] System resumed');
    this.cafeService.setPauseState(false);
  }

  public getWorldState() {
    const state = {
      rooms: this.cafeService.getRooms(),
      agentLocations: this.agentLocations,
      thinkingAgents: this.cafeService.getThinkingAgents()
    };
    this.emitToMain?.({ type: 'worldState', payload: state });
  }

  public registerNewAgent(agent: Agent) {
    if (this.agentLocations[agent.id] === undefined) {
      this.agentLocations[agent.id] = null;
      console.log(`[ArenaDirector] Instantly registered new agent "${agent.name}" in simulation.`);
    }
  }

  private async initializeAgentLocations() {
    const allAgents = await agentsCollection.find().toArray();
    const currentRooms = await roomsCollection.find().toArray();

    allAgents.forEach((agent: WithId<Agent>) => {
      this.agentLocations[agent.id] = null;
    });

    currentRooms.forEach(room => {
      room.agentIds.forEach(agentId => {
        this.agentLocations[agentId] = room.id;
      });
    });

    this.initialized = true;
    console.log('[ArenaDirector] Initial agent locations synchronized from database.');
  }

  private async logActivity(
    agentId: string,
    type: 'move' | 'conversation' | 'offer' | 'trade' | 'bounty_hit',
    description: string,
    details?: Record<string, any>
  ) {
    await activityLogCollection.insertOne({
      agentId,
      type,
      description,
      details,
      timestamp: Date.now()
    });
  }

  private async removeAgentFromCurrentRoom(agentId: string) {
    const currentRoomId = this.agentLocations[agentId];
    if (!currentRoomId) {
      return;
    }

    const room = await roomsCollection.findOne({ id: currentRoomId });
    if (room) {
      this.cafeService.destroyRoom(currentRoomId);

      const newAgentIds = room.agentIds.filter(id => id !== agentId);
      const newHostId =
        newAgentIds.length > 0 ? (room.hostId === agentId ? newAgentIds[0] : room.hostId) : null;

      await roomsCollection.updateOne(
        { id: currentRoomId },
        { $set: { agentIds: newAgentIds, hostId: newHostId } }
      );
    }

    this.agentLocations[agentId] = null;
    await this.logActivity(agentId, 'move', `Left Room ${currentRoomId}`, { roomId: currentRoomId });
    this.emitToMain?.({
      type: 'socketEmit',
      event: 'agentMoved',
      payload: { agentId, roomId: null }
    });
    console.log(`[ArenaDirector] Agent ${agentId} removed from Room ${currentRoomId}.`);
  }

  private async handleConversationEnd(roomId: string, agentIds: string[]) {
    try {
      const updateResult = await roomsCollection.updateOne(
        { id: roomId },
        { $set: { agentIds: [], hostId: null, activeOffer: null } }
      );

      if (updateResult.matchedCount === 0) {
        console.warn(`[ArenaDirector] Conversation end cleanup: room ${roomId} not found in database.`);
      }

      for (const agentId of agentIds) {
        if (this.agentLocations[agentId] === roomId) {
          this.agentLocations[agentId] = null;
        }

        await this.logActivity(agentId, 'move', `Conversation in Room ${roomId} concluded`, {
          roomId
        });
        this.emitToMain?.({
          type: 'socketEmit',
          event: 'agentMoved',
          payload: { agentId, roomId: null }
        });
      }

      // Clear recent interaction cooldowns for the pair
      for (const agentId of agentIds) {
        for (const otherId of agentIds) {
          if (agentId === otherId) continue;
          const key = [agentId, otherId].sort().join('_');
          this.recentInteractions.delete(key);
        }
      }

      console.log(`[ArenaDirector] Conversation in room ${roomId} ended. Agents released back into the arena.`);
    } catch (error) {
      console.error('[ArenaDirector] Failed to clean up after conversation end:', error);
    }
  }

  private async findAndJoinEmptyRoom(agent: Agent): Promise<Room | null> {
    await this.removeAgentFromCurrentRoom(agent.id);

    const availableRooms = await roomsCollection
      .find<WithId<Room>>({ 'agentIds.1': { $exists: false } } as any)
      .toArray();

    for (const availableRoom of availableRooms) {
      if (availableRoom.agentIds.length === 1) {
        const otherAgentId = availableRoom.agentIds[0];
        const interactionKey = [agent.id, otherAgentId].sort().join('_');
        const lastInteractionTime = this.recentInteractions.get(interactionKey);

        if (lastInteractionTime && Date.now() - lastInteractionTime < INTERACTION_COOLDOWN) {
          console.log(
            `[ArenaDirector] Agent ${agent.name} is on cooldown with ${otherAgentId}. Skipping room ${availableRoom.id}.`
          );
          continue;
        }
      }

      const roomIdString = availableRoom.id;
      await roomsCollection.updateOne(
        { id: roomIdString },
        {
          $push: { agentIds: agent.id },
          $set: { hostId: availableRoom.agentIds.length === 0 ? agent.id : availableRoom.hostId }
        }
      );

      this.agentLocations[agent.id] = roomIdString;
      await this.logActivity(agent.id, 'move', `Joined Room ${roomIdString}`, { roomId: roomIdString });
      this.emitToMain?.({
        type: 'socketEmit',
        event: 'agentMoved',
        payload: { agentId: agent.id, roomId: roomIdString }
      });

      const updatedRoom = await roomsCollection.findOne<WithId<Room>>({ id: roomIdString });
      if (updatedRoom) {
        if (updatedRoom.agentIds.length === 2) {
          const key = updatedRoom.agentIds.sort().join('_');
          this.recentInteractions.set(key, Date.now());
          console.log(
            `[ArenaDirector] Agents ${updatedRoom.agentIds.join(' and ')} started interaction. Cooldown set.`
          );
        }

        const { _id, ...roomData } = updatedRoom;
        return roomData as Room;
      }
    }

    return null;
  }

  private async handleAgentMovement() {
    const allAgents = await agentsCollection.find({ ownerHandle: { $exists: false } }).toArray();

    for (const agent of allAgents) {
      if (this.agentLocations[agent.id] === null) {
        const room = await this.findAndJoinEmptyRoom(agent);
        if (room) {
          const updatedRoomState = await roomsCollection.findOne({ id: room.id });
          if (updatedRoomState && updatedRoomState.agentIds.length === 2) {
            const [agent1Id, agent2Id] = updatedRoomState.agentIds;
            const agent1 = await agentsCollection.findOne({ id: agent1Id });
            const agent2 = await agentsCollection.findOne({ id: agent2Id });
            if (agent1 && agent2) {
              this.cafeService.createRoom(updatedRoomState.id, [agent1, agent2]);
            }
          }
        }
      } else if (this.agentLocations[agent.id] !== null && Math.random() < 0.02) {
        await this.removeAgentFromCurrentRoom(agent.id);
      }
    }
  }

  public async moveAgentToCafe(agentId: string) {
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) {
      console.error(`[ArenaDirector] moveAgentToCafe: Agent ${agentId} not found.`);
      return;
    }

    const roomData = await this.findAndJoinEmptyRoom(agent);
    if (roomData) {
      const room = await roomsCollection.findOne({ id: roomData.id });
      if (room && room.agentIds.length === 2) {
        const [agent1Id, agent2Id] = room.agentIds;
        const agent1 = await agentsCollection.findOne({ id: agent1Id });
        const agent2 = await agentsCollection.findOne({ id: agent2Id });
        if (agent1 && agent2) {
          this.cafeService.createRoom(room.id, [agent1, agent2]);
        }
      }
    }
  }

  public async createAndHostRoom(agentId: string) {
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) {
      console.error(`[ArenaDirector] createAndHostRoom: Agent ${agentId} not found.`);
      return;
    }

    await this.removeAgentFromCurrentRoom(agentId);

    const newRoomId = `room-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${new ObjectId()
      .toHexString()
      .slice(0, 4)}`;

    const newRoomData: Room = {
      id: newRoomId,
      agentIds: [agentId],
      hostId: agentId,
      topics: agent.topics,
      warnFlags: 0,
      rules: ['All intel trades are final.', 'No spamming or off-topic discussions.'],
      activeOffer: null,
      vibe: 'General Chat ☕️'
    };

    await roomsCollection.insertOne(newRoomData as any);
    this.agentLocations[agentId] = newRoomId;
    await this.logActivity(agentId, 'move', `Created and joined Room ${newRoomId}`, { roomId: newRoomId });
    this.emitToMain?.({
      type: 'socketEmit',
      event: 'agentMoved',
      payload: { agentId, roomId: newRoomId }
    });
  }

  public async tick() {
    if (this.systemPaused && Date.now() < this.pauseUntil) {
      console.log(
        `[ArenaDirector] Tick skipped - system paused until ${new Date(this.pauseUntil).toISOString()}`
      );
      return;
    }

    if (this.isTicking) {
      return;
    }
    this.isTicking = true;

    try {
      if (!this.initialized) {
        await this.initializeAgentLocations();
      }
      await this.handleAgentMovement();
      await this.initiateReadyConversations();
    } catch (error) {
      console.error('[ArenaDirector] Error during tick:', error);
    } finally {
      this.isTicking = false;
    }
  }

  private async initiateReadyConversations() {
    const readyRooms = await roomsCollection.find({ 'agentIds.1': { $exists: true } }).toArray();

    for (const room of readyRooms) {
      if (room.agentIds.length === 2) {
        const [agent1Id, agent2Id] = room.agentIds;
        const agent1 = await agentsCollection.findOne({ id: agent1Id });
        const agent2 = await agentsCollection.findOne({ id: agent2Id });

        if (agent1 && agent2) {
          this.cafeService.createRoom(room.id, [agent1, agent2]);
        }
      }
    }
  }

  private startCafeCycle() {
    if (this.cafeCycleTimeout) {
      clearTimeout(this.cafeCycleTimeout);
    }
    console.log('[ArenaDirector] Starting scheduled cafe activity cycle (15m on / 15m off).');
    this.scheduleCafeCycle('paused', CAFE_ACTIVE_DURATION);
  }

  private scheduleCafeCycle(targetState: 'active' | 'paused', delay: number) {
    this.cafeCycleTimeout = setTimeout(() => {
      if (targetState === 'paused') {
        if (this.manualPauseDepth > 0) {
          console.log('[ArenaDirector] Manual pause active; delaying scheduled cooldown.');
          this.scheduleCafeCycle('paused', CAFE_STATUS_CHECK_DELAY);
          return;
        }

        const resumeTime = Date.now() + CAFE_PAUSE_DURATION;
        console.log('[ArenaDirector] Entering scheduled cafe cooldown for 15 minutes.');
        this.handleSystemPause(resumeTime, { scheduled: true, reason: 'Scheduled cafe cooldown' });
        this.scheduleCafeCycle('active', CAFE_PAUSE_DURATION);
      } else {
        if (this.manualPauseDepth > 0) {
          console.log('[ArenaDirector] Manual pause still active; delaying scheduled resume.');
          this.scheduleCafeCycle('active', CAFE_STATUS_CHECK_DELAY);
          return;
        }

        console.log('[ArenaDirector] Scheduled cafe cooldown complete; resuming chats.');
        this.handleSystemResume({ scheduled: true });
        this.scheduleCafeCycle('paused', CAFE_ACTIVE_DURATION);
      }
    }, delay) as NodeJS.Timeout;
  }
}
