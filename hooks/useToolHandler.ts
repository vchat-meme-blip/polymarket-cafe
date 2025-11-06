/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef } from 'react';
import { useAgent, useUI } from '../lib/state/index.js';
import { USER_ID, useArenaStore } from '../lib/state/arena';

/**
 * A client-side hook that listens for new agent messages and executes any
 * `tool_calls` they contain. This allows the AI to trigger client-side actions
 * like animations.
 */
export function useToolHandler() {
    const { current: currentAgent } = useAgent();
    const { triggerGesture } = useUI();
    // Use a ref to track processed message timestamps to prevent re-triggering on re-renders.
    const processedMessageIds = useRef(new Set<number>());

    useEffect(() => {
        const unsubscribe = useArenaStore.subscribe(
            (state) => state.agentConversations[currentAgent.id]?.[USER_ID],
            (conversation) => {
                if (!conversation || conversation.length === 0) {
                    return;
                }

                const lastMessage = conversation[conversation.length - 1];
                
                // Check if it's a new message from the agent that we haven't processed
                if (lastMessage && lastMessage.agentId === currentAgent.id && !processedMessageIds.current.has(lastMessage.timestamp)) {
                    processedMessageIds.current.add(lastMessage.timestamp);

                    if (lastMessage.tool_calls) {
                        for (const toolCall of lastMessage.tool_calls) {
                            if (toolCall.type === 'function' && toolCall.function.name === 'gesture') {
                                try {
                                    const args = JSON.parse(toolCall.function.arguments);
                                    if (args.animation_name) {
                                        console.log(`[useToolHandler] Triggering gesture: ${args.animation_name}`);
                                        triggerGesture(args.animation_name);
                                    }
                                } catch (e) {
                                    console.error("Failed to parse gesture tool call arguments:", e);
                                }
                            }
                        }
                    }
                }
            }
        );

        // Clean up on unmount or when the agent changes
        return () => {
            unsubscribe();
            processedMessageIds.current.clear();
        };
    }, [currentAgent.id, triggerGesture]);
}