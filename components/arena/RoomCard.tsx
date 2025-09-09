/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import '@react-three/fiber';
// FIX: Added missing imports for 'useRef' and 'useFrame' to resolve errors.
import React, { Suspense, useEffect, useMemo, useState, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Text, useTexture } from '@react-three/drei';
import { useArenaStore } from '../../lib/state/arena';
// FIX: Imported `Interaction` and `Room` types from their canonical source in `lib/types` instead of from the state store to resolve module export errors.
import { Interaction, Room as RoomType } from '../../lib/types/index.js';
import { Agent } from '../../lib/types/index.js';
import { useAgent } from '../../lib/state';
import RenderOnView from '../agents/RenderOnView';
import ArenaAgent from './ArenaAgent';
import styles from './Arena.module.css';

const VIBE_COLORS: Record<string, string> = {
  'Bullish 🐂': '#2ecc71', 'Bearish 🐻': '#e74c3c',
  'Alpha Leaks 🧠': '#3498db', 'Shill Zone 🚀': '#f1c40f',
  'General Chat ☕️': '#9b59b6',
};

const WALLPAPER_URLS = [
    '/textures/wall_pattern1.png', '/textures/wall_pattern2.png',
    '/textures/wall_pattern3.png', '/textures/wall_pattern4.png',
    '/textures/wall_pattern5.png', '/textures/wall_pattern6.png',
    '/textures/wall_pattern7.png',
];

const SkyWindowMaterial = () => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, 128);
      gradient.addColorStop(0, '#87CEEB'); // Sky Blue
      gradient.addColorStop(1, '#B0E0E6'); // Powder Blue
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  return <meshBasicMaterial map={texture} toneMapped={false} />;
};

function getAgentById(id: string, allAgents: Agent[]): Agent | undefined {
  return allAgents.find(agent => agent.id === id);
}

