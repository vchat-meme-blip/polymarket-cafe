import React, { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, Connection } from '@solana/web3.js';
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

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

// Define network from environment variable or default to devnet
const getNetwork = (): WalletAdapterNetwork => {
  const network = import.meta.env.VITE_SOLANA_NETWORK || 'devnet';
  return network as WalletAdapterNetwork || WalletAdapterNetwork.Devnet;
};

// Custom RPC endpoint from environment variable or use clusterApiUrl
const getRpcUrl = (network: WalletAdapterNetwork): string => {
  return import.meta.env.VITE_SOLANA_RPC || clusterApiUrl(network);
};

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const network = getNetwork();
    const endpoint = useMemo(() => getRpcUrl(network), [network]);
    
    // Initialize wallets with auto-connect
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ],
        [network] // Recreate wallets when network changes
    );

    // Create a connection to check RPC health
    const connection = useMemo(() => new Connection(endpoint, 'confirmed'), [endpoint]);

    return (
        <ErrorBoundary 
            FallbackComponent={WalletErrorFallback}
            onReset={() => window.location.reload()}
        >
            <ConnectionProvider endpoint={endpoint}>
                <WalletProvider wallets={wallets} autoConnect>
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
