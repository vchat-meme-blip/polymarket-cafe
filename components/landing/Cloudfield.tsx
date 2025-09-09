// FIX: Added '@react-three/fiber' import to augment the JSX namespace and resolve TypeScript errors for 3D components.
import '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function Cloudfield() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const count = 80;

  const { positions, scales, speeds } = useMemo(() => {
    const positions = Array.from({ length: count }, () => new THREE.Vector3(
      (Math.random() - 0.5) * 30,
      Math.random() * 6 + 1,
      -6 - Math.random() * 30
    ));
    const scales = Float32Array.from({ length: count }, () => Math.random() * 0.8 + 0.6);
    const speeds = Float32Array.from({ length: count }, () => Math.random() * 0.06 + 0.02);
    return { positions, scales, speeds };
  }, []);

  useFrame((_, delta) => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const p = positions[i];
      p.x += speeds[i] * delta * 2;
      if (p.x > 18) p.x = -18;
      dummy.position.copy(p);
      dummy.scale.set(scales[i] * 2.2, scales[i], scales[i] * 1.6);
      dummy.rotation.set(0, 0, Math.sin((p.x + i) * 0.1) * 0.1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined as any, undefined as any, count]}>
      <sphereGeometry args={[0.5, 10, 10]} />
      <meshStandardMaterial color="#ffffff" roughness={1} metalness={0} transparent opacity={0.7} />
    </instancedMesh>
  );
}
