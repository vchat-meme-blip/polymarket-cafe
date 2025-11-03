import { WebGLRenderer } from 'three';

export class WebGLContextManager {
  private static instance: WebGLContextManager;
  private renderer: WebGLRenderer | null = null;
  private contextLostHandlers: Set<(event: Event) => void> = new Set();
  private contextRestoredHandlers: Set<() => void> = new Set();

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): WebGLContextManager {
    if (!WebGLContextManager.instance) {
      WebGLContextManager.instance = new WebGLContextManager();
    }
    return WebGLContextManager.instance;
  }

  public initialize(renderer: WebGLRenderer): void {
    if (this.renderer) {
      this.cleanup();
    }

    this.renderer = renderer;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.renderer) return;

    const canvas = this.renderer.domElement;
    
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost, attempting to restore...');
      this.contextLostHandlers.forEach(handler => handler(event));
    };

    const handleContextRestored = () => {
      console.log('WebGL context restored');
      this.contextRestoredHandlers.forEach(handler => handler());
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Store references for cleanup
    (canvas as any)._contextLostHandler = handleContextLost;
    (canvas as any)._contextRestoredHandler = handleContextRestored;
  }

  public onContextLost(handler: (event: Event) => void): () => void {
    this.contextLostHandlers.add(handler);
    return () => this.contextLostHandlers.delete(handler);
  }

  public onContextRestored(handler: () => void): () => void {
    this.contextRestoredHandlers.add(handler);
    return () => this.contextRestoredHandlers.delete(handler);
  }

  public cleanup(): void {
    if (!this.renderer) return;

    const canvas = this.renderer.domElement;
    
    if ((canvas as any)._contextLostHandler) {
      canvas.removeEventListener('webglcontextlost', (canvas as any)._contextLostHandler);
      delete (canvas as any)._contextLostHandler;
    }
    
    if ((canvas as any)._contextRestoredHandler) {
      canvas.removeEventListener('webglcontextrestored', (canvas as any)._contextRestoredHandler);
      delete (canvas as any)._contextRestoredHandler;
    }

    this.contextLostHandlers.clear();
    this.contextRestoredHandlers.clear();
    this.renderer = null;
  }

  public dispose(): void {
    this.cleanup();
    WebGLContextManager.instance = null as any;
  }
}

export const webGLContextManager = WebGLContextManager.getInstance();
