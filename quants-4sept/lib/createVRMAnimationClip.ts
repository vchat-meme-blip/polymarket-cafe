import { VRMLookAtQuaternionProxy } from 'three/examples/jsm/vrm/VRMLookAtQuaternionProxy.js';
import { ShaderMaterial } from 'three';

// NEW: Manually create a proxy to suppress the warning
export const myVRMLookAtQuaternionProxy = new VRMLookAtQuaternionProxy();

// REVISED: Consolidated patch for ShaderMaterial to fix shader errors
const originalOnBeforeCompile = ShaderMaterial.prototype.onBeforeCompile;
ShaderMaterial.prototype.onBeforeCompile = function (shader, renderer) {
	// Always check for the problematic getShadow call in Outline materials
	if (this.name.includes('Outline')) {
		// Ensure vSpotShadowCoord is declared. This is critical.
		if (!shader.fragmentShader.includes('varying vec4 vSpotShadowCoord;')) {
			shader.fragmentShader = 'varying vec4 vSpotShadowCoord;\n' + shader.fragmentShader;
		}

		// Replace the incorrect getShadow call with the correct one, adding shadowIntensity.
		// This regex is more general to catch variations.
		shader.fragmentShader = shader.fragmentShader.replace(
			/getShadow\(([^,]+,){3}[^,]+, vSpotShadowCoord\[\s*0\s*\]\s*\)/g,
			'getShadow( spotShadowMap[ 0 ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotShadowCoord[ 0 ] )'
		);
	} 
	// For non-outline face materials, disable shadows to prevent other errors.
	else if (this.name.includes('FaceBrow') || this.name.includes('FACE')) {
		shader.fragmentShader = shader.fragmentShader.replace(/getShadow\([^)]+\)/g, '1.0');
	}

	if (originalOnBeforeCompile) {
		originalOnBeforeCompile.call(this, shader, renderer);
	}
};

// ...existing code where createVRMAnimationClip uses the proxy...
// For example:
// function createVRMAnimationClip(params) {
//     const lookAtProxy = myVRMLookAtQuaternionProxy;
//     // ...existing code...
// }