import { FC, ReactNode, createContext, useContext, useMemo } from 'react';
import { 
  useWallet as useWalletAdapter, 
  useConnection as useSolanaConnection,
  WalletContextState
} from '@solana/wallet-adapter-react';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  VersionedTransaction, 
  Commitment 
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
const WalletConnectionContext = createContext<WalletConnection | undefined>(undefined);

// Custom hook to use the wallet connection
export const useWalletConnection = (): WalletConnection => {
  const context = useContext(WalletConnectionContext);
  if (context === undefined) {
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

// Context provider component
export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const wallet = useWalletAdapter();
  const { connection } = useSolanaConnection();

  // Get network from connection endpoint
  const network = useMemo(() => {
    if (!connection) return null;
    const endpoint = (connection as any)._rpcEndpoint || '';
    if (endpoint.includes('mainnet')) return WalletAdapterNetwork.Mainnet;
    if (endpoint.includes('testnet')) return WalletAdapterNetwork.Testnet;
    return WalletAdapterNetwork.Devnet;
  }, [connection]);

  // Create the context value
  const contextValue: WalletConnection = useMemo(() => ({
    connection,
    publicKey: wallet?.publicKey || null,
    connected: wallet?.connected || false,
    connecting: wallet?.connecting || false,
    disconnecting: wallet?.disconnecting || false,
    connect: wallet?.connect ? wallet.connect.bind(wallet) : async () => {},
    disconnect: wallet?.disconnect ? wallet.disconnect.bind(wallet) : async () => {},
    sendTransaction: async (
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
            throw lastError;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      throw lastError || new Error('Transaction failed after multiple attempts');
    },
    error: wallet?.publicKey ? null : new Error('Wallet not connected'),
    network
  }), [wallet, connection, network]);

  return (
    <WalletConnectionContext.Provider value={contextValue}>
      {children}
    </WalletConnectionContext.Provider>
  );
};

// Re-export the wallet adapter hooks for convenience
export { useSolanaConnection as useConnection, useWalletAdapter as useWallet };

// Export the context provider as default
export default WalletContextProvider;
