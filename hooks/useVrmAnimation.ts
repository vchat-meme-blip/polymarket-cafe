/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

const loader = new GLTFLoader();
loader.register(parser => new VRMAnimationLoaderPlugin(parser));

const animationCache = new Map<string, Promise<any>>();

/**
 * Loads the GLTF that CONTAINS the VRM animation data.
 * @param url The URL of the .vrma file.
 */
async function loadAnimationGltf(url: string): Promise<any> {
    const gltf = await loader.loadAsync(url);
    const vrmAnimation = gltf.userData.vrmAnimations?.[0];
    if (!vrmAnimation) {
      throw new Error(`VRM animation data not found in ${url}`);
    }
    return vrmAnimation;
}

/**
 * A hook to load a VRM animation (.vrma) and create a THREE.AnimationClip from it.
 * This hook depends on a pre-loaded VRM model.
 *
 * @param url The URL of the .vrma animation file.
 * @param vrm The VRM model to which the animation will be applied.
 * @returns A THREE.AnimationClip or null if the animation is not yet loaded or fails to load.
 */
export default function useVrmAnimation(url: string | null, vrm: VRM | null) {
  const [clip, setClip] = useState<THREE.AnimationClip | null>(null);

  useEffect(() => {
    if (!url || !vrm) {
      setClip(null);
      return;
    }

    let isMounted = true;

    if (!animationCache.has(url)) {
      animationCache.set(url, loadAnimationGltf(url));
    }

    animationCache.get(url)!
      .then(vrmAnimation => {
        if (isMounted && vrm) {
          // Create a new animation clip specifically for this VRM instance
          const loadedClip = createVRMAnimationClip(vrmAnimation, vrm);
          setClip(loadedClip);
        }
      })
      .catch(err => {
        console.error(`Failed to load VRM animation from ${url}:`, err);
        animationCache.delete(url); // Remove from cache on error
      });

    return () => {
      isMounted = false;
    };
  }, [url, vrm]);

  return clip;
}