/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Added '@react-three/fiber' import to augment the JSX namespace and resolve TypeScript errors for 3D components.
import '@react-three/fiber';
import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const IDLE_ANIMATIONS = ['bob', 'swingLegs', 'lookAround', 'still'];

// FIX: Add initialAnimation to props to fix typing errors in consuming components.
export function Quant({ color, position, scale = 1, initialAnimation = 'bob' }: { color: any, position: any, scale?: number, initialAnimation?: string }) {
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Mesh>(null!);
  const leftLeg = useRef<THREE.Mesh>(null!);
  const rightLeg = useRef<THREE.Mesh>(null!);

  // FIX: Use the initialAnimation prop to set the starting animation.
  const [animation, setAnimation] = useState(initialAnimation);

  // Change animation randomly
  useEffect(() => {
    // FIX: Only start random idle animations if the initial animation is an idle one.
    if (!IDLE_ANIMATIONS.includes(initialAnimation)) return;

    const changeAnim = () => {
      const nextAnim =
        IDLE_ANIMATIONS[Math.floor(Math.random() * IDLE_ANIMATIONS.length)];
      setAnimation(nextAnim);
      // Schedule next change
      setTimeout(changeAnim, 3000 + Math.random() * 4000);
    };
    const handle = setTimeout(changeAnim, Math.random() * 5000);
    return () => clearTimeout(handle);
    // FIX: Add dependency to respect prop changes.
  }, [initialAnimation]);

  const bobSpeed = useMemo(() => 0.5 + Math.random() * 0.5, []);
  const swingSpeed = useMemo(() => 2 + Math.random() * 2, []);

  useFrame(state => {
    if (!group.current || !body.current || !leftLeg.current || !rightLeg.current) return;
    const t = state.clock.getElapsedTime();

    // Reset animations before applying the current one
    body.current.rotation.y = THREE.MathUtils.lerp(body.current.rotation.y, 0, 0.1);
    leftLeg.current.rotation.x = THREE.MathUtils.lerp(leftLeg.current.rotation.x, 0, 0.1);
    rightLeg.current.rotation.x = THREE.MathUtils.lerp(rightLeg.current.rotation.x, 0, 0.1);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, position[1], 0.1);

    switch (animation) {
      // FIX: Add 'running' animation case for MascotRunner component.
      case 'running': {
        const speed = 10;
        leftLeg.current.rotation.x = Math.sin(t * speed) * 0.8;
        rightLeg.current.rotation.x = -Math.sin(t * speed) * 0.8;
        group.current.position.y = position[1] + Math.abs(Math.sin(t * speed * 0.5)) * 0.08 * scale;
        break;
      }
      case 'bob':
        group.current.position.y =
          position[1] + Math.sin(t * bobSpeed) * 0.05 * scale;
        break;
      case 'swingLegs':
        leftLeg.current.rotation.x = Math.sin(t * swingSpeed) * 0.5;
        rightLeg.current.rotation.x = -Math.sin(t * swingSpeed) * 0.5;
        break;
      case 'lookAround':
        body.current.rotation.y = Math.sin(t * 0.7) * 0.4;
        break;
      case 'still':
      default:
        // Do nothing, the lerp handles returning to neutral
        break;
    }
  });

  return (
    <group ref={group} position={position} scale={scale}>
      {/* Body as sphere */}
      <mesh ref={body}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>

      {/* Legs as boxes */}
      <mesh ref={leftLeg} position={[-0.1, -0.4, 0]}>
        <boxGeometry args={[0.05, 0.2, 0.05]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
      <mesh ref={rightLeg} position={[0.1, -0.4, 0]}>
        <boxGeometry args={[0.05, 0.2, 0.05]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
    </group>
  );
}
