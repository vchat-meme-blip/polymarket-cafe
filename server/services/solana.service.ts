/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';

const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

class SolanaService {
    private connection: Connection;

    constructor() {
        const rpcUrl = process.env.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
        this.connection = new Connection(rpcUrl, 'confirmed');
    }

    public async verifyUsdcTransfer(signature: string, expectedAmount: number): Promise<{ success: boolean; error?: string }> {
        console.log(`[SolanaService] Verifying transaction: ${signature}`);

        try {
            const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });

            if (!tx) {
                throw new Error('Transaction not found.');
            }

            if (tx.meta?.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
            }

            const projectWalletAddress = process.env.PROJECT_SOLANA_WALLET_ADDRESS;
            if (!projectWalletAddress) {
                throw new Error("Server is not configured for payments.");
            }

            const usdcTransfer = tx.meta.innerInstructions?.flatMap(
                instruction => instruction.instructions.filter(
                    i => 'parsed' in i &&
                         i.parsed.type === 'transfer' &&
                         i.program === 'spl-token' &&
                         i.parsed.info.mint === USDC_MINT_ADDRESS &&
                         i.parsed.info.destination === projectWalletAddress
                )
            )[0];
            
            if (!usdcTransfer || !('parsed' in usdcTransfer)) {
                throw new Error('No valid USDC transfer to the project wallet found in the transaction.');
            }

            const receivedAmount = usdcTransfer.parsed.info.amount / 1_000_000; // USDC has 6 decimals

            if (receivedAmount < expectedAmount) {
                throw new Error(`Payment amount mismatch. Expected ${expectedAmount}, received ${receivedAmount}.`);
            }
            
            console.log(`[SolanaService] Transaction ${signature} verified successfully.`);
            return { success: true };

        } catch (error: any) {
            console.error(`[SolanaService] Transaction verification failed for ${signature}:`, error);
            return { success: false, error: error.message || 'Unknown verification error.' };
        }
    }
}

export const solanaService = new SolanaService();
