import { useCallback, useEffect, useState, useMemo } from 'react';
import { 
  useConnection as useSolanaConnection, 
  useWallet as useWalletAdapter,
  WalletContextState
} from '@solana/wallet-adapter-react';
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
  const { connection } = useSolanaConnection();
  const wallet = useWalletAdapter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Get network from connection endpoint
  const network = useMemo(() => {
    if (!connection) return null;
    try {
      const endpoint = (connection as any)._rpcEndpoint?.toLowerCase() || '';
      if (endpoint.includes('mainnet')) return WalletAdapterNetwork.Mainnet;
      if (endpoint.includes('testnet')) return WalletAdapterNetwork.Testnet;
      if (endpoint.includes('devnet')) return WalletAdapterNetwork.Devnet;
      return WalletAdapterNetwork.Devnet; // default to devnet
    } catch (err) {
      console.warn('Could not determine network from connection:', err);
      return null;
    }
  }, [connection]);

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

  // Send transaction with retry logic
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

  // Auto-connect wallet if previously connected
  useEffect(() => {
    const shouldAutoConnect = localStorage.getItem('walletAutoConnect') === 'true';
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

// Export convenience hooks
export const useIsWalletConnected = (): boolean => {
  const { connected } = useWalletConnection();
  return connected;
};

export const useWalletPublicKey = (): PublicKey | null => {
  const { publicKey } = useWalletConnection();
  return publicKey;
};

export const useNetwork = (): WalletAdapterNetwork | null => {
  const { network } = useWalletConnection();
  return network;
};

// Re-export wallet adapter hooks for convenience
export { useSolanaConnection as useConnection, useWalletAdapter as useWallet };
