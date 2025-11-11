import { useCallback, useEffect, useState } from 'react';
import { useWalletConnection, useIsWalletConnected, useWalletPublicKey } from '../../hooks/useWalletConnection';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';

// Format the wallet address for display
const formatAddress = (address: PublicKey | null): string => {
  if (!address) return '';
  const base58 = address.toBase58();
  return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
};

export const WalletConnectButton = () => {
  const { 
    connected, 
    connecting, 
    publicKey, 
    connect, 
    disconnect 
  } = useWalletConnection();
  const [isHovering, setIsHovering] = useState(false);

  // Handle connect/disconnect with custom UI
  const handleConnect = useCallback(async () => {
    if (connected) {
      await disconnect();
    } else {
      await connect();
    }
  }, [connected, connect, disconnect]);

  // Show loading state
  if (connecting) {
    return (
      <button
        className="px-4 py-2 bg-gray-600 text-white rounded-lg opacity-75 cursor-not-allowed"
        disabled
      >
        Connecting...
      </button>
    );
  }

  // Show connected state with address
  if (connected && publicKey) {
    return (
      <div 
        className="relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <button
          onClick={handleConnect}
          className={`px-4 py-2 rounded-lg transition-colors ${
            isHovering 
              ? 'bg-red-600 text-white' 
              : 'bg-green-600 text-white'
          }`}
        >
          {isHovering ? 'Disconnect' : formatAddress(publicKey)}
        </button>
      </div>
    );
  }

  // Default connect button
  return (
    <WalletMultiButton
      className="!bg-purple-600 hover:!bg-purple-700 !text-white"
      startIcon={undefined}
    >
      Connect Wallet
    </WalletMultiButton>
  );
};

export default WalletConnectButton;
