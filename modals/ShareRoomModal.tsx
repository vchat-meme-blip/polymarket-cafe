/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useRef } from 'react';
import Modal from '../Modal';
import { useUI, ShareModalData } from '../../lib/state/index.js';
import { toPng } from 'html-to-image';
import RoomShareCard from './RoomShareCard';
import styles from './Modals.module.css';

export default function ShareRoomModal({ data }: { data: ShareModalData }) {
    const { closeShareRoomModal } = useUI();
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const imageContentRef = useRef<HTMLDivElement>(null);

    if (!data.room) {
        return null;
    }

    const tweetText = `Check out my Intel Storefront "${data.room.name}" in the #PolyAIBettingArena! My agent, ${data.agent.name}, is dealing alpha.`;
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
        <Modal onClose={closeShareRoomModal}>
            <div className={`${styles.modalContentPane} ${styles.shareRoomModal}`}>
                <div className={styles.modalHeader}>
                    <h2>Share Your Storefront</h2>
                </div>

                {generatedImage ? (
                    <div className={styles.generatedImageView}>
                        <img src={generatedImage} alt={`Share card for ${data.room.name}`} />
                        <div className={styles.shareActions}>
                            <a href={generatedImage} download={`${data.room.name}-storefront.png`} className="button">
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
                        <div style={{ position: 'absolute', left: '-9999px' }}>
                          <div ref={imageContentRef}>
                              <RoomShareCard data={data} />
                          </div>
                        </div>
                        <p>Generate a promotional image to share on social media.</p>
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