/// <reference types="node" />

import { parentPort } from 'worker_threads';

class ApiKeyProvider {
  private pendingRequests = new Map<string, (key: string | null) => void>();
  private requestTimeouts = new Map<string, NodeJS.Timeout>();
  private MAX_WAIT_TIME = 60000; // 60 seconds max wait time

  public handleMessage(message: { type: string; payload: any }) {
    if (message.type === 'apiKeyResponse') {
      const { key, requestId } = message.payload;
      const resolve = this.pendingRequests.get(requestId);
      
      // Clear any timeout for this request
      if (this.requestTimeouts.has(requestId)) {
        clearTimeout(this.requestTimeouts.get(requestId)!);
        this.requestTimeouts.delete(requestId);
      }
      
      if (resolve) {
        // If key is null and all keys are on cooldown, we need to wait and retry
        if (key === null && message.payload.allKeysOnCooldown) {
          console.log(`[ApiKeyProvider] All keys on cooldown. Will retry in 5 seconds.`);
          // Schedule a retry after 5 seconds
          setTimeout(() => {
            console.log(`[ApiKeyProvider] Retrying request for API key for agent ${message.payload.agentId}`);
            parentPort?.postMessage({ 
              type: 'requestApiKey', 
              payload: { agentId: message.payload.agentId, requestId } 
            });
          }, 5000);
        } else {
          // Otherwise resolve with whatever key we got (or null)
          resolve(key);
          this.pendingRequests.delete(requestId);
        }
      }
    }
  }

  public async getKeyForAgent(agentId: string): Promise<string | null> {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    return new Promise((resolve) => {
      // Set a timeout to prevent indefinite waiting
      // FIX: Use `global.setTimeout` to resolve type conflict between Node.js (returns NodeJS.Timeout) and browser (returns number) environments.
      // DEV-FIX: Cast to 'any' to work around a broken type environment where `global.setTimeout` still resolves to a `number`.
      // FIX: Cast `setTimeout` return value to `any` to resolve type conflict between Node.js (`NodeJS.Timeout`) and browser (`number`) environments, which was causing a type error in a misconfigured TypeScript environment.
      const timeout = global.setTimeout(() => {
        console.warn(`[ApiKeyProvider] Request for API key timed out after ${this.MAX_WAIT_TIME/1000}s`);
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          resolve(null); // Resolve with null after timeout
        }
      }, this.MAX_WAIT_TIME) as any;
      
      this.requestTimeouts.set(requestId, timeout);
      this.pendingRequests.set(requestId, resolve);
      
      // Send the request to the main thread
      parentPort?.postMessage({ 
        type: 'requestApiKey', 
        payload: { agentId, requestId } 
      });
    });
  }

  public reportRateLimit(key: string, durationSeconds: number) {
    if (!parentPort) return;
    parentPort.postMessage({ 
      type: 'reportRateLimit', 
      payload: { key, durationSeconds } 
    });
  }
  
  public async areAllKeysOnCooldown(): Promise<boolean> {
    // Generate a unique request ID for this check
    const requestId = `check-cooldown-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    return new Promise<boolean>((resolve) => {
      if (!parentPort) {
        resolve(false);
        return;
      }
      
      // Send a special request to check if all keys are on cooldown
      parentPort.postMessage({
        type: 'checkAllKeysCooldown',
        payload: { requestId }
      });
      
      // Set up a handler for the response
      const responseHandler = (message: any) => {
        if (message.type === 'allKeysCooldownResponse' && message.payload.requestId === requestId) {
          // Remove this listener once we get our response
          parentPort?.removeListener('message', responseHandler);
          resolve(message.payload.allKeysOnCooldown);
        }
      };
      
      // Add the temporary listener
      parentPort.on('message', responseHandler);
      
      // Set a timeout to avoid hanging indefinitely
      // FIX: Use `global.setTimeout` to resolve type conflict between Node.js (returns NodeJS.Timeout) and browser (returns number) environments.
      global.setTimeout(() => {
        parentPort?.removeListener('message', responseHandler);
        console.log(`[ApiKeyProvider] Timeout waiting for cooldown check response. Assuming not all keys are on cooldown.`);
        resolve(false);
      }, 3000);
    });
  }
}

export const apiKeyProvider = new ApiKeyProvider();