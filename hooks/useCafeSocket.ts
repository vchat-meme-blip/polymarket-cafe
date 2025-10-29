import { useEffect } from 'react';
import { useArenaStore, USER_ID } from '../lib/state/arena';
// FIX: Fix imports for `useAgent`, `useUI`, `useUser`, and `useSystemLogStore` by changing the path from `../lib/state` to `../lib/state/index.js`.
import { useAgent, useUI, useUser, useSystemLogStore } from '../lib/state/index.js';
import { socketService } from '../lib/services/socket.service';
import { useAutonomyStore } from '../lib/state/autonomy';
// FIX: Imported `TradeRecord` type from its canonical source to resolve type errors.
import type { TradeRecord } from '../lib/types/index.js';

export function useCafeSocket() {
    const { 
        syncWorldState, 
        setThinkingAgent, 
        addConversationTurn,
        removeRoom, 
        recordActivityInRoom,
        updateRoomFromSocket,
        // FIX: Added `setLastTradeDetails` action from the store.
        setLastTradeDetails,
        // FIX: Added `recordTrade` action from the store.
        recordTrade 
    } = useArenaStore();
    const { addIntelFromSocket } = useAutonomyStore();
    const { addLog } = useSystemLogStore();
    const { handle } = useUser();
    const { addToast, setIsAgentResponding } = useUI();

    useEffect(() => {
        socketService.connect();

        const handleWorldState = (worldState: any) => {
            syncWorldState(worldState);
        };
        const handleAgentThinking = (data: { agentId: string; isThinking: boolean }) => {
            setThinkingAgent(data.agentId, data.isThinking);
        };
        const handleNewTurn = (data: any) => {
            if (!data.room || !data.room.agentIds || data.room.agentIds.length < 2) {
                console.error('[Socket] Received invalid newConversationTurn payload:', data);
                return;
            }
            const message = `${data.turn.agentName} in Room ${data.roomId}: "${data.turn.text.slice(0, 50)}..."`;
            addLog({ type: 'conversation', message });
            addConversationTurn(data.room.agentIds[0], data.room.agentIds[1], data.turn);
            recordActivityInRoom(data.roomId);
        };
        const handleRoomDestroyed = (data: { roomId: string }) => {
            removeRoom(data.roomId);
        };
        const handleRoomUpdated = (data: { room: any }) => {
            updateRoomFromSocket(data.room);
        };
        const handleTradeExecuted = (payload: { trade: TradeRecord }) => {
            const trade = payload?.trade;
            if (!trade) {
                console.warn('[Socket] Received tradeExecuted event without trade payload:', payload);
                return;
            }

            const allAgents = [...useAgent.getState().availablePersonal, ...useAgent.getState().availablePresets];
            const sellerName = allAgents.find(a => a.id === trade.fromId)?.name || trade.fromId;
            const buyerName = allAgents.find(a => a.id === trade.toId)?.name || trade.toId;

            recordTrade(trade);
            setLastTradeDetails(trade);

            addLog({
                type: 'system',
                message: `Trade executed in Room ${trade.roomId}: ${sellerName} → ${buyerName} exchanged intel on ${trade.market} for ${trade.price.toLocaleString()} BOX.`
            });

            addToast({
                message: 'Trade executed successfully.',
                type: 'system',
                tokenName: trade.market
            });
        };
        const handleNewIntel = (data: { intel: any }) => {
             addIntelFromSocket(data.intel);
             addLog({ type: 'intel', message: `New intel for "${data.intel.market}" discovered.` });
             addToast({ message: `New Intel Discovered:`, tokenName: data.intel.market, intel: data.intel, type: 'intel' });
        };
        const handleSystemStatus = (data: { status: string, reason?: string }) => {
            addLog({ type: 'system', message: `System status: ${data.status.toUpperCase()}. ${data.reason || ''}` });
        };
        const handleSystemMessage = (data: { message: string, type: 'system' | 'error' }) => {
            addToast({ message: data.message, type: data.type || 'system' });
        };
        const handleAgentMoved = (data: { agentId: string; roomId: string | null }) => {
            const allAgents = [...useAgent.getState().availablePersonal, ...useAgent.getState().availablePresets];
            const agentName = allAgents.find(a => a.id === data.agentId)?.name || data.agentId;
            const message = data.roomId 
                ? `Agent ${agentName} moved to Room ${data.roomId}.`
                : `Agent ${agentName} is now wandering the Café.`;
            addLog({ type: 'move', message });
            useArenaStore.getState().moveAgentFromSocket(data.agentId, data.roomId);
        };
        
        const handleProactiveMessage = (data: { agentId: string; agentName: string; text: string; }) => {
            addConversationTurn(data.agentId, USER_ID, {
                agentId: data.agentId,
                agentName: data.agentName,
                text: data.text,
                timestamp: Date.now(),
            });
            // Trigger speaking animation
            setIsAgentResponding(true);
            const messageDuration = Math.max(1000, data.text.length * 50);
            setTimeout(() => setIsAgentResponding(false), messageDuration);
        };


        socketService.on('worldState', handleWorldState);
        socketService.on('agentThinking', handleAgentThinking);
        socketService.on('newConversationTurn', handleNewTurn);
        socketService.on('roomDestroyed', handleRoomDestroyed);
        socketService.on('roomUpdated', handleRoomUpdated);
        socketService.on('tradeExecuted', handleTradeExecuted);
        socketService.on('newIntel', handleNewIntel);
        socketService.on('systemStatus', handleSystemStatus);
        socketService.on('systemMessage', handleSystemMessage);
        socketService.on('agentMoved', handleAgentMoved);
        socketService.on('proactiveMessage', handleProactiveMessage);

        return () => {
            socketService.off('worldState', handleWorldState);
            socketService.off('agentThinking', handleAgentThinking);
            socketService.off('newConversationTurn', handleNewTurn);
            socketService.off('roomDestroyed', handleRoomDestroyed);
            socketService.off('roomUpdated', handleRoomUpdated);
            socketService.off('tradeExecuted', handleTradeExecuted);
            socketService.off('newIntel', handleNewIntel);
            socketService.off('systemStatus', handleSystemStatus);
            socketService.off('systemMessage', handleSystemMessage);
            socketService.off('agentMoved', handleAgentMoved);
            socketService.off('proactiveMessage', handleProactiveMessage);
            socketService.disconnect();
        };
    }, [handle, syncWorldState, setThinkingAgent, addConversationTurn, removeRoom, recordActivityInRoom, updateRoomFromSocket, setLastTradeDetails, recordTrade, addIntelFromSocket, addLog, addToast, setIsAgentResponding]);
}
