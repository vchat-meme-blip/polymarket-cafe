import React from 'react';
import { Canvas } from '@react-three/fiber';
import { VrmModel } from '../agents/VrmAvatar';

export default function SecondaryScene() {
  return (
    <div style={{ height: '400px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
      <Canvas camera={{ position: [0, -0.5, 4.5], fov: 35 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[0, 5, 5]} intensity={1.5} />
        <hemisphereLight intensity={0.8} groundColor="black" color="#87CEEB" />

        <group position={[0, -1.2, 0]}>
          <group position={[-0.7, 0, 0]} scale={1.2} rotation={[0, 0.2 + Math.PI, 0]}>
            <VrmModel modelUrl="/models/joker.vrm" animationUrl="/animations/gesture_dance.vrma" />
          </group>

          <group position={[0.7, 0, 0]} scale={1.44} rotation={[0, -0.2 + Math.PI, 0]}>
            <VrmModel modelUrl="/models/spiderman.vrm" animationUrl="/animations/gesture_shoot.vrma" />
          </group>
        </group>
      </Canvas>
    </div>
  );
}