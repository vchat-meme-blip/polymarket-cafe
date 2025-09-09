// FIX: Added '@react-three/fiber' import to augment the JSX namespace and resolve TypeScript errors for 3D components.
import '@react-three/fiber';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function Ground() {
  const mat = useRef<THREE.ShaderMaterial>(null!);

  useFrame((state) => {
    if (mat.current) {
      mat.current.uniforms.time.value = state.clock.getElapsedTime();
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
      <planeGeometry args={[60, 120, 200, 200]} />
      <shaderMaterial
        ref={mat}
        transparent
        uniforms={{
          time: { value: 0 },
          base: { value: new THREE.Color('#1a1d24') },
          strip: { value: new THREE.Color('#2a3242') },
        }}
        vertexShader={`
          uniform float time;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            float n = sin(p.x * 0.25 + time * 1.2) * 0.08 + cos(p.y * 0.2 + time * 0.8) * 0.06;
            p.z += n;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform vec3 base;
          uniform vec3 strip;
          void main() {
            float lines = smoothstep(0.48, 0.5, abs(fract(vUv.y * 24.0) - 0.5));
            vec3 c = mix(strip, base, lines);
            gl_FragColor = vec4(c, 1.0);
          }
        `}
      />
    </mesh>
  );
}
