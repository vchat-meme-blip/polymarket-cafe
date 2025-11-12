import { useMemo, FC, ReactNode, createContext, useContext, useCallback, useState, useEffect } from 'react';
import { 
  ConnectionProvider, 
  WalletProvider as WalletAdapterProvider,
  useWallet as useWalletAdapter,
  useConnection as useSolanaConnection
} from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  VersionedTransaction, 
  Commitment, 
  clusterApiUrl 
} from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

// Default commitment level for transactions
const COMMITMENT_LEVEL: Commitment = 'confirmed';

// Define the WalletConnection type
type WalletConnection = {
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
};

// Create a context for the wallet connection
const WalletConnectionContext = createContext<WalletConnection | null>(null);

// Custom hook to use the wallet connection
export const useWalletConnection = (): WalletConnection => {
  const context = useContext(WalletConnectionContext);
  if (!context) {
    throw new Error('useWalletConnection must be used within a WalletContextProvider');
  }
  return context;
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

// Default to devnet if not specified
const network = WalletAdapterNetwork.Devnet;

// Use environment variable or default to devnet endpoint
const endpoint = process.env.VITE_SOLANA_RPC || clusterApiUrl(network);

// Context provider component
export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [error, setError] = useState<Error | null>(null);
  const wallet = useWalletAdapter();
  const { connection } = useSolanaConnection();
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentNetwork, setCurrentNetwork] = useState<WalletAdapterNetwork>(network);

  // Initialize browser wallet adapters
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter()
    ],
    []
  );

  // Connect wallet handler
  const connect = useCallback(async () => {
    if (!wallet) {
      setError(new Error('Wallet not available'));
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      await wallet.connect();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect wallet');
      setError(error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [wallet]);

  // Disconnect wallet handler
  const disconnect = useCallback(async () => {
    if (!wallet) return;
    try {
      await wallet.disconnect();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to disconnect wallet');
      setError(error);
      throw error;
    }
  }, [wallet]);

  // Send transaction handler with retry logic
  const sendTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options: { skipPreflight?: boolean; maxRetries?: number } = {}
  ) => {
    if (!wallet?.publicKey) throw new Error('Wallet not connected');
    if (!wallet?.sendTransaction) throw new Error('Send transaction function not available');

    const { skipPreflight, maxRetries = 3 } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const signature = await wallet.sendTransaction(transaction, connection, {
          skipPreflight,
          maxRetries: 1,
        });
        await connection.confirmTransaction(signature, COMMITMENT_LEVEL);
        return signature;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Transaction failed');
        if (attempt === maxRetries - 1) {
          setError(lastError);
          throw lastError;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    throw lastError || new Error('Transaction failed after multiple attempts');
  }, [wallet]);

  // Set network from connection endpoint
  useEffect(() => {
    if (!connection) return;
    
    const endpoint = (connection as any)._rpcEndpoint;
    if (endpoint.includes('mainnet')) {
      setCurrentNetwork(WalletAdapterNetwork.Mainnet);
    } else if (endpoint.includes('testnet')) {
      setCurrentNetwork(WalletAdapterNetwork.Testnet);
    } else {
      setCurrentNetwork(WalletAdapterNetwork.Devnet);
    }
  }, [connection]);

  const contextValue: WalletConnection = useMemo(() => ({
    connection,
    publicKey: wallet?.publicKey || null,
    connected: wallet?.connected || false,
    connecting: isConnecting || wallet?.connecting || false,
    disconnecting: wallet?.disconnecting || false,
    connect,
    disconnect,
    sendTransaction,
    error,
    network: currentNetwork
  }), [
    connection, 
    wallet, 
    isConnecting, 
    connect, 
    disconnect, 
    sendTransaction, 
    error, 
    currentNetwork
  ]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletAdapterProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <WalletConnectionContext.Provider value={contextValue}>
            {children}
          </WalletConnectionContext.Provider>
        </WalletModalProvider>
      </WalletAdapterProvider>
    </ConnectionProvider>
  );
};

// Re-export the wallet adapter hooks for convenience
export { useSolanaConnection as useConnection, useWalletAdapter as useWallet };

// Export the context provider as default
export default WalletContextProvider;
