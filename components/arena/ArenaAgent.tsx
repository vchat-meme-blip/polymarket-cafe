/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import '@react-three/fiber';
import React, { useEffect, useRef, useState } from 'react';
import { Agent } from '../../lib/types/index.js';
import { VrmModel } from '../agents/VrmAvatar';

type ArenaAgentProps = {
    agent: Agent;
    isSpeaking: boolean;
};

/**
 * An isolated component responsible for rendering a single agent within an Arena room.
 * It now only handles animations specific to the interactive Café environment,
 * with all positioning and look-at logic handled by its parent.
 */
export default function ArenaAgent({ agent, isSpeaking }: ArenaAgentProps) {
    const [animationTriggerKey, setAnimationTriggerKey] = useState(0);
    const agentIdRef = useRef<string | null>(null);

    // Detect when a new agent enters this "slot" to play an animation
    useEffect(() => {
        if (agent.id !== agentIdRef.current) {
            setAnimationTriggerKey(prev => prev + 1);
            agentIdRef.current = agent.id;
        }
    }, [agent.id]);
    
    // Special idle animation for Mexican Trump
    const idleAnimation = agent.id === 'mexican-trump'
        ? '/animations/idle_loop.vrma'
        : '/animations/idle2.vrma';

    return (
        <VrmModel 
            modelUrl={agent.modelUrl || ''} 
            isSpeaking={isSpeaking} 
            idleUrl={idleAnimation}
            triggerAnimationUrl="/animations/gesture_talk.vrma"
            triggerKey={animationTriggerKey}
            disableAutoGrounding={false}
        />
    );
};