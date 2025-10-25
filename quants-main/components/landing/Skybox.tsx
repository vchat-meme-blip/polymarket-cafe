import * as THREE from 'three';
import { BackSide, TextureLoader, Vector3 } from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';

export default function Skybox() {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const targetPosition = useRef(new Vector3());
  
  // Try to load the sky texture, fall back to a blue color if it fails
  let skyTexture;
  try {
    skyTexture = useLoader(TextureLoader, '/textures/cartoon_sky.png');
    skyTexture.colorSpace = 'srgb';
    skyTexture.minFilter = 1006; // LinearMipmapLinearFilter
    skyTexture.magFilter = 1006; // LinearFilter
    skyTexture.generateMipmaps = true;
    skyTexture.anisotropy = 4;
  } catch (error) {
    console.error('Failed to load sky texture:', error);
  }

  // Set up initial position
  useEffect(() => {
    if (ref.current) {
      ref.current.position.copy(camera.position);
    }
  }, [camera.position]);

  // Smooth parallax effect
  useFrame(() => {
    if (!ref.current) return;
    
    // Calculate target position with parallax effect
    const parallaxFactor = 0.7; // How much the background moves relative to camera
    targetPosition.current.x = camera.position.x * parallaxFactor;
    targetPosition.current.y = camera.position.y * (parallaxFactor * 0.5); // Less vertical movement
    
    // Smoothly interpolate to target position
    ref.current.position.lerp(targetPosition.current, 0.05);
    
    // Add subtle scale effect based on camera movement
    const scale = 1.0 + (Math.abs(camera.position.x) + Math.abs(camera.position.y)) * 0.0005;
    ref.current.scale.set(scale, scale, scale);
  });

  // Fallback to a blue sky if texture loading fails
  if (!skyTexture) {
    return (
      <mesh ref={ref}>
        <sphereGeometry args={[100, 32, 32]} />
        <meshBasicMaterial color="#87CEEB" side={BackSide} />
      </mesh>
    );
  }

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[100, 32, 32]} />
      <meshBasicMaterial 
        map={skyTexture} 
        side={BackSide} 
        toneMapped={false}
      />
    </mesh>
  );
}
