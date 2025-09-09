import { ObjectId, WithId } from 'mongodb';
import { agentsCollection, roomsCollection, activityLogCollection } from '../db.js';
import { Agent, Room } from '../../lib/types/index.js';
import { cafeService } from '../services/cafe.service.js';

type EmitToMainThread = (message: 
  | { type: 'socketEmit', event: string, payload: any, room?: string }
  | { type: 'worldState', payload: any }
  | { type: 'globalPause', payload: { duration: number, reason: string, resumeTime: number } }
) => void;

export class ArenaDirector {
  private emitToMain?: EmitToMainThread;
  private agentLocations: Record<string, string | null> = {};
  private cafeService = cafeService;
  private isTicking = false;
  private initialized = false;
  private systemPaused = false;
  private pauseUntil = 0;

  constructor() {
    console.log('[ArenaDirector] Instance created.');
  }

  public initialize(emitCallback: EmitToMainThread) {
    this.emitToMain = emitCallback;
    // Also initialize the cafeService
    cafeService.initialize(emitCallback);
  }
  
  public handleSystemPause(until: number) {
    this.systemPaused = true;
    this.pauseUntil = until;
    console.log(`[ArenaDirector] System paused until ${new Date(until).toISOString()}`);
    
    // Also pause the cafe service
    this.cafeService.setPauseState(true, until);
  }
  
  public handleSystemResume() {
    this.systemPaused = false;
    console.log('[ArenaDirector] System resumed');
    
    // Also resume the cafe service
    this.cafeService.setPauseState(false);
  }
  
  public getWorldState() {
    const state = {
      rooms: this.cafeService.getRooms(),
      agentLocations: this.agentLocations,
      thinkingAgents: this.cafeService.getThinkingAgents(),
    };
    this.emitToMain?.({ type: 'worldState', payload: state });
  }

    public registerNewAgent(agent: Agent) {
      if (this.agentLocations[agent.id] === undefined) {
          this.agentLocations[agent.id] = null; // Add to tracking as a wandering agent
          console.log(`[ArenaDirector] Instantly registered new agent "${agent.name}" in simulation.`);
      }
  }

  private async initializeAgentLocations() {
      const allAgents = await agentsCollection.find().toArray();
      const currentRooms = await roomsCollection.find().toArray();

      // Reset all known locations
      allAgents.forEach((agent: WithId<Agent>) => {
          this.agentLocations[agent.id] = null;
      });

      // Set locations based on DB truth
      currentRooms.forEach(room => {
        room.agentIds.forEach(agentId => {
            this.agentLocations[agentId] = room.id;
        });
      });
      
      this.initialized = true;
      console.log('[ArenaDirector] Initial agent locations synchronized from database.');
  }

  private async logActivity(agentId: string, type: 'move' | 'conversation' | 'offer' | 'trade' | 'bounty_hit', description: string, details?: Record<string, any>) {
    await activityLogCollection.insertOne({
        agentId, type, description, details, timestamp: Date.now(),
    });
  }
  
  private async removeAgentFromCurrentRoom(agentId: string) {
          const currentRoomId = this.agentLocations[agentId];
      if (currentRoomId) {
          const room = await roomsCollection.findOne({ id: currentRoomId });
          if (room) {
              // Destroy the chat room in the cafe service
              cafeService.destroyRoom(currentRoomId);

              const newAgentIds = room.agentIds.filter(id => id !== agentId);
              const newHostId = newAgentIds.length > 0
                  ? (room.hostId === agentId ? newAgentIds[0] : room.hostId)
                  : null;
              
              await roomsCollection.updateOne(
                  { id: currentRoomId },
                  { $set: { agentIds: newAgentIds, hostId: newHostId } }
              );
          }
          this.agentLocations[agentId] = null;
          this.logActivity(agentId, 'move', `Left Room ${currentRoomId}`, { roomId: currentRoomId });
          this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId: agentId, roomId: null } });
          console.log(`[ArenaDirector] Agent ${agentId} removed from Room ${currentRoomId}.`);
      }
  }


  private async findAndJoinEmptyRoom(agent: Agent): Promise<Room | null> {
      await this.removeAgentFromCurrentRoom(agent.id);

      const availableRoom = await roomsCollection.findOne<WithId<Room>>({ "agentIds.1": { "$exists": false } } as any);
      if (availableRoom) {
          const roomIdString = availableRoom.id;
          await roomsCollection.updateOne({ id: roomIdString }, { $push: { agentIds: agent.id }, $set: { hostId: availableRoom.agentIds.length === 0 ? agent.id : availableRoom.hostId } });
          this.agentLocations[agent.id] = roomIdString;
          this.logActivity(agent.id, 'move', `Joined Room ${roomIdString}`, { roomId: roomIdString });
          this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId: agent.id, roomId: roomIdString } });
          const updatedRoom = await roomsCollection.findOne<WithId<Room>>({id: roomIdString});
          if (updatedRoom) {
            const {_id, ...roomData} = updatedRoom;
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
                 const updatedRoomState = await roomsCollection.findOne({id: room.id});
                 if (updatedRoomState && updatedRoomState.agentIds.length === 2) {
                    const [agent1Id, agent2Id] = updatedRoomState.agentIds;
                    const agent1 = await agentsCollection.findOne({ id: agent1Id });
                    const agent2 = await agentsCollection.findOne({ id: agent2Id });
                    if (agent1 && agent2) {
                      cafeService.createRoom(updatedRoomState.id, [agent1, agent2]);
                    }
                 }
             }
         }
         else if (this.agentLocations[agent.id] !== null && Math.random() < 0.02) { // Reduced probability from 0.1 to 0.02
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
          cafeService.createRoom(room.id, [agent1, agent2]);
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
      
      const newRoomId = `room-${agent.name.toLowerCase().replace(/\s+/g, '-')}-${new ObjectId().toHexString().slice(0, 4)}`;

      const newRoomData: Room = {
          id: newRoomId,
          agentIds: [agentId],
          hostId: agentId,
          topics: agent.topics,
          warnFlags: 0,
          rules: ['All intel trades are final.', 'No spamming or off-topic discussions.'],
          activeOffer: null,
          vibe: 'General Chat ☕️',
      };
      
      await roomsCollection.insertOne(newRoomData as any);
      this.agentLocations[agentId] = newRoomId;
      this.logActivity(agentId, 'move', `Created and joined Room ${newRoomId}`, { roomId: newRoomId });
      this.emitToMain?.({ type: 'socketEmit', event: 'agentMoved', payload: { agentId, roomId: newRoomId } });
  }

  public async tick() {
    // Check if system is paused
    if (this.systemPaused && Date.now() < this.pauseUntil) {
      console.log(`[ArenaDirector] Tick skipped - system paused until ${new Date(this.pauseUntil).toISOString()}`);
      return;
    }
    
    if (this.isTicking) return;
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
        // The cafeService's createRoom is idempotent; it won't create a duplicate.
        // This allows us to simply call it for all ready rooms on every tick.
        const [agent1Id, agent2Id] = room.agentIds;
        const agent1 = await agentsCollection.findOne({ id: agent1Id });
        const agent2 = await agentsCollection.findOne({ id: agent2Id });

        if (agent1 && agent2) {
          cafeService.createRoom(room.id, [agent1, agent2]);
        }
      }
    }
  }
}