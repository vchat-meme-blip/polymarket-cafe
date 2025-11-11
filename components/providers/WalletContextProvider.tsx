import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { 
  ConnectionProvider, 
  WalletProvider as WalletAdapterProvider, 
  useConnection as useWalletConnectionHook,
  useWallet as useWalletAdapter
} from '@solana/wallet-adapter-react';
import { 
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  // Add other wallet adapters as needed
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey, Transaction, VersionedTransaction, Commitment, clusterApiUrl } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

// Default commitment level for transactions
const COMMITMENT_LEVEL: Commitment = 'confirmed';

interface WalletConnection {
  connection: Connection | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: { skipPreflight?: boolean; maxRetries?: number }
  ) => Promise<string>;
  error: Error | null;
  network: WalletAdapterNetwork | null;
}

export const useWalletConnection = (): WalletConnection => {
  const { connection } = useConnection();
  const wallet = useWalletAdapter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [network, setNetwork] = useState<WalletAdapterNetwork | null>(null);

  // Set network from connection endpoint
  useEffect(() => {
    if (!connection) return;

    const endpoint = (connection as any)._rpcEndpoint;
    if (endpoint.includes('mainnet')) {
      setNetwork(WalletAdapterNetwork.Mainnet);
    } else if (endpoint.includes('testnet')) {
      setNetwork(WalletAdapterNetwork.Testnet);
    } else {
      setNetwork(WalletAdapterNetwork.Devnet);
    }
  }, [connection]);

  // Handle connection with loading state
  const connect = useCallback(async () => {
    if (!wallet) {
      setError(new Error('Wallet not available'));
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      await wallet.connect();
      
      // Save auto-connect preference
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('walletAutoConnect', 'true');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect wallet');
      console.error('Failed to connect wallet:', error);
      setError(error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [wallet]);

  // Handle disconnection
  const disconnect = useCallback(async () => {
    if (!wallet) return;
    
    try {
      await wallet.disconnect();
      
      // Clear auto-connect preference
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('walletAutoConnect');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to disconnect wallet');
      console.error('Failed to disconnect wallet:', error);
      setError(error);
      throw error;
    }
  }, [wallet]);

  // Handle transaction sending with retry logic
  const sendTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options: { skipPreflight?: boolean; maxRetries?: number } = {}
  ) => {
    if (!wallet?.publicKey || !wallet?.sendTransaction) {
      throw new Error('Wallet not connected');
    }

    const { skipPreflight, maxRetries = 3 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const signature = await wallet.sendTransaction(transaction, connection, {
          skipPreflight,
          maxRetries: 1, // We handle retries ourselves
        });

        // Wait for confirmation
        await connection.confirmTransaction(signature, COMMITMENT_LEVEL);
        return signature;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Transaction failed');
        console.warn(`Transaction attempt ${attempt + 1} failed:`, lastError);
        
        // If this is the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          setError(lastError);
          throw lastError;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    // This should never be reached due to the throw in the loop
    throw lastError || new Error('Transaction failed after multiple attempts');
  }, [wallet]);

  // Handle auto-connect on mount
  useEffect(() => {
    const shouldAutoConnect = 
      typeof window !== 'undefined' && 
      window.localStorage.getItem('walletAutoConnect') === 'true';

    if (shouldAutoConnect && !wallet?.connected && !isConnecting) {
      connect().catch(() => {
        console.warn('Failed to auto-connect wallet');
      });
    }
  }, [connect, wallet?.connected, isConnecting]);

  return {
    connection,
    publicKey: wallet?.publicKey || null,
    connected: wallet?.connected || false,
    connecting: isConnecting || wallet?.connecting || false,
    disconnecting: wallet?.disconnecting || false,
    connect,
    disconnect,
    sendTransaction,
    error,
    network,
  };
};

// Export a hook to check if the wallet is connected
export const useIsWalletConnected = (): boolean => {
  const { connected } = useWalletConnection();
  return connected;
};

// Export a hook to get the wallet's public key
export const useWalletPublicKey = (): PublicKey | null => {
  const { publicKey } = useWalletConnection();
  return publicKey;
};

// Export a hook to get the current network
export const useNetwork = (): WalletAdapterNetwork | null => {
  const { network } = useWalletConnection();
  return network;
};

// Default styles for the wallet modal
import '@solana/wallet-adapter-react-ui/styles.css';

// Get the network from environment variables or default to devnet
const network = (import.meta.env.VITE_SOLANA_NETWORK || 'devnet') as WalletAdapterNetwork;

// Get the RPC endpoint from environment variables or use the default for the selected network
const endpoint = import.meta.env.VITE_SOLANA_RPC || clusterApiUrl(network);

// Context provider component
export const WalletContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize browser wallet adapters only
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter()
    ],
    [] // No dependencies since we're not using network-specific adapters
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletAdapterProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletAdapterProvider>
    </ConnectionProvider>
  );
};

// Re-export the wallet adapter hooks for convenience
export { useWalletConnectionHook as useConnection, useWalletAdapter as useWallet };

// Export the context provider as default
export default WalletContextProvider;