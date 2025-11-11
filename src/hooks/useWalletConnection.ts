import { useCallback, useEffect, useState, useMemo } from 'react';
import { useConnection, useWallet as useWalletAdapter } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, VersionedTransaction, Commitment } from '@solana/web3.js';
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
      console.error('Failed to connect wallet:', err);
      setError(err instanceof Error ? err : new Error('Failed to connect wallet'));
      throw err;
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
      console.error('Failed to disconnect wallet:', err);
      setError(err instanceof Error ? err : new Error('Failed to disconnect wallet'));
      throw err;
    }
  }, [wallet]);

  // Handle transaction sending
  const sendTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: { skipPreflight?: boolean; maxRetries?: number }
  ) => {
    if (!wallet?.publicKey || !wallet?.sendTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await wallet.sendTransaction(transaction, connection, options);
      return signature;
    } catch (err) {
      console.error('Transaction failed:', err);
      setError(err instanceof Error ? err : new Error('Transaction failed'));
      throw err;
    }
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

  // Enhanced sendTransaction with error handling
  const sendTransactionWithRetry = useCallback(
    async (
      transaction: Transaction | VersionedTransaction,
      connection: Connection,
      options: { skipPreflight?: boolean; maxRetries?: number } = {}
    ) => {
      if (!wallet?.publicKey) throw new Error('Wallet not connected');
      if (!wallet?.sendTransaction) throw new Error('Send transaction function not available');

      try {
        const signature = await wallet.sendTransaction(transaction, connection, options);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        
        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        }, 'confirmed');

        return signature;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transaction failed');
        console.error('Transaction failed:', error);
        setError(error);
        throw error;
      }
    },
    [wallet]
  );

  return {
    connection,
    publicKey: wallet?.publicKey || null,
    connected: wallet?.connected || false,
    connecting: isConnecting || wallet?.connecting || false,
    disconnecting: wallet?.disconnecting || false,
    connect,
    disconnect,
    sendTransaction: sendTransactionWithRetry,
    error,
    network: wallet?.publicKey ? 
      (connection.rpcEndpoint.includes('mainnet') ? 
        WalletAdapterNetwork.Mainnet : 
        connection.rpcEndpoint.includes('testnet') ? 
          WalletAdapterNetwork.Testnet : 
          WalletAdapterNetwork.Devnet) : 
      null
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
