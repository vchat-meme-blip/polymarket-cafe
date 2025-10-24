/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import '@react-three/fiber';
import React, { Suspense, useEffect, useMemo, useState, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Text, useTexture } from '@react-three/drei';
import { useArenaStore } from '../../lib/state/arena';
import { Interaction, Offer, Room as RoomType } from '../../lib/types/index.js';
import { Agent } from '../../lib/types/index.js';
import { useAgent } from '../../lib/state/index.js';
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
    <group ref={ref}>
      <Text fontSize={0.15} color="white" material-toneMapped={false}>THINKING...</Text>
    </group>
  );
};

const HolographicOffer = ({ offer }: { offer: Offer }) => {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => { if (ref.current) { ref.current.fillOpacity = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 5); } });

  let text = '';
  if (offer.type === 'intel') {
      text = `INTEL ON\n${offer.market}\n@ ${offer.price} BOX`;
  } else if (offer.type === 'watchlist') {
      text = `WATCHLIST\n@ ${offer.price} BOX`;
  }

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
    }, [agentConversations, room.agentIds, lastSyncTimestamp]);
    
    useEffect(() => {
        if (room.activeOffer) {
            const activeOffer = room.activeOffer;
            let newOfferKey = '';
            if (activeOffer.type === 'intel') {
                newOfferKey = `${activeOffer.type}-${activeOffer.market}-${activeOffer.price}-${Date.now()}`;
            } else if (activeOffer.type === 'watchlist') {
                newOfferKey = `${activeOffer.type}-${activeOffer.watchlistId}-${activeOffer.price}-${Date.now()}`;
            }
            setOfferKey(newOfferKey);
        } else {
            setOfferKey("");
        }
    }, [room.activeOffer, lastSyncTimestamp]);

    return (
        <Suspense fallback={null}>
            <ambientLight intensity={2.0} />
            <directionalLight position={[0, 8, 5]} intensity={3} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}/>
            <rectAreaLight width={8} height={2} intensity={20} color={vibeColor} position={[0, -0.9, 0]} rotation-x={-Math.PI / 2} />

            <mesh position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[10, 8]} />
                <meshStandardMaterial color="#333333" />
            </mesh>
            
            <group position={[0, 1.2, -4]}>
                <mesh receiveShadow castShadow>
                    <boxGeometry args={[10, 4, 0.2]} />
                    <meshStandardMaterial map={wallpaper} roughness={0.8} />
                </mesh>
                <mesh position={[-2.5, 0.8, 0.11]} renderOrder={1}>
                    <planeGeometry args={[1.5, 1]} />
                    <meshStandardMaterial color="#87CEEB" emissive="#87CEEB" emissiveIntensity={0.5} toneMapped={false} />
                </mesh>
                 <mesh position={[-2.5, 0.8, 0.1]}>
                    <boxGeometry args={[1.6, 1.1, 0.05]} />
                    <meshStandardMaterial color="black" />
                </mesh>
                <mesh position={[2.5, 0.8, 0.11]} renderOrder={1}>
                    <planeGeometry args={[1.5, 1]} />
                    <meshStandardMaterial color="#87CEEB" emissive="#87CEEB" emissiveIntensity={0.5} toneMapped={false} />
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
            
            <mesh position={[0, 0.15, 0]} castShadow>
                <boxGeometry args={[2.2, 0.1, 0.7]} />
                <meshStandardMaterial color="#6f4e37" roughness={0.3} metalness={0.2} />
            </mesh>
            <mesh position={[0, -0.25, 0]} castShadow>
                <boxGeometry args={[0.4, 0.8, 0.4]} />
                <meshStandardMaterial color="#3a2d27" />
            </mesh>

            <mesh position={[-0.5, 0.25, 0]} scale={0.07} castShadow>
                <cylinderGeometry args={[0.5, 0.4, 0.7, 16]}/>
                <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.2} />
            </mesh>
            <mesh position={[0.5, 0.25, 0]} scale={0.07} castShadow>
                <cylinderGeometry args={[0.5, 0.4, 0.7, 16]}/>
                <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.2} />
            </mesh>

            {room.activeOffer && <HolographicOffer key={offerKey} offer={room.activeOffer} />}
            
            {roomAgents.map((agent, index) => {
                const isSpeaking = latestTurn?.agentId === agent.id;
                const isThinking = thinkingAgents.has(agent.id);
                
                const position: [number, number, number] = [1.5 * (index === 0 ? -1 : 1), -1.0, 0.8];
                const rotationOffset = agent.modelUrl?.includes('war_boudica') ? 0 : Math.PI;
                // Statically face slightly inwards to be more stable than dynamic lookAt
                const facingRotation = index === 0 ? Math.PI / 12 : -Math.PI / 12;

                return (
                    <group key={agent.id} position={position} rotation={[0, rotationOffset + facingRotation, 0]}>
                        <ArenaAgent agent={agent} isSpeaking={isSpeaking} />
                        {isSpeaking && latestTurn && <ThoughtBubble text={latestTurn.text} />}
                        {isThinking && !isSpeaking && <ThinkingIndicator />}
                    </group>
                );
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
                    <Canvas shadows camera={{ position: [0, 1.0, 4.5], fov: 45 }}>
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
