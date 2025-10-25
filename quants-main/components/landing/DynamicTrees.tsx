import '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT = 10;
const DUMMY = new THREE.Object3D();

export default function DynamicTrees() {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const treeData = useMemo(() => Array.from({ length: COUNT }, () => ({
        position: new THREE.Vector3(),
        scale: 1,
        nextUpdate: 0,
    })), []);

    // Function to set a new random position for a tree
    const setNewPosition = (index: number) => {
        const x = (Math.random() - 0.5) * 30;
        const z = -5 - Math.random() * 15;
        const scale = 0.8 + Math.random() * 0.6;
        
        treeData[index].position.set(x, -1.2, z);
        treeData[index].scale = scale;
    };

    // Initialize all trees
    useMemo(() => {
        treeData.forEach((_, i) => setNewPosition(i));
    }, [treeData]);

    useFrame(({ clock }) => {
        if (!meshRef.current) return;

        treeData.forEach((data, i) => {
            // Check if it's time to "glitch" this tree to a new spot
            if (clock.elapsedTime > data.nextUpdate) {
                setNewPosition(i);
                data.nextUpdate = clock.elapsedTime + 5 + Math.random() * 5; // Update every 5-10 seconds
            }

            DUMMY.position.copy(data.position);
            DUMMY.scale.setScalar(data.scale);
            DUMMY.updateMatrix();
            meshRef.current.setMatrixAt(i, DUMMY.matrix);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined as any, undefined as any, COUNT]}>
            <group>
                {/* Trunk */}
                <mesh position={[0, 0.2, 0]}>
                    <cylinderGeometry args={[0.1, 0.15, 0.4, 8]} />
                    <meshStandardMaterial color="#6e5037" />
                </mesh>
                {/* Foliage */}
                <mesh position={[0, 0.6, 0]}>
                    <icosahedronGeometry args={[0.5, 1]} />
                    <meshStandardMaterial color="#4f8c4e" flatShading />
                </mesh>
            </group>
        </instancedMesh>
    );
}