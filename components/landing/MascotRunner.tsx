// FIX: Added '@react-three/fiber' import to augment the JSX namespace and resolve TypeScript errors for 3D components.
import '@react-three/fiber';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Quant } from './Quant';

export default function MascotRunner({ position = [-4, -0.8, -3] as [number, number, number], scale = 1 }) {
  const group = useRef<THREE.Group>(null!);
  const { camera } = useThree();

  useFrame((state) => {
    if (!group.current) return;

    // Oscillate runner left-right in a lane
    const t = state.clock.getElapsedTime();
    const x = position[0] + Math.sin(t * 0.6) * 0.6;
    const z = position[2] + Math.cos(t * 0.4) * 0.4;
    group.current.position.set(x, position[1], z);

    // Turn to face camera when it comes close, otherwise face forward (negative Z)
    const toCam = camera.position.clone().sub(group.current.getWorldPosition(new THREE.Vector3()));
    const faceCamera = toCam.length() < 6;
    const targetYaw = faceCamera ? Math.atan2(toCam.x, toCam.z) : 0; // 0 faces -Z by convention in this scene
    const euler = new THREE.Euler(0, THREE.MathUtils.lerp(group.current.rotation.y, targetYaw, 0.08), 0);
    group.current.rotation.copy(euler);
  });

  return (
    <group ref={group}>
      <Quant color="#ff7fbf" position={[0, 0, 0]} scale={scale} initialAnimation="running" />
    </group>
  );
}
