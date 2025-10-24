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
          color1: { value: new THREE.Color('#14F195') }, // Solana green
          color2: { value: new THREE.Color('#9945FF') }, // Solana purple
          color3: { value: new THREE.Color('#00F0FF') }, // Solana blue
          lightPosition: { value: new THREE.Vector3(0, 10, 0) }
        }}
        vertexShader={`
          uniform float time;
          varying vec2 vUv;
          varying vec3 vWorldPosition;
          void main() {
            vUv = uv * 4.0; // Tiling the texture
            vec3 p = position;
            
            // Subtle wave effect
            float wave = sin(p.x * 0.5 + time * 0.5) * 0.05 + 
                        cos(p.y * 0.5 + time * 0.3) * 0.05;
            p.z += wave;
            
            vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          varying vec3 vWorldPosition;
          uniform vec3 color1;
          uniform vec3 color2;
          uniform vec3 color3;
          uniform vec3 lightPosition;
          
          // Gradient function
          vec3 gradient(float t) {
            if (t < 0.5) {
              return mix(color1, color2, t * 2.0);
            } else {
              return mix(color2, color3, (t - 0.5) * 2.0);
            }
          }
          
          // Grid function
          float grid(vec2 coord, float width) {
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord * 0.5);
            float line = min(grid.x, grid.y);
            return 1.0 - min(line, 1.0) * width;
          }
          
          void main() {
            // Create a gradient based on world position
            float gradientFactor = smoothstep(-30.0, 30.0, vWorldPosition.x);
            vec3 baseColor = gradient(gradientFactor);
            
            // Add grid
            float gridLines = grid(vUv, 1.0) * 0.1; // Subtle grid
            
            // Add some noise for texture
            float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 0.1;
            
            // Combine everything
            vec3 finalColor = mix(baseColor, vec3(1.0), gridLines + noise);
            
            // Add rim lighting
            vec3 N = vec3(0.0, 1.0, 0.0);
            vec3 L = normalize(lightPosition - vWorldPosition);
            float rim = 1.0 - max(dot(N, L), 0.0);
            rim = smoothstep(0.4, 0.8, rim);
            finalColor = mix(finalColor, vec3(1.0), rim * 0.2);
            
            gl_FragColor = vec4(finalColor, 1.0);
          }
        `}
      />
    </mesh>
  );
}
