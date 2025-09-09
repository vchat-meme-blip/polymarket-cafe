/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { createContext, useContext, ReactNode } from 'react';

// Define the shape of the context data
interface LiveAPIContextType {
  volume: number;
  disconnect: () => void;
}

// Create the context with a default value that won't crash the app
const LiveAPIContext = createContext<LiveAPIContextType>({
  volume: 0,
  disconnect: () => console.warn('disconnect called on default LiveAPIContext'),
});

// Create a provider component. Although not used currently, it's good practice.
export const LiveAPIProvider = ({ children }: { children: ReactNode }) => {
  const value = {
    volume: 0, // Mock value
    disconnect: () => { console.log('LiveAPI disconnected.'); }, // Mock function
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
