/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import PixarScene from './PixarScene';
import styles from './Landing.module.css';
import * as THREE from 'three';
// FIX: Fix imports for `useUI` and `useUser` by changing the path from `../../lib/state` to `../../lib/state/index.js`.
import { useUI, useUser } from '../../lib/state/index.js';
import TokenModal from './TokenModal';
// FIX: Add .js extension for ES module compatibility.
import { apiService } from '../../lib/services/api.service.js';
import { debounce } from 'lodash';

const CameraRig = ({ scrollProgress }: { scrollProgress: React.MutableRefObject<number> }) => {
  const { camera, mouse } = useThree();
  const vec = new THREE.Vector3();
  const targetPosition = useRef(new THREE.Vector3(0, 1.5, 5)); // Higher and further back by default
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));

  // Camera with parallax effect for background
  return useFrame(() => {
    // Base camera position - slightly further back for better depth
    const basePosition = new THREE.Vector3(0, 0.4, 4.2);
    
    // Parallax effect - stronger for background, less for models
    const parallaxX = mouse.x * 0.5;
    const parallaxY = mouse.y * 0.2;
    
    // Apply smooth interpolation for camera movement
    camera.position.lerp(
      new THREE.Vector3(
        basePosition.x + parallaxX * 0.5,
        basePosition.y + parallaxY * 0.3,
        basePosition.z
      ),
      0.1
    );
    
    // Look at a point slightly above the models
    camera.lookAt(parallaxX * 0.2, 0.2 + parallaxY * 0.1, 0);
    
    // Add subtle auto-rotation for more dynamic feel
    const time = Date.now() * 0.0001;
    camera.position.x += Math.sin(time) * 0.1;
  });
};


/**
 * The main landing page component. It now wraps the visually rich PixarScene
 * and provides the user interface for signing in.
 */
interface ThreeJSLandingPageProps {
  onSignIn: (handle: string, isNewUser: boolean) => void | Promise<void>;
}

export default function ThreeJSLandingPage({ onSignIn }: ThreeJSLandingPageProps) {
  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const { openAboutPage } = useUI();
  const { connectWallet } = useUser();
  const [showTokenModal, setShowTokenModal] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const scrollProgress = useRef(0);

  // Debounced function to check handle availability
  const checkHandleAvailability = useCallback(debounce(async (h: string) => {
    if (h.length < 3) {
        setHandleStatus('idle');
        return;
    }
    setHandleStatus('checking');
    try {
        const { available } = await apiService.checkHandle(h);
        setHandleStatus(available ? 'available' : 'taken');
    } catch (error) {
        console.error("Failed to check handle", error);
        setHandleStatus('idle'); // Reset on error
    }
  }, 500), []);

  useEffect(() => {
    if (handle) {
      checkHandleAvailability(handle);
    }
  }, [handle, checkHandleAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedHandle = handle.trim();
    if (!trimmedHandle) return;
    
    try {
      // First check if the handle exists
      const { available, isNewUser } = await apiService.checkHandle(trimmedHandle);
      
      if (!available && !isNewUser) {
        // Handle exists, proceed with login (existing user)
        onSignIn(trimmedHandle, false);
      } else if (available || isNewUser) {
        // New handle, proceed with account creation
        onSignIn(trimmedHandle, true);
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("An error occurred while trying to log in. Please try again.");
    }
  };

  const handleRecover = async () => {
    try {
      const { success, address } = await connectWallet('4p4h2h1q8z2z8z8y8f8e8d8c8b8a898887868584'); // Simulated
      if (success && address) {
        const { handle: recoveredHandle } = await apiService.recoverByWallet(address);
        alert(`Welcome back! Your handle is: ${recoveredHandle}`);
        onSignIn(recoveredHandle, false); // Added false as second argument
      }
    } catch (error) {
      alert("Could not find an account associated with this wallet.");
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

  const getHandleFeedback = () => {
    switch (handleStatus) {
        case 'checking': return <span className={styles.handleFeedbackChecking}>Checking...</span>;
        case 'available': return <span className={styles.handleFeedbackAvailable}>Handle available!</span>;
        case 'taken': return <span className={styles.handleFeedbackTaken}>Handle is taken.</span>;
        default: return null;
    }
  };


  return (
    <div className={styles.landingPageContainer}>
      <div className={styles.topNav}>
        <button type="button" onClick={openAboutPage} className={styles.aboutLink}>
            <span className="icon">coffee</span>
            What is this?
        </button>
        <div style={{display: 'flex', gap: '16px'}}>
          <a href="/polycafe-pitchdeck.pdf" download="polycafe-pitchdeck.pdf" className={styles.aboutLink}>
              <span className="icon">rocket_launch</span>
              Pitch Deck
          </a>
          <button type="button" onClick={() => setShowTokenModal(true)} className={styles.tokenButton}>
              A1B...pump
          </button>
        </div>
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
        <h1 className={styles.shadowText}>Poly Cafe</h1>
        <div className={styles.landingSubtitle}>
          <span>Research and keep track of prediction markets with the help of AI companions.</span>
          <ul className={styles.featureList}>
            <li><span className="icon">travel_explore</span>Autonomous discovery</li>
            <li><span className="icon">share</span>Share intelligence</li>
            <li><span className="icon">monitoring</span>Monitor any market</li>
            <li><span className="icon">psychology</span>AI analysis and research</li>
            <li><span className="icon">notifications</span>Get alerts on your phone</li>
          </ul>
        </div>
        <form onSubmit={handleSubmit} className={styles.landingForm}>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className={styles.landingInput}
            placeholder="Enter your handle to begin"
            aria-label="Enter your handle"
          />
           <div className={styles.handleFeedbackContainer}>
              {getHandleFeedback()}
           </div>
          <button 
            type="submit" 
            className={styles.landingButton} 
            disabled={!handle.trim() || handleStatus === 'checking'}
          >
            {handleStatus === 'taken' ? 'Login' : 'Enter the Arena'}
          </button>
          <button type="button" className={styles.recoverButton} onClick={handleRecover}>
            Forgot your handle? Recover with Wallet
          </button>
        </form>
      </div>
      
      {showTokenModal && <TokenModal onClose={() => setShowTokenModal(false)} />}
    </div>
  );
}