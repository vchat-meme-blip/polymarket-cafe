import React, { FC, ReactNode, useMemo, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { ErrorBoundary } from 'react-error-boundary';

// Error boundary fallback component
const WalletErrorFallback = ({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) => (
  <div role="alert" className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
    <p>Something went wrong with the wallet connection:</p>
    <pre className="text-sm mt-2">{error.message}</pre>
    <button 
      onClick={resetErrorBoundary}
      className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
    >
      Try again
    </button>
  </div>
);

// Import default styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Get network from environment or default to devnet
const getNetwork = (): WalletAdapterNetwork => {
  try {
    const network = import.meta.env.VITE_SOLANA_NETWORK || 'devnet';
    return (network as WalletAdapterNetwork) || WalletAdapterNetwork.Devnet;
  } catch (error) {
    console.warn('Error getting network, defaulting to devnet:', error);
    return WalletAdapterNetwork.Devnet;
  }
};

// Get RPC URL with fallback
const getRpcUrl = (network: WalletAdapterNetwork): string => {
  try {
    return import.meta.env.VITE_SOLANA_RPC || clusterApiUrl(network);
  } catch (error) {
    console.warn('Error getting RPC URL, using default cluster URL');
    return clusterApiUrl(network);
  }
};

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  
  // Initialize network and endpoint with useMemo to prevent unnecessary recalculations
  const { network, endpoint } = useMemo(() => {
    const net = getNetwork();
    return {
      network: net,
      endpoint: getRpcUrl(net)
    };
  }, []);

  // Initialize wallets with auto-connect
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [network]
  );

  // Set mounted state after initial render
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until we're on the client side
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ErrorBoundary 
      FallbackComponent={WalletErrorFallback}
      onReset={() => window.location.reload()}
    >
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );
};

interface WalletConnection {
  connection: ReturnType<typeof useConnection>['connection'];
  publicKey: ReturnType<typeof useWallet>['publicKey'];
  sendTransaction: ReturnType<typeof useWallet>['sendTransaction'];
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
}

// Custom hook to use the wallet context
export const useWalletConnection = (): WalletConnection => {
  const { connection } = useConnection();
  const { 
    publicKey, 
    sendTransaction, 
    connect, 
    disconnect, 
    connected, 
    connecting, 
    disconnecting 
  } = useWallet();
  
  // Handle connect with error handling
  const handleConnect = async () => {
    if (!connect) throw new Error('Wallet connect function not available');
    return connect();
  };
  
  // Handle disconnect with error handling
  const handleDisconnect = async () => {
    if (!disconnect) throw new Error('Wallet disconnect function not available');
    return disconnect();
  };
  
  return {
    connection,
    publicKey,
    sendTransaction: sendTransaction || (() => {
      throw new Error('Send transaction function not available');
    }),
    isConnected: !!publicKey,
    connect: handleConnect,
    disconnect: handleDisconnect,
    connected,
    connecting,
    disconnecting
  };
};
