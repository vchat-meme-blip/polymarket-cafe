/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Added '@react-three/fiber' import to augment the JSX namespace and resolve TypeScript errors for 3D components.
import '@react-three/fiber';
// FIX: Added missing 'React' import to resolve namespace errors.
import React from 'react';
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScroll, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Quant } from './Quant';
// FIX: AGENT_COLORS is not exported from agents.ts. It's defined locally here.

// FIX: Define AGENT_COLORS locally to resolve the import error.
const AGENT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', 
  '#9b59b6', '#e67e22', '#1abc9c', '#e84393'
];

export function Scene({ onSignIn }: { onSignIn: any }) {
  const scroll = useScroll();
  const group = useRef<THREE.Group>(null!);
  const mainQuant = useRef<THREE.Group>(null!);
  const formRef = useRef<HTMLDivElement>(null!);
  const dioramaRef = useRef<THREE.Group>(null!);

  const [localHandle, setLocalHandle] = useState('');

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    onSignIn(localHandle);
  };

  useFrame((state, delta) => {
    if (!group.current || !mainQuant.current || !formRef.current || !dioramaRef.current) return;

    const r1 = scroll.range(0, 1 / 3);
    const r2 = scroll.range(1 / 3, 2 / 3);
    const r3 = scroll.range(0, 1);

    // Camera animation: "Tumbling down" effect for the first part
    const tumblingRotation = -Math.PI * r1;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, tumblingRotation, delta * 2);
    
    // Main Quant running forward animation
    mainQuant.current.position.z = -2 - 10 * r3;

    // Camera movement: Move forward, then pan to the final scene
    const finalZ = 12;
    const finalX = -3;
    const finalY = 1.5;
    
    state.camera.position.z = THREE.MathUtils.lerp(5, finalZ, r2);
    state.camera.position.x = THREE.MathUtils.lerp(0, finalX, r2);
    state.camera.position.y = THREE.MathUtils.lerp(0, finalY, r2);
    
    // Final camera lookAt adjustment for the diorama
    const lookAtTarget = new THREE.Vector3(
        THREE.MathUtils.lerp(0, -1, r2),
        THREE.MathUtils.lerp(0, -1, r2),
        THREE.MathUtils.lerp(0, -20, r2)
    );
    state.camera.lookAt(lookAtTarget);

    // Animate form and diorama visibility based on scroll
    formRef.current.style.opacity = `${1 - r1 * 2}`;
    dioramaRef.current.visible = scroll.visible(2 / 3, 1 / 3);
  });

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[10, 10, 5]} intensity={2} />
      <directionalLight position={[-10, -10, -5]} intensity={1} color="blue" />

      <group ref={group}>
        {/* Main Mascot */}
        <group ref={mainQuant}>
          <Quant color="#4285F4" position={[0, -0.2, -2]} scale={1.5} />
        </group>

        {/* Floating shapes for parallax */}
        {Array.from({ length: 50 }).map((_, i) => (
          <mesh
            key={i}
            position={[
              (Math.random() - 0.5) * 20,
              (Math.random() - 0.5) * 10,
              -5 - Math.random() * 30,
            ]}
          >
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial
              color={AGENT_COLORS[i % AGENT_COLORS.length]}
              roughness={0.7}
            />
          </mesh>
        ))}

        {/* --- HTML OVERLAY --- */}
        <Html
          ref={formRef}
          position={[0, 1.5, 0]}
          center
          transform
          wrapperClass="html-overlay-content"
          style={{
            transition: 'opacity 0.5s',
            opacity: 1,
          }}
        >
          <h1>Welcome to Quants</h1>
          <p>The SocialFi platform where AI agents learn, trade, and dominate.</p>
          <form className="sign-in-form" onSubmit={handleSignIn}>
            <input
              type="text"
              className="handle-input"
              placeholder="@your_handle"
              value={localHandle}
              onChange={e => setLocalHandle(e.target.value)}
              required
              aria-label="Enter your handle"
            />
            <button
              type="submit"
              className="button sign-in-button"
              disabled={!localHandle.trim()}
            >
              Enter the Café
            </button>
          </form>
        </Html>
      </group>

      {/* Final "Quants on a log" scene */}
      <group ref={dioramaRef} position={[0, -2, -20]}>
        {/* The log */}
        <mesh position={[0, -0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 4, 16]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>

        {/* The Quants */}
        {/* FIX: The 'Agent' type does not have a 'bodyColor' property. Use colors from the AGENT_COLORS array instead. */}
        <Quant color={AGENT_COLORS[0]} position={[-1.5, 0, 0]} />
        <Quant color={AGENT_COLORS[1]} position={[-0.5, 0, 0]} />
        <Quant color={AGENT_COLORS[2]} position={[0.5, 0, 0]} />
        <Quant color={AGENT_COLORS[3]} position={[1.5, 0, 0]} />
      </group>
    </>
  );
}