/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import '@react-three/fiber';
import React, { useEffect, useRef, Suspense } from 'react';
import { Canvas as ThreeCanvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useProgress, Html } from '@react-three/drei';
import './VrmAvatar.css';
import * as THREE from 'three';
import useVrm from '../../hooks/useVrm';
import useVrmAnimation from '../../hooks/useVrmAnimation';
// WebGL context manager will be defined inline since we can't access the file system

type VrmPlaceholderProps = {
  status: 'loading' | 'error';
  error?: Error | null;
};

export function VrmPlaceholder({ status, error }: VrmPlaceholderProps) {
    const { progress } = useProgress();
    const isError = status === 'error';
    const errorMessage = error?.message || 'Could not load model.';
    
    return (
        <Html center>
            <div className="vrm-placeholder" aria-label={isError ? "Error loading 3D model" : "Loading 3D model"}>
                <span className="icon">{isError ? 'broken_image' : 'downloading'}</span>
                <p>{isError ? `Model Error: ${errorMessage}` : `Loading... ${progress.toFixed(0)}%`}</p>
            </div>
        </Html>
    );
}

type VrmModelProps = {
  modelUrl: string;
  animationUrl?: string; // kept for backward compatibility (used as idleUrl)
  idleUrl?: string; // preferred idle animation URL, defaults to /animations/idle2.vrma
  triggerAnimationUrl?: string; // optional one-shot animation to play on demand
  talkAnimationUrl?: string; // optional animation to play while speaking
  triggerKey?: number; // bump this value to retrigger the one-shot animation
  isSpeaking?: boolean;
  lookAtTarget?: THREE.Object3D | null;
  darkenFace?: boolean | number; // when true, dim face/skin materials a bit
  disableAutoGrounding?: boolean; // when true, skip the auto-grounding step that can cause position shifting
  verticalOffset?: number; // optional vertical offset to apply after auto-grounding
};

