/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type QuantPlaceholderProps = {
  color: string;
  isSpeaking: boolean;
};

/**
 * A stylized 3D placeholder for agents that don't have a VRM model.
 * Inspired by the "Quants" on the landing page.
 */
export default function QuantPlaceholder({ color, isSpeaking }: QuantPlaceholderProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Mesh>(null!);

  useFrame((state, delta) => {
    if (!groupRef.current || !bodyRef.current) return;
    const t = state.clock.getElapsedTime();

    // Idle animation: Gentle bobbing
    let targetY = 0.8 + Math.sin(t * 1.5) * 0.05;

    // Speaking animation: More energetic jiggle
    if (isSpeaking) {
      targetY += Math.sin(t * 20) * 0.08;
    }
    
    // Smoothly interpolate to the target position
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, delta * 8);

    // Subtle rotation when speaking
    const targetRotY = isSpeaking ? Math.sin(t * 5) * 0.2 : 0;
    bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, targetRotY, delta * 5);
  });

  return (
    <group ref={groupRef} scale={0.8}>
      {/* Body as sphere */}
      <mesh ref={bodyRef} castShadow>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Base/Feet */}
      <mesh position={[0, -0.4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 0.2, 16]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
}