/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { createContext, useContext, ReactNode } from 'react';

// FIX: Expanded the context type to include properties used by components,
// resolving type errors where components were consuming a more complete context
// than this mock was providing.
// Define a mock client class to avoid adding new imports.
class MockGenAIClient {
    on(event: string, fn: (...args: any[]) => void): this { return this; }
    off(event: string, fn: (...args: any[]) => void): this { return this; }
}

// Define the shape of the context data
interface LiveAPIContextType {
  volume: number;
  disconnect: () => void;
  client: MockGenAIClient;
  connected: boolean;
  connect: () => Promise<void>;
  setConfig: (config: any) => void;
  config: any;
}

// Create the context with a default value that won't crash the app
const LiveAPIContext = createContext<LiveAPIContextType>({
  volume: 0,
  disconnect: () => console.warn('disconnect called on default LiveAPIContext'),
  client: new MockGenAIClient(),
  connected: false,
  connect: async () => console.warn('connect called on default LiveAPIContext'),
  setConfig: (config: any) => console.warn('setConfig called on default LiveAPIContext'),
  config: {},
});

// Create a provider component. Although not used currently, it's good practice.
export const LiveAPIProvider = ({ children }: { children: ReactNode }) => {
  const value: LiveAPIContextType = {
    volume: 0, // Mock value
    disconnect: () => { console.log('LiveAPI disconnected.'); }, // Mock function
    client: new MockGenAIClient(),
    connected: false,
    connect: async () => { console.log('LiveAPI connected.'); },
    setConfig: (config: any) => { console.log('LiveAPI config set.'); },
    config: {},
  };

  return (
    <LiveAPIContext.Provider value={value}>
      {children}
    </LiveAPIContext.Provider>
  );
};

// Create a custom hook for easy access to the context
export const useLiveAPIContext = () => {
  return useContext(LiveAPIContext);
};