export function VrmModel({ modelUrl, animationUrl, idleUrl, triggerAnimationUrl, talkAnimationUrl, triggerKey, isSpeaking, lookAtTarget, darkenFace, disableAutoGrounding, verticalOffset = 0 }: VrmModelProps) {
  const { vrm, loading, error } = useVrm(modelUrl);
  const idleAnimation = useVrmAnimation(idleUrl || animationUrl || '/animations/idle2.vrma', vrm);
    const talkAnimation = useVrmAnimation(talkAnimationUrl || '/animations/talk.vrma', vrm);
  const oneShotAnimation = useVrmAnimation(triggerAnimationUrl || '', vrm);

  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef<{ [key: string]: THREE.AnimationAction | null }>({});
  const finishedHandlerRef = useRef<((e: any) => void) | null>(null);

  useEffect(() => {
    if (vrm && vrm.scene) {
      const animationMixer = new THREE.AnimationMixer(vrm.scene);
      mixer.current = animationMixer;

      if(idleAnimation) {
        actions.current.idle = animationMixer.clipAction(idleAnimation);
        actions.current.idle.play();
      }
      if(talkAnimation) {
        actions.current.talk = animationMixer.clipAction(talkAnimation);
      }
    }
    return () => {
      if (mixer.current) {
        // @ts-ignore
        mixer.current.stopAllAction();
      }
      mixer.current = null;
    }
  }, [vrm, idleAnimation, talkAnimation]);


  // Play one-shot animation when triggerKey changes
  useEffect(() => {
    if (!vrm || !mixer.current || !actions.current.idle) return;
    if (!oneShotAnimation) return;
    if (triggerKey === undefined || triggerKey === null || triggerKey === 0) return;

    const idle = actions.current.idle!;
    const act = mixer.current.clipAction(oneShotAnimation);
    
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    (act as any).clampWhenFinished = true;
    
    act.play();
    idle.crossFadeTo(act, 0.3, true);
    
    const handler = (e: any) => {
      if (e.action !== act) return;
      idle.enabled = true;
      act.crossFadeTo(idle, 0.3, true);
       if (finishedHandlerRef.current) {
        mixer.current?.removeEventListener('finished', finishedHandlerRef.current as any);
      }
    };
    
    if (finishedHandlerRef.current) {
      mixer.current?.removeEventListener('finished', finishedHandlerRef.current as any);
    }
    finishedHandlerRef.current = handler;
    mixer.current.addEventListener('finished', handler as any);

    return () => {
      if (finishedHandlerRef.current) {
        mixer.current?.removeEventListener('finished', finishedHandlerRef.current as any);
      }
    };
  }, [triggerKey, oneShotAnimation, vrm]);

  // Optionally darken face/skin materials for this avatar instance only
  useEffect(() => {
    if (!vrm || !darkenFace) return;
    
    const tintValue = typeof darkenFace === 'number' ? darkenFace : 0.3;

    vrm.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      // Match on common face/skin identifiers in node or material names
      const name = (obj.name || '').toLowerCase();
      const mats: THREE.Material[] = [];
      if ((mesh as any).material) {
        const m = (mesh as any).material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) mats.push(...m); else mats.push(m);
      }
      const shouldTint = name.includes('face') || name.includes('head') || name.includes('skin');
      if (!shouldTint) {
        // Check material names too
        if (!mats.some((mt) => (mt as any)?.name && (mt as any).name.toLowerCase().match(/face|head|skin/))) return;
      }
      mats.forEach((mt) => {
        const std = mt as THREE.MeshStandardMaterial;
        if ((std as any).color) {
          // Multiply color to darken subtly
          std.color.multiplyScalar(tintValue);
          std.needsUpdate = true;
        }
      });
    });
  }, [vrm, darkenFace]);
  
  useEffect(() => {
    const idleAction = actions.current.idle;
    const talkAction = actions.current.talk;

    if (!idleAction || !talkAction) return;

    if (isSpeaking) {
      // Fade in the talk animation
      talkAction.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play();
      // Fade out the idle animation
      if (idleAction.isRunning()) {
        idleAction.fadeOut(0.3);
      }
    } else {
      // Fade in the idle animation
      idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play();
      // Fade out the talk animation
      if (talkAction.isRunning()) {
        talkAction.fadeOut(0.3);
      }
    }
  }, [isSpeaking, idleAnimation, talkAnimation]);

  const blinkState = useRef({ nextBlinkTime: 0, isBlinking: false });
  const lipSyncState = useRef({ time: 0 });
  const visemes = ['aa', 'ih', 'ou', 'ee', 'oh'];

  // Effect for robust auto-scaling and grounding.
  useEffect(() => {
    if (vrm?.scene) {
      const timeoutId = setTimeout(() => {
        if (!vrm.scene) return;

        // --- Sizing Pass ---
        const originalPosition = vrm.scene.position.clone();
        const originalRotation = vrm.scene.rotation.clone();
        const originalScale = vrm.scene.scale.clone();

        vrm.scene.position.set(0, 0, 0);
        vrm.scene.rotation.set(0, 0, 0);
        vrm.scene.scale.set(1, 1, 1);
        vrm.scene.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());

        vrm.scene.position.copy(originalPosition);
        vrm.scene.rotation.copy(originalRotation);
        vrm.scene.scale.copy(originalScale);

        const TARGET_HEIGHT = 1.75;
        const scale = size.y > 0.1 ? TARGET_HEIGHT / size.y : 1;
        vrm.scene.scale.setScalar(scale);

        // --- Grounding Pass ---
        if (!disableAutoGrounding) {
            // We MUST update the world matrix after scaling to get the new bounding box
            vrm.scene.updateMatrixWorld(true);
            const postScaleBox = new THREE.Box3().setFromObject(vrm.scene);
            
            if (!postScaleBox.isEmpty()) {
                // Apply standard grounding plus any additional vertical offset
                const groundOffset = -postScaleBox.min.y;
                vrm.scene.position.y = groundOffset + verticalOffset;
            } else {
                // Fallback if box is empty
                vrm.scene.position.y = verticalOffset;
            }
        } else if (verticalOffset) {
            vrm.scene.position.y += verticalOffset;
        }

      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [vrm, modelUrl, disableAutoGrounding, verticalOffset]);

  useFrame((state, delta) => {
    if (!vrm || !mixer.current) return;
    
    mixer.current.update(delta);
    
    if (vrm.lookAt) {
        if (lookAtTarget) {
            vrm.lookAt.target = lookAtTarget;
        } else {
            vrm.lookAt.target = undefined;
        }
    }

    const expressionManager = vrm.expressionManager;
    if (expressionManager) {
      if (isSpeaking) {
        lipSyncState.current.time += delta;
        const osc = 0.5 + 0.5 * Math.sin(lipSyncState.current.time * 20);
        const currentVisemeIndex = Math.floor(lipSyncState.current.time * 15) % visemes.length;
        const currentViseme = visemes[currentVisemeIndex];

        visemes.forEach((preset) => {
          if (expressionManager.getExpression(preset)) {
            const weight = preset === currentViseme ? osc * 0.8 : 0;
            expressionManager.setValue(preset, THREE.MathUtils.lerp(expressionManager.getValue(preset) ?? 0, weight, 0.5));
          }
        });
      } else {
        visemes.forEach(preset => {
          if (expressionManager.getExpression(preset)) {
            expressionManager.setValue(preset, THREE.MathUtils.lerp(expressionManager.getValue(preset) ?? 0, 0, 0.2));
          }
        });

        if (state.clock.elapsedTime >= blinkState.current.nextBlinkTime) {
           blinkState.current.isBlinking = true;
           blinkState.current.nextBlinkTime = state.clock.elapsedTime + Math.random() * 4 + 2;
        }
        
        if (blinkState.current.isBlinking) {
           const blinkProgress = (state.clock.elapsedTime - (blinkState.current.nextBlinkTime - 0.2)) / 0.2;
           const blinkValue = Math.sin(blinkProgress * Math.PI);
           if (blinkProgress <= 1 && expressionManager.getExpression('blink')) {
              expressionManager.setValue('blink', blinkValue);
           } else {
              blinkState.current.isBlinking = false;
              if(expressionManager.getExpression('blink')) expressionManager.setValue('blink', 0);
           }
        }
      }
    }
    vrm.update(delta);
  });

  if (loading) return <VrmPlaceholder status="loading" />;
  if (error || !vrm) return <VrmPlaceholder status="error" error={error} />;

  return <primitive object={vrm.scene} />;
}

type VrmAvatarCanvasProps = {
  modelUrl: string;
  isSpeaking: boolean;
  scale?: number; // Optional scale factor for the model
  verticalOffset?: number; // Optional vertical offset for the model
};

// Simple WebGL context handler component
const WebGLContextHandler = () => {
  const { gl } = useThree();
  const contextLostRef = useRef(false);
  
  useEffect(() => {
    const canvas = gl.domElement;
    
    const handleContextLost = (event: Event) => {
      console.warn('WebGL context lost, attempting to recover...');
      event.preventDefault();
      contextLostRef.current = true;
    };
    
    const handleContextRestored = () => {
      console.log('WebGL context restored');
      contextLostRef.current = false;
      // Force a re-render to recover the scene
      gl.forceContextRestore();
    };
    
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
    
    // Check for context loss periodically
    const checkContext = () => {
      if (contextLostRef.current) {
        console.log('Attempting to restore WebGL context...');
        const extension = gl.getContextAttributes()?.loseContext;
        if (extension) {
          extension.restoreContext();
        }
      }
    };
    
    const interval = setInterval(checkContext, 1000);
    
    return () => {
      clearInterval(interval);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl]);
  
  return null;
};

// Enhanced Canvas component with WebGL context management
export function VrmAvatarCanvas({ modelUrl, isSpeaking, scale = 1, verticalOffset = 0 }: VrmAvatarCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const cameraZ = scale > 1 ? 3.5 : 2.5;
  const cameraY = scale > 1 ? 1.2 : 0.8;
  
  // Handle component unmount
  useEffect(() => {
    return () => {
      // Clean up WebGL resources when component unmounts
      if (canvasRef.current) {
        const canvas = canvasRef.current.querySelector('canvas');
        if (canvas) {
          // Get WebGL context with proper type assertion
          const gl = (
            canvas.getContext('webgl') || 
            canvas.getContext('experimental-webgl')
          ) as WebGLRenderingContext | null;
          
          if (gl) {
            try {
              // Force context loss to release resources
              const extension = gl.getExtension('WEBGL_lose_context');
              if (extension) {
                extension.loseContext();
              }
            } catch (error) {
              console.warn('Error while trying to lose WebGL context:', error);
            }
          }
        }
      }
    };
  }, []);
  
  return (
    <div 
      ref={canvasRef}
      className="vrm-avatar-canvas" 
      style={{ 
        width: '100%', 
        height: '100%', 
        minHeight: '600px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <ThreeCanvas
        camera={{ position: [0, cameraY, cameraZ], fov: 45, near: 0.1, far: 1000 }}
        gl={{
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
          premultipliedAlpha: false,
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: false,
          antialias: false, // Disable antialiasing for better performance
        }}
        dpr={Math.min(window.devicePixelRatio, 2)} // Limit DPR for performance
        onCreated={({ gl }) => {
          // Optimize WebGL context
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          // @ts-ignore - shadowMap might not exist on all renderers
          if (gl.shadowMap) gl.shadowMap.enabled = false;
          // @ts-ignore - These properties might not exist on all renderers
          if (gl.autoClear !== undefined) gl.autoClear = true;
          // @ts-ignore
          if (gl.autoClearColor !== undefined) gl.autoClearColor = true;
          // @ts-ignore
          if (gl.autoClearDepth !== undefined) gl.autoClearDepth = true;
          // @ts-ignore
          if (gl.autoClearStencil !== undefined) gl.autoClearStencil = true;
        }}
      >
<WebGLContextHandler />
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 2]} intensity={2} castShadow />
        <group position={[0, -0.875, 0]} rotation={[0, modelUrl.includes('war_boudica') ? 0 : Math.PI, 0]} scale={scale}>
          <Suspense fallback={<VrmPlaceholder status="loading" />}>
            <VrmModel 
              modelUrl={modelUrl} 
              isSpeaking={isSpeaking} 
              verticalOffset={verticalOffset} 
            />
          </Suspense>
        </group>
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          target={[0, cameraY, 0]}
          minDistance={1.5}
          maxDistance={5.0}
        />
      </ThreeCanvas>
    </div>
  );
}