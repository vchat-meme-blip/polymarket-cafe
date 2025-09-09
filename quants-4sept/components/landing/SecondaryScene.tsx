import React from 'react';
import { Canvas } from '@react-three/fiber';
import { VrmModel } from '../agents/VrmAvatar';
import * as THREE from 'three';

export default function SecondaryScene() {
  return (
    <div style={{ height: '400px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
      <Canvas camera={{ position: [0, 0.5, 2.5], fov: 40 }}>
        {/* Lighting for the secondary scene */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[0, 5, 5]} intensity={1.5} />
        <hemisphereLight intensity={0.6} groundColor="black" color="white" />

        {/* Joker and Spiderman Models */}
        <group position={[0, -0.8, 0]}> {/* Adjusted group position for new scale */}
          {/* Joker: Scaled down, moved to the left, with 'dance' animation */}
          <group position={[-0.5, 0, 0]} scale={0.75} rotation={[0, Math.PI, 0]}>
            <VrmModel modelUrl="/models/joker.vrm" animationUrl="/animations/gesture_dance.vrma" />
          </group>

          {/* Spiderman: Scaled down, moved to the right, with 'shoot' animation */}
          <group position={[1.0, 0.1, 0]} scale={0.9} rotation={[0, Math.PI, 0]}>
            <VrmModel modelUrl="/models/spiderman.vrm" animationUrl="/animations/gesture_shoot.vrma" />
          </group>
        </group>
      </Canvas>
    </div>
  );
}
