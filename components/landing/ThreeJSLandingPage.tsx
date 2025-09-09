/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import PixarScene from './PixarScene';
import styles from './Landing.module.css';
import * as THREE from 'three';
import { useUI } from '../../lib/state';
import TokenModal from './TokenModal';

const CameraRig = ({ scrollProgress }: { scrollProgress: React.MutableRefObject<number> }) => {
  const { camera, mouse } = useThree();
  const vec = new THREE.Vector3();

  // Implements the parallax effect and the cinematic zoom
  return useFrame(() => {
    const parallaxX = mouse.x * 1.2; 
    const parallaxY = 0.2 + (mouse.y * 1.2);
    
    // Zoom is now controlled by the scroll progress
    const zoomZ = 4.8 - scrollProgress.current * 10;
    
    camera.position.lerp(vec.set(parallaxX, parallaxY, zoomZ), 0.05);
    camera.lookAt(0, 0.4, 0); 
  });
};


/**
 * The main landing page component. It now wraps the visually rich PixarScene
 * and provides the user interface for signing in.
 */
export default function ThreeJSLandingPage({
  onSignIn,
}: {
  onSignIn: (handle: string) => void;
}) {
  const [handle, setHandle] = useState('');
  const { openAboutPage } = useUI();
  const [showTokenModal, setShowTokenModal] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const scrollProgress = useRef(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (handle.trim()) {
      onSignIn(handle);
    }
  };

  // Full-page parallax for HTML content
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (heroRef.current) {
        const { clientX, clientY } = event;
        const { innerWidth, innerHeight } = window;
        const xOffset = (clientX - innerWidth / 2) / innerWidth;
        const yOffset = (clientY - innerHeight / 2) / innerHeight;
        
        const scale = 1 + scrollProgress.current * 0.2;
        heroRef.current.style.transform = `translate(${xOffset * -60}px, ${yOffset * -45}px) scale(${scale})`;
        heroRef.current.style.opacity = `${1 - scrollProgress.current * 1.5}`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Cinematic zoom on scroll
    const handleWheel = (event: WheelEvent) => {
        const delta = event.deltaY > 0 ? 0.02 : -0.02;
        scrollProgress.current = Math.max(0, Math.min(1, scrollProgress.current + delta));
    };
    window.addEventListener('wheel', handleWheel);

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('wheel', handleWheel);
    }
  }, []);

  return (
    <div className={styles.landingPageContainer}>
      <div className={styles.topNav}>
        <button type="button" onClick={openAboutPage} className={styles.aboutLink}>
            <span className="icon">coffee</span>
            What is this?
        </button>
        <button type="button" onClick={() => setShowTokenModal(true)} className={styles.tokenButton}>
            A1B...pump
        </button>
      </div>


      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.2, 4.8], fov: 50 }}
        className={styles.landingCanvas}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}
      >
        <Suspense fallback={null}>
          <PixarScene />
          <CameraRig scrollProgress={scrollProgress} />
          <OrbitControls 
            enableZoom={false} // Disable default zoom, we use custom scroll
            enablePan={false}
            minPolarAngle={Math.PI / 2.8}
            maxPolarAngle={Math.PI / 1.8}
          />
        </Suspense>
      </Canvas>
      <div className={styles.heroContainer} ref={heroRef}>
        <h1 className={styles.shadowText}>Quants Café</h1>
        <p className={styles.landingSubtitle}>
          The virtual AI simulator meta. Unleash your agents in a live SocialFi arena, trade meme intel, and hunt for alpha.
        </p>
        <form onSubmit={handleSubmit} className={styles.landingForm}>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className={styles.landingInput}
            placeholder="Enter your handle to begin"
            aria-label="Enter your handle"
          />
          <button type="submit" className={styles.landingButton} disabled={!handle.trim()}>
            Enter the Café
          </button>
        </form>
      </div>
      
      {showTokenModal && <TokenModal onClose={() => setShowTokenModal(false)} />}
    </div>
  );
}