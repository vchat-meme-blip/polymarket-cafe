import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

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
}

export const useWalletConnection = (): WalletConnection => {
  const { connection } = useConnection();
  const { 
    publicKey, 
    connect, 
    disconnect, 
    sendTransaction,
    connecting,
    disconnecting,
    connected
  } = useWallet();

  // Handle auto-connect
  useEffect(() => {
    const shouldAutoConnect = 
      typeof window !== 'undefined' && 
      window.localStorage.getItem('walletAutoConnect') === 'true';

    if (shouldAutoConnect && !connected && !connecting) {
      connect().catch(() => {
        // Handle error (e.g., no wallet found)
        console.warn('Failed to auto-connect wallet');
      });
    }
  }, [connect, connected, connecting]);

  // Handle wallet connection
  const handleConnect = useCallback(async () => {
    try {
      await connect();
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('walletAutoConnect', 'true');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  }, [connect]);

  // Handle wallet disconnection
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('walletAutoConnect');
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      throw error;
    }
  }, [disconnect]);

  // Enhanced sendTransaction with error handling
  const sendTransactionWithRetry = useCallback(
    async (
      transaction: Transaction | VersionedTransaction,
      connection: Connection,
      options: { skipPreflight?: boolean; maxRetries?: number } = {}
    ) => {
      if (!publicKey) throw new Error('Wallet not connected');
      if (!sendTransaction) throw new Error('Send transaction function not available');

      try {
        const signature = await sendTransaction(transaction, connection, options);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        
        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        }, 'confirmed');

        return signature;
      } catch (error) {
        console.error('Transaction failed:', error);
        throw error;
      }
    },
    [publicKey, sendTransaction]
  );

  return {
    connection,
    publicKey,
    connected,
    connecting,
    disconnecting,
    connect: handleConnect,
    disconnect: handleDisconnect,
    sendTransaction: sendTransactionWithRetry,
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
