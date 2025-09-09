/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Added '@react-three/fiber' import to augment the JSX namespace and resolve TypeScript errors for 3D components.
import '@react-three/fiber';
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Text, useTexture } from '@react-three/drei';
import { Room as RoomType, useArenaStore } from '../../lib/state/arena';
import { Agent } from '../../lib/presets/agents';
import { useAgent } from '../../lib/state';
import { VrmModel } from '../agents/VrmAvatar';
import RenderOnView from '../agents/RenderOnView';
import styles from './Arena.module.css';

const VIBE_COLORS: Record<string, string> = {
  'Bullish 🐂': '#2ecc71', 'Bearish 🐻': '#e74c3c',
  'Alpha Leaks 🧠': '#3498db', 'Shill Zone 🚀': '#f1c40f',
  'General Chat ☕️': '#9b59b6',
};

// List of available wall textures. Assumes files exist in /public/textures/
const WALL_TEXTURES = [
    '/textures/wall_pattern1.png', '/textures/wall_pattern2.png',
    '/textures/wall_pattern3.png', '/textures/wall_pattern4.png',
    '/textures/wall_pattern5.png', '/textures/wall_pattern6.png',
    '/textures/wall_pattern7.png',
];

function getAgentById(id: string, allAgents: Agent[]): Agent | undefined {
  return allAgents.find(agent => agent.id === id);
}

const ThinkingIndicator = () => {
  const meshRef = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { meshRef.current.rotation.y = clock.getElapsedTime() * 2; });
  return (
    <mesh ref={meshRef} position={[0, 1.3, 0]}>
      <torusGeometry args={[0.5, 0.03, 8, 32]} />
      <meshBasicMaterial color="#3498db" toneMapped={false} />
    </mesh>
  );
};

const HolographicOffer = ({ text }: { text: string }) => {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => { if (ref.current) { ref.current.fillOpacity = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 5); } });
  return (
    <Text ref={ref} position={[0, 0.6, 0]} fontSize={0.25} color="#1abc9c" anchorX="center" anchorY="middle" material-toneMapped={false}>
      {text}
    </Text>
  );
};

type RoomSceneProps = { room: RoomType; };

