
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Analyser } from '../core/analyser.js';
import { vs as sphereVS } from '../shaders/sphere-shader.js';
import { fs as backdropFS, vs as backdropVS } from '../shaders/backdrop-shader.js';

interface Sphere3DProps {
  inputNode: GainNode | null;
  outputNode: GainNode | null;
}

const Sphere3D: React.FC<Sphere3DProps> = ({ inputNode, outputNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isInitialized = useRef(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    // Proceed with initialization even if audio nodes are not yet ready.
    // We'll use dummy analysers until real nodes arrive.
    if (isInitialized.current || !canvasRef.current) {
        return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch (e: any) {
      console.error("Failed to initialize WebGLRenderer:", e);
      setWebglError("Could not initialize 3D graphics. Please ensure hardware acceleration is enabled and your browser is up to date.");
      return;
    }
    
    isInitialized.current = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: { value: new THREE.Vector2(1, 1) },
          rand: { value: 0 },
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      })
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(2, -2, 5);
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new THREE.IcosahedronGeometry(1, 10);
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x000010, metalness: 0.5, roughness: 0.1, emissive: 0x000010, emissiveIntensity: 1.5,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.inputData = { value: new THREE.Vector4() };
      shader.uniforms.outputData = { value: new THREE.Vector4() };
      sphereMaterial.userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    // Start visible; if EXR fails, ambient light will keep it visible.
    sphere.visible = true;

    // Add gentle ambient light so sphere isn't black without envMap
    const ambient = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambient);

    new EXRLoader().load('/piz_compressed.exr', (texture: THREE.Texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        sphereMaterial.envMap = pmremGenerator.fromEquirectangular(texture).texture;
        sphereMaterial.needsUpdate = true;
        sphere.visible = true;
        texture.dispose();
    }, undefined, () => {
      console.error('Failed to load EXR texture from /piz_compressed.exr. Using ambient lighting fallback.');
      sphere.visible = true;
    });

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 5, 0.5, 0);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // Use real analysers if nodes exist; otherwise dummy analysers with zero data
    const makeDummyAnalyser = () => ({ data: new Uint8Array([0,0,0]), update: () => {} });
    const inputAnalyser: any = inputNode ? new Analyser(inputNode) : makeDummyAnalyser();
    const outputAnalyser: any = outputNode ? new Analyser(outputNode) : makeDummyAnalyser();

    let prevTime = performance.now();
    const rotation = new THREE.Vector3(0, 0, 0);

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      (backdrop.material as THREE.RawShaderMaterial).uniforms.resolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    };
    window.addEventListener('resize', onWindowResize);

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      inputAnalyser.update();
      outputAnalyser.update();

      const t = performance.now();
      const dt = (t - prevTime) / (1000 / 60);
      prevTime = t;

      (backdrop.material as THREE.RawShaderMaterial).uniforms.rand.value = Math.random() * 10000;

      if (sphereMaterial.userData.shader) {
        sphere.scale.setScalar(1 + (0.2 * outputAnalyser.data[1]) / 255);

        const f = 0.001;
        rotation.x += (dt * f * 0.5 * outputAnalyser.data[1]) / 255;
        rotation.z += (dt * f * 0.5 * inputAnalyser.data[1]) / 255;
        rotation.y += (dt * f * 0.25 * (inputAnalyser.data[2] + outputAnalyser.data[2])) / 255;
        
        camera.position.set(0, 0, 5).applyEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
        camera.lookAt(sphere.position);

        sphereMaterial.userData.shader.uniforms.time.value += (dt * 0.1 * outputAnalyser.data[0]) / 255;
        sphereMaterial.userData.shader.uniforms.inputData.value.set(
          (1 * inputAnalyser.data[0]) / 255, (0.1 * inputAnalyser.data[1]) / 255, (10 * inputAnalyser.data[2]) / 255, 0
        );
        sphereMaterial.userData.shader.uniforms.outputData.value.set(
          (2 * outputAnalyser.data[0]) / 255, (0.1 * outputAnalyser.data[1]) / 255, (10 * outputAnalyser.data[2]) / 255, 0
        );
      }
      composer.render();
    };
    animate();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      pmremGenerator.dispose();
      isInitialized.current = false;
    };
  }, [inputNode, outputNode]);

  return (
    <>
      {webglError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-dark-bg/80 p-4" role="alert">
              <div className="max-w-md p-6 bg-dark-status-bg rounded-lg border border-dark-border shadow-lg text-center">
                  <h3 className="text-lg font-bold text-primary-orange mb-2">Graphics Error</h3>
                  <p className="text-sm text-dark-text">{webglError}</p>
              </div>
          </div>
      )}
      <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full z-0 ${webglError ? 'hidden' : ''}`} />
    </>
  );
};

export default Sphere3D;
