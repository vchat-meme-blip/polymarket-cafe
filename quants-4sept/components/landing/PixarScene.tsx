/**
 * Minimal hero scene focused purely on the VRM agents.
 * All non-VRM decorative 3D elements were removed for clarity and performance.
 */
import '@react-three/fiber';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VrmModel } from '../agents/VrmAvatar';
import styles from './Landing.module.css';

export default function PixarScene() {
  // trigger keys for one-shot animations per model: [stranger, trump, boudica, ironman]
  const [triggerKeys, setTriggerKeys] = useState<[number, number, number, number]>([0, 0, 0, 0]);

  // Re-introducing parallax effect
  useFrame((state) => {
    // Mouse parallax effect for the camera
    const targetLookAt = new THREE.Vector3(
      state.pointer.x * -0.2,
      -0.5 + state.pointer.y * 0.2,
      0
    );
    state.camera.lookAt(targetLookAt);
  });

  // Every 5 seconds, randomly pick one avatar to perform its gesture once
  useEffect(() => {
    const interval = setInterval(() => {
      setTriggerKeys((prev) => {
        const idx = Math.floor(Math.random() * 4);
        const next: [number, number, number, number] = [...prev] as any;
        next[idx] = prev[idx] + 1; // bump to retrigger that avatar only
        return next;
      });
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Lighting setup for good visibility */}
      <ambientLight intensity={0.7} />
      <directionalLight 
        position={[0, 2, 5]} // Frontal light
        intensity={2.0} 
      />
      <hemisphereLight intensity={0.5} groundColor="black" color="white" />

      {/* VRM Models: Centered, scaled up, and animated */}
      <group position={[0, -3, 2.0]} scale={1.0}> 
        {/* Stranger model - larger, idles on idle2, performs cute gesture on trigger */}
        <group position={[-5.0, 0.2, 0.1]} scale={4.5} rotation={[0, Math.PI, 0]}>
          <VrmModel
            modelUrl="/models/stranger.vrm"
            idleUrl="/animations/gesture_elegant.vrma"
            triggerAnimationUrl="/animations/gesture_cute.vrma"
            triggerKey={triggerKeys[0]}
          />
        </group>

        {/* Trump model - smaller, face darkened, greets on trigger */}
        <group position={[-1.7, -0.5, 0.5]} scale={3.3} rotation={[0, Math.PI, 0]}>
          <VrmModel
            modelUrl="/models/trump.vrm"
            idleUrl="/animations/gesture_shoot.vrma"
            triggerAnimationUrl="/animations/gesture_greeting.vrma"
            triggerKey={triggerKeys[1]}
            darkenFace
          />
        </group>

        {/* Boudica model - idles and performs peace sign on trigger */}
        <group position={[1.8, -0.5, 0.7]} scale={3.6}>
          <VrmModel
            modelUrl="/models/war_boudica.vrm"
            idleUrl="/animations/idle_loop.vrma"
            triggerAnimationUrl="/animations/gesture_peacesign.vrma"
            triggerKey={triggerKeys[2]}
          />
        </group>

        {/* Ironman model - idles and performs squat on trigger */}
        <group position={[5.0, 0, 0.1]} scale={2.6} rotation={[0, Math.PI, 0]}>
          <VrmModel
            modelUrl="/models/ironman.vrm"
            idleUrl="/animations/idle2.vrma"
            triggerAnimationUrl="/animations/gesture_squat.vrma"
            triggerKey={triggerKeys[3]}
          />
        </group>
      </group>
    </>
  );
}
