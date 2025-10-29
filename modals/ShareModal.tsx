import { useState, useRef } from 'react';
import Modal from '../Modal';
// FIX: Fix import for `useUI` and `ShareModalData` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useUI, ShareModalData } from '../../lib/state/index.js';
import { toPng } from 'html-to-image';
import { VrmModel } from '../agents/VrmAvatar';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import styles from './Modals.module.css';

export default function ShareModal({ data }: { data: ShareModalData }) {
    // FIX: Destructure rank and score, which are optional.
    const { agent, rank, score } = data;
    const { closeShareModal } = useUI();
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const imageContentRef = useRef<HTMLDivElement>(null);

    // FIX: Add a guard to ensure this modal only renders for leaderboard data.
    // Room sharing is handled by a different modal.
    if (typeof rank === 'undefined' || typeof score === 'undefined') {
        return null;
    }

    const tweetText = `My agent, ${agent.name}, is rank #${rank} in the #QuantsCafe Leaderboard with a score of ${score.toLocaleString()}! Come join the SocialFi simulation.`;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

    const handleGenerateImage = async () => {
        if (!imageContentRef.current) return;
        setIsGenerating(true);
        try {
            const dataUrl = await toPng(imageContentRef.current, { 
                cacheBust: true, 
                pixelRatio: 2,
                // Wait for images inside the canvas to load
                fetchRequestInit: { mode: 'cors' },
            });
            setGeneratedImage(dataUrl);
        } catch (error) {
            console.error('Failed to generate share image', error);
            alert('Could not generate image. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Modal onClose={closeShareModal}>
            <div className={`${styles.modalContentPane} ${styles.shareModal}`}>
                <div className={styles.modalHeader}>
                    <h2>Share Performance</h2>
                </div>

                {generatedImage ? (
                    <div className={styles.generatedImageView}>
                        <img src={generatedImage} alt={`Share card for ${agent.name}`} />
                        <div className={styles.shareActions}>
                            <a href={generatedImage} download={`${agent.name}-leaderboard.png`} className="button">
                                <span className="icon">download</span> Download
                            </a>
                            <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="button primary">
                                <span className="icon">chat</span> Tweet
                            </a>
                        </div>
                        <p className={styles.shareInstructions}>
                            Download the image and attach it to your tweet!
                        </p>
                    </div>
                ) : (
                    <>
                        <div id="share-image-content" ref={imageContentRef} className={styles.shareImageContainer}>
                            <div className={styles.shareVrmContainer}>
                                <Canvas
                                    camera={{ position: [0, 1.0, 2.5], fov: 45 }}
                                    gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
                                    shadows
                                >
                                    <ambientLight intensity={1.5} />
                                    <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
                                    <group position={[0.2, 0, 0]} rotation={[0, agent.modelUrl?.includes('war_boudica') ? 0 : Math.PI, 0]}>
                                        <VrmModel modelUrl={agent.modelUrl || ''} isSpeaking={false} />
                                    </group>
                                </Canvas>
                            </div>
                            <div className={styles.shareInfoOverlay}>
                                <div className={styles.shareAgentName}>{agent.name}</div>
                                <div className={styles.shareRank}>#{rank}</div>
                                <div className={styles.shareScore}>{score.toLocaleString()} Score</div>
                                <div className={styles.shareFooter}>
                                    <span className="icon">coffee</span> Quants Café
                                </div>
                            </div>
                        </div>

                        <button className="button primary" onClick={handleGenerateImage} disabled={isGenerating} style={{ justifyContent: 'center', width: '100%', marginTop: '16px' }}>
                            <span className="icon">photo_camera</span>
                            {isGenerating ? 'Generating...' : 'Generate Share Image'}
                        </button>
                    </>
                )}
            </div>
        </Modal>
    );
}