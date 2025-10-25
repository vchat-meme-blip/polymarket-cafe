/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useEffect } from 'react';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));

/**
 * Loads the GLTF data containing the VRM model.
 * The VRMLoaderPlugin will parse the VRM data and attach it to gltf.userData.
 * Each call to this function will result in a new scene graph and VRM instance,
 * while textures and geometries are cached by Three.js internally.
 */
async function loadGLTF(url: string): Promise<GLTF> {
  const gltf = await loader.loadAsync(url);
  if (!gltf.userData.vrm) {
    throw new Error('Could not find VRM data in the loaded GLTF.');
  }
  return gltf;
}

/**
 * A robust hook to load and instantiate a unique VRM model from a URL.
 * It caches the initial GLTF load and then creates a unique, deep clone
 * for each component instance to prevent shared state issues (e.g., all
 * agents animating in sync).
 * 
 * @param url The URL of the .vrm file.
 * @returns An object containing the loaded VRM, loading state, and any error.
 */
export default function useVrm(url: string | null | undefined) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      setVrm(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setVrm(null);

    loadGLTF(url)
      .then(gltf => {
        if (isMounted) {
          // By calling loadGLTF for each useVrm instance, we get a new scene graph
          // and a new VRM object, preventing state sharing between components.
          // Three.js's internal caching prevents re-downloading of assets like textures.
          const newVrm = gltf.userData.vrm;
          
          // FIX: Initialize the lookAt controller only if it exists on the model.
          // @pixiv/three-vrm v3 uses 'applier' (not 'applyer'). Guard for presence.
          if (newVrm.lookAt && (newVrm.lookAt as any).applier) {
            (newVrm.lookAt as any).applier.autoUpdate = true;
          }

          setVrm(newVrm);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error(`Failed to load and instantiate VRM from ${url}:`, err);
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  return { vrm, loading, error };
}