const ThinkingIndicator = () => {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 2;
      ref.current.position.y = 1.8 + Math.sin(clock.getElapsedTime() * 5) * 0.1;
    }
  });
  return (
    <group ref={ref} position={[0, 1.8, 0]}>
      <Text fontSize={0.15} color="white" material-toneMapped={false}>THINKING...</Text>
    </group>
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

const ThoughtBubble = ({ text }: { text: string }) => {
  return (
    <Html position={[0, 1.8, 0]} center>
      <div className={styles.thoughtBubble}>{text}</div>
    </Html>
  );
};

type RoomSceneProps = { room: RoomType; };

function RoomScene({ room }: RoomSceneProps) {
    const { availablePresets, availablePersonal } = useAgent();
    const allAgents = useMemo(() => [...availablePresets, ...availablePersonal], [availablePresets, availablePersonal]);
    const { thinkingAgents, agentConversations, lastSyncTimestamp } = useArenaStore();
    const roomAgents = room.agentIds.map(id => getAgentById(id, allAgents)).filter((a): a is Agent => !!a);
    const vibeColor = useMemo(() => new THREE.Color(VIBE_COLORS[room.vibe || 'General Chat ☕️'] || '#9b59b6'), [room.vibe]);
    
    const wallpaperUrl = useMemo(() => {
        const roomNumber = parseInt(room.id.replace(/\D/g, ''), 10) || 0;
        return WALLPAPER_URLS[roomNumber % WALLPAPER_URLS.length];
    }, [room.id]);

    const wallpaper = useTexture(wallpaperUrl);
    wallpaper.wrapS = wallpaper.wrapT = THREE.RepeatWrapping;

        
    const [latestTurn, setLatestTurn] = useState<Interaction | null>(null);
    const [offerKey, setOfferKey] = useState<string>("");
    
    // Effect to update the latest conversation turn
    useEffect(() => {
        if (room.agentIds.length < 2) {
            setLatestTurn(null);
            return;
        };
        const [agent1Id, agent2Id] = room.agentIds;
        const conversation = agentConversations[agent1Id]?.[agent2Id] || [];
        if (conversation.length > 0) {
            setLatestTurn(conversation[conversation.length - 1]);
        } else {
            setLatestTurn(null);
        }
    }, [agentConversations, room.agentIds]);
    
    // Effect to update the offer key when a trade offer changes
    // This ensures the holographic offer animation resets when a new offer is made
    useEffect(() => {
        if (room.activeOffer) {
            const newOfferKey = `${room.activeOffer.token}-${room.activeOffer.price}-${Date.now()}`;
            setOfferKey(newOfferKey);
        } else {
            setOfferKey("");
        }
    }, [room.activeOffer, lastSyncTimestamp]);

    return (
        <Suspense fallback={null}>
            <ambientLight intensity={1.2} />
            <directionalLight position={[0, 8, 5]} intensity={3} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}/>
            <rectAreaLight width={4} height={0.5} intensity={15} color={vibeColor} position={[-2.5, -0.7, 2]} rotation-x={-Math.PI / 2} rotation-y={0.5} />
            <rectAreaLight width={4} height={0.5} intensity={15} color={vibeColor} position={[2.5, -0.7, 2]} rotation-x={-Math.PI / 2} rotation-y={-0.5}/>

            <mesh position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[10, 8]} />
                <meshStandardMaterial color="#333333" />
            </mesh>
            
            <group position={[0, 1.2, -4]} rotation-x={0}>
                <mesh receiveShadow castShadow>
                    <boxGeometry args={[10, 4, 0.2]} />
                    <meshStandardMaterial map={wallpaper} roughness={0.8} />
                </mesh>
                {/* Windows */}
                <mesh position={[-2.5, 0.8, 0.11]} renderOrder={1}>
                    <planeGeometry args={[1.5, 1]} />
                    <SkyWindowMaterial />
                </mesh>
                 <mesh position={[-2.5, 0.8, 0.1]}>
                    <boxGeometry args={[1.6, 1.1, 0.05]} />
                    <meshStandardMaterial color="black" />
                </mesh>
                <mesh position={[2.5, 0.8, 0.11]} renderOrder={1}>
                    <planeGeometry args={[1.5, 1]} />
                    <SkyWindowMaterial />
                </mesh>
                 <mesh position={[2.5, 0.8, 0.1]}>
                    <boxGeometry args={[1.6, 1.1, 0.05]} />
                    <meshStandardMaterial color="black" />
                </mesh>
            </group>
            <mesh position={[-5, 1.2, 0]} rotation-y={Math.PI / 2} receiveShadow>
                <boxGeometry args={[8, 4, 0.2]} />
                <meshStandardMaterial map={wallpaper} roughness={0.8} />
            </mesh>
            <mesh position={[5, 1.2, 0]} rotation-y={-Math.PI / 2} receiveShadow>
                <boxGeometry args={[8, 4, 0.2]} />
                <meshStandardMaterial map={wallpaper} roughness={0.8} />
            </mesh>
            
            {/* Table */}
            <mesh position={[0, 0.15, 0]} castShadow>
                <boxGeometry args={[2.2, 0.1, 0.7]} />
                <meshStandardMaterial color="#6f4e37" roughness={0.3} metalness={0.2} />
            </mesh>
            <mesh position={[0, -0.25, 0]} castShadow>
                <boxGeometry args={[0.4, 0.8, 0.4]} />
                <meshStandardMaterial color="#3a2d27" />
            </mesh>

            {/* Cups */}
            <mesh position={[-0.5, 0.25, 0]} scale={0.07} castShadow>
                <cylinderGeometry args={[0.5, 0.4, 0.7, 16]}/>
                <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.2} />
            </mesh>
            <mesh position={[0.5, 0.25, 0]} scale={0.07} castShadow>
                <cylinderGeometry args={[0.5, 0.4, 0.7, 16]}/>
                <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.2} />
            </mesh>

            {room.activeOffer && <HolographicOffer key={offerKey} text={`$${room.activeOffer.token}\n@ ${room.activeOffer.price} BOX`} />}
            
            
            {roomAgents.map((agent, index) => {
                const isSpeaking = latestTurn?.agentId === agent.id;
                return (
                    <React.Fragment key={agent.id}>
                        <group position-y={0.5}>
                            <ArenaAgent agent={agent} index={index} isSpeaking={isSpeaking} />
                        </group>
                        {isSpeaking && latestTurn && <group position={[1.3 * (index === 0 ? -1 : 1), -0.5, 0.8]}><ThoughtBubble text={latestTurn.text} /></group>}
                        {thinkingAgents.has(agent.id) && !isSpeaking && <group position={[1.3 * (index === 0 ? -1 : 1), -0.5, 0.8]}><ThinkingIndicator /></group>}
                    </React.Fragment>
                )
            })}
        </Suspense>
    );
}

type RoomCardProps = {
    room: RoomType;
    userAgent: Agent;
};

export default function RoomCard({ room, userAgent }: RoomCardProps) {
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
                    <Canvas shadows camera={{ position: [0, 1.5, 4.2], fov: 50 }}>
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
            </div>
        </div>
    );
}