function RoomScene({ room }: RoomSceneProps) {
    const { availablePresets, availablePersonal } = useAgent();
    const allAgents = useMemo(() => [...availablePresets, ...availablePersonal], [availablePresets, availablePersonal]);
    const { thinkingAgents } = useArenaStore();
    const roomAgents = room.agentIds.map(id => getAgentById(id, allAgents)).filter((a): a is Agent => !!a);
    const vibeColor = useMemo(() => new THREE.Color(VIBE_COLORS[room.vibe || 'General Chat ☕️'] || '#9b59b6'), [room.vibe]);
    
    const wallTextureUrl = useMemo(() => WALL_TEXTURES[Math.floor(Math.random() * WALL_TEXTURES.length)], []);
    const wallTexture = useTexture(wallTextureUrl);
    wallTexture.wrapS = wallTexture.wrapT = THREE.ClampToEdgeWrapping;
    wallTexture.repeat.set(1, 1);


    useEffect(() => {
        const userAgentId = useAgent.getState().current.id;
        if (room.agentIds.includes(userAgentId)) {
          console.log(`[RoomCard Debug] User's agent is in Room ${room.id}.`);
        }
        console.log(`[RoomCard Debug] Rendering Room ${room.id} with agents:`, roomAgents.map(a => a.name).join(', ') || 'Empty');
    }, [room.id, room.agentIds, roomAgents]);

    return (
        <Suspense fallback={null}>
            {/* --- LIGHTING (Polished for Ambience) --- */}
            <ambientLight intensity={1.5} />
            <spotLight
                position={[0, 8, 5]}
                angle={0.8}
                penumbra={0.5}
                intensity={25}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
            />
             <rectAreaLight width={4} height={0.5} intensity={15} color={vibeColor} position={[-2.5, -0.7, 2]} rotation-x={-Math.PI / 2} rotation-y={0.5} />
             <rectAreaLight width={4} height={0.5} intensity={15} color={vibeColor} position={[2.5, -0.7, 2]} rotation-x={-Math.PI / 2} rotation-y={-0.5}/>


            {/* --- ENVIRONMENT --- */}
            <mesh position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[8, 6]} />
                 <meshStandardMaterial color="#808080" metalness={0.2} roughness={0.8} />
            </mesh>
            
            {/* Side Walls */}
            <mesh position={[-4, 1.2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
                <planeGeometry args={[6, 4]}/>
                <meshStandardMaterial color="white" roughness={0.9} />
            </mesh>
            <mesh position={[4, 1.2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
                <planeGeometry args={[6, 4]}/>
                <meshStandardMaterial color="white" roughness={0.9} />
            </mesh>


            <group position={[0, 1.2, -2]}>
                 <mesh receiveShadow castShadow>
                    <boxGeometry args={[8, 4, 0.2]} />
                     <meshStandardMaterial map={wallTexture} roughness={0.8} />
                </mesh>
                
                {/* Window Frames (Large Window Resized) */}
                <group position={[-1.5, 0, 0.11]}>
                    <mesh position={[0, 0.62, 0]}><boxGeometry args={[1.7, 0.05, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                    <mesh position={[0, -0.62, 0]}><boxGeometry args={[1.7, 0.05, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                    <mesh position={[0.85, 0, 0]}><boxGeometry args={[0.05, 1.2, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                    <mesh position={[-0.85, 0, 0]}><boxGeometry args={[0.05, 1.2, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                </group>
                 <group position={[1.8, 0.4, 0.11]}>
                    <mesh position={[0, 0.525, 0]}><boxGeometry args={[1.05, 0.05, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                    <mesh position={[0, -0.525, 0]}><boxGeometry args={[1.05, 0.05, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                    <mesh position={[0.525, 0, 0]}><boxGeometry args={[0.05, 1, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                    <mesh position={[-0.525, 0, 0]}><boxGeometry args={[0.05, 1, 0.05]} /><meshStandardMaterial color="black" /></mesh>
                </group>

                {/* Glowing Window Panes (Simulating Sunlight) */}
                 <mesh position={[-1.5, 0, 0.11]}>
                     <planeGeometry args={[1.65, 1.2]} />
                     <meshStandardMaterial color="#ffffe5" emissive="#ffffe5" emissiveIntensity={2} toneMapped={false} />
                 </mesh>
                  <mesh position={[1.8, 0.4, 0.11]}>
                     <planeGeometry args={[1, 1]} />
                      <meshStandardMaterial color="#ffffe5" emissive="#ffffe5" emissiveIntensity={1.5} toneMapped={false} />
                 </mesh>
            </group>


            {/* Counter Table */}
             <mesh position={[0, -0.2, 0]} castShadow>
                <boxGeometry args={[2.5, 0.1, 0.8]} />
                <meshStandardMaterial color="#a0522d" roughness={0.2} metalness={0.1} />
            </mesh>
            <mesh position={[0, -0.5, 0]} castShadow>
                <boxGeometry args={[2.4, 0.6, 0.7]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            
            {/* Coffee Mugs */}
            <mesh position={[-0.5, -0.1, 0]} scale={0.08} castShadow>
                <cylinderGeometry args={[0.5, 0.5, 1, 16]}/>
                <meshStandardMaterial color="white" />
            </mesh>
             <mesh position={[0.5, -0.1, 0]} scale={0.08} castShadow>
                <cylinderGeometry args={[0.5, 0.5, 1, 16]}/>
                <meshStandardMaterial color="white" />
            </mesh>

            {/* --- AGENTS & EFFECTS --- */}
            {room.activeOffer && <HolographicOffer text={`$${room.activeOffer.token}\n@ ${room.activeOffer.price} BOX`} />}
            
            {roomAgents.map((agent, index) => {
                const side = index === 0 ? -1 : 1;
                return (
                    <group key={agent.id} position={[0.9 * side, -0.8, 0]} rotation={[0, (Math.PI / 2.2) * -side, 0]}>
                        <VrmModel modelUrl={agent.modelUrl || ''} isSpeaking={false} />
                        {Array.isArray(thinkingAgents) && thinkingAgents.includes(agent.id) && <ThinkingIndicator />}
                    </group>
                )
            })}
        </Suspense>
    );
}


type RoomCardProps = {
    room: RoomType;
    userAgent: Agent;
    onListenIn: () => void;
    onShowDetails: () => void;
};

export default function RoomCard({ room, userAgent, onListenIn, onShowDetails }: RoomCardProps) {
    const { availablePresets, availablePersonal } = useAgent();
    const allAgents = useMemo(() => [...availablePresets, ...availablePersonal], [availablePresets, availablePersonal]);
    const roomAgents = room.agentIds.map(id => getAgentById(id, allAgents)).filter((a): a is Agent => !!a);

    const placeholder = (
        <div className={styles.roomCardPlaceholder}>
            <span className="icon">coffee</span>
            <p>Loading Room...</p>
        </div>
    );

    return (
        <div className={styles.roomCard}>
            <RenderOnView placeholder={placeholder}>
                <div className={styles.roomCardCanvas}>
                    <Canvas shadows camera={{ position: [0, 0.6, 3], fov: 50 }}>
                        <RoomScene room={room} />
                    </Canvas>
                </div>
            </RenderOnView>
            <div className={styles.roomCardUiOverlay}>
                <div className={styles.roomCardHeader}>
                    {roomAgents.map((agent) => (
                        <div key={agent.id} className={styles.agentNameTag}>
                            {agent.name}
                        </div>
                    ))}
                </div>
                 <div className={styles.roomCardFooter}>
                    <button className="button secondary" onClick={(e) => { e.stopPropagation(); onShowDetails(); }}>
                        <span className="icon">info</span> Details
                    </button>
                    <button className="button primary" onClick={(e) => { e.stopPropagation(); onListenIn(); }}>
                        <span className="icon">hearing</span> Listen In
                    </button>
                 </div>
            </div>
        </div>
    );
}