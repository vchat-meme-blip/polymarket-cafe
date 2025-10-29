/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { ShareModalData } from '../../lib/state/index.js';
import { Canvas } from '@react-three/fiber';
import { VrmModel } from '../agents/VrmAvatar';
import styles from './Modals.module.css';

export default function RoomShareCard({ data }: { data: ShareModalData }) {
    const { agent, room } = data;

    if (!room) {
        return null;
    }

    return (
        <div className={styles.shareCardContainer}>
            <div className={styles.shareCardCanvas}>
                <Canvas
                    camera={{ position: [0, 1.0, 2.5], fov: 45 }}
                    gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
                    shadows
                >
                    <ambientLight intensity={1.5} />
                    <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
                    <group position={[0.2, 0, 0]} rotation={[0, agent.modelUrl?.includes('war_boudica') ? 0 : Math.PI, 0]}>
                        <VrmModel 
                            modelUrl={agent.modelUrl || ''} 
                            isSpeaking={false} 
                            disableAutoGrounding={true} 
                            verticalOffset={-0.8} 
                        />
                    </group>
                </Canvas>
            </div>
            <div className={styles.shareCardInfo}>
                <h3 className={styles.shareCardRoomName}>{room.name}</h3>
                <p className={styles.shareCardBio}>"{room.roomBio}"</p>
                {agent.operatingHours && (
                    <p className={styles.shareCardHours}>Open: {agent.operatingHours}</p>
                )}
                <div className={styles.shareCardFooter}>
                    <span className="icon">coffee</span> PolyAI Betting Arena
                </div>
            </div>
        </div>
    );
}