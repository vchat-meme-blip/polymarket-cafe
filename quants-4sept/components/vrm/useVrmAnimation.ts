import { useEffect } from 'react';

// ...existing imports and code...

const YourComponent = ({ renderer }) => {
	useEffect(() => {
		// Assume renderer is available from your Three.js setup
		// If not, replace "renderer" with your actual renderer instance
		const canvas = renderer.domElement;
		
		const onContextLost = (event: Event) => {
			event.preventDefault();
			console.error('WebGL context lost');
			// Optionally, trigger a context restore or UI update here
		};

		canvas.addEventListener('webglcontextlost', onContextLost);
		return () => {
			canvas.removeEventListener('webglcontextlost', onContextLost);
		};
	}, [renderer]);

	// ...existing code...
};

export default YourComponent;