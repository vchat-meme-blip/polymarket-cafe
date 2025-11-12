/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import '@react-three/fiber';

/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import App from './App';

// Import wallet modal styles
import '@solana/wallet-adapter-react-ui/styles.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const MainApp = () => {
    // Default to devnet if not specified
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => process.env.VITE_SOLANA_RPC || clusterApiUrl(network), [network]);

    // Memoize the wallet adapters to prevent re-renders, per library best practices.
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter()
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <App />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};


root.render(
  <StrictMode>
    <MainApp />
  </StrictMode>
);