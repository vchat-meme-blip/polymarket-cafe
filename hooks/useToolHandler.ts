
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef } from 'react';
import { useAgent, useUI } from '../lib/state/index.js';
import { USER_ID, useArenaStore } from '../lib/state/arena';
import { apiService } from '../lib/services/api.service.js';
import { MarketIntel } from '../lib/types/index.js';

/**
 * A client-side hook that listens for new agent messages and executes any
 * `tool_calls` they contain. This allows the AI to trigger client-side actions.
 */
export function useToolHandler() {
    const { current: currentAgent } = useAgent();
    const { triggerGesture, setBetSlipProposal } = useUI();
    const processedMessageIds = useRef(new Set<number>());

    useEffect(() => {
        const unsubscribe = useArenaStore.subscribe(
            (state) => state.agentConversations[currentAgent.id]?.[USER_ID],
            async (conversation) => {
                if (!conversation || conversation.length === 0) {
                    return;
                }

                const lastMessage = conversation[conversation.length - 1];
                
                if (lastMessage && lastMessage.agentId === currentAgent.id && !processedMessageIds.current.has(lastMessage.timestamp)) {
                    processedMessageIds.current.add(lastMessage.timestamp);

                    if (lastMessage.tool_calls) {
                        for (const toolCall of lastMessage.tool_calls) {
                            if (toolCall.type !== 'function') continue;

                            try {
                                const args = JSON.parse(toolCall.function.arguments);

                                if (toolCall.function.name === 'gesture' && args.animation_name) {
                                    console.log(`[useToolHandler] Triggering gesture: ${args.animation_name}`);
                                    triggerGesture(args.animation_name);
                                }

                                if (toolCall.function.name === 'propose_bet') {
                                    console.log(`[useToolHandler] Received bet proposal:`, args);
                                    // Fetch full market details to populate the slip
                                    try {
                                        const { markets } = await apiService.getLiveMarkets(); // This is inefficient, but will work for now
                                        const market = markets.find(m => m.id === args.marketId);
                                        
                                        if (market) {
                                            setBetSlipProposal({
                                                suggestion: {
                                                    marketId: args.marketId,
                                                    outcome: args.outcome.toLowerCase(),
                                                    amount: args.amount,
                                                    price: args.price,
                                                    sourceIntelId: args.sourceIntelId,
                                                },
                                                analysis: args.analysis,
                                                market: market,
                                            });
                                        } else {
                                            console.error(`[useToolHandler] Market for bet proposal not found: ${args.marketId}`);
                                        }
                                    } catch (fetchError) {
                                        console.error(`[useToolHandler] Failed to fetch market details for bet proposal:`, fetchError);
                                    }
                                }

                            } catch (e) {
                                console.error("Failed to parse tool call arguments:", e);
                            }
                        }
                    }
                }
            }
        );

        return () => {
            unsubscribe();
            processedMessageIds.current.clear();
        };
    }, [currentAgent.id, triggerGesture, setBetSlipProposal]);
}
