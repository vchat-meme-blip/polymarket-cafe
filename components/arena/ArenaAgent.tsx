/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import '@react-three/fiber';
// FIX: Added 'useMemo' to the React import to resolve 'Cannot find name' error.
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Agent } from '../../lib/types/index.js';
import { VrmModel } from '../agents/VrmAvatar';

type ArenaAgentProps = {
    agent: Agent;
    index: number;
    isSpeaking: boolean;
};

/**
 * An isolated component responsible for rendering a single agent within an Arena room.
 * It handles positioning, look-at logic, and animations specific to the interactive Café environment.
 */
export default function ArenaAgent({ agent, index, isSpeaking }: ArenaAgentProps) {
    const groupRef = useRef<THREE.Group>(null!);
    const { camera } = useThree();
    const otherAgentPosition = new THREE.Vector3(1.5 * (index === 0 ? 1 : -1), -1.0, 0.8);

    const [animationTriggerKey, setAnimationTriggerKey] = useState(0);
    const agentIdRef = useRef<string | null>(null);

    // Detect when a new agent enters this "slot" to play an animation
    useEffect(() => {
        if (agent.id !== agentIdRef.current) {
            setAnimationTriggerKey(prev => prev + 1);
            agentIdRef.current = agent.id;
        }
    }, [agent.id]);

    const agentPosition = useMemo(() => new THREE.Vector3(1.5 * (index === 0 ? -1 : 1), -1.0, 0.8), [index]);

    const rotationOffset = agent.id === 'warlord-boudica' ? Math.PI : 0;

    useFrame((_, delta) => {
        if (!groupRef.current) return;

        // Forcefully re-apply the correct position every frame. This overrides any
        // unwanted "root motion" from the animation files that causes the model to jump.
        groupRef.current.position.copy(agentPosition);
        
        const targetQuaternion = new THREE.Quaternion();
        
        const lookAtTarget = isSpeaking ? otherAgentPosition : new THREE.Vector3(camera.position.x, groupRef.current.position.y, camera.position.z);
        const targetMatrix = new THREE.Matrix4().lookAt(groupRef.current.position, lookAtTarget, groupRef.current.up);
        targetQuaternion.setFromRotationMatrix(targetMatrix);

        // Apply the special rotation offset for warlord-boudica
        const offsetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationOffset);
        targetQuaternion.multiply(offsetQuaternion);
        
        // Smoothly interpolate rotation
        if (!groupRef.current.quaternion.equals(targetQuaternion)) {
            groupRef.current.quaternion.slerp(targetQuaternion, delta * 4.0);
        }
    });
    
    // Special idle animation for Mexican Trump
    const idleAnimation = agent.id === 'mexican-trump'
        ? '/animations/idle_loop.vrma'
        : '/animations/idle2.vrma';

    return (
        <group ref={groupRef} position={agentPosition}>
            <VrmModel 
                modelUrl={agent.modelUrl || ''} 
                isSpeaking={isSpeaking} 
                idleUrl={idleAnimation}
                triggerAnimationUrl="/animations/gesture_greeting.vrma"
                triggerKey={animationTriggerKey}
                disableAutoGrounding={true} /* Disable auto-grounding to prevent position shifting */
            />
        </group>
    );
};