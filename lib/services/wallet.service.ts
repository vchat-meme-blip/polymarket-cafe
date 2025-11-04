/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useWalletStore } from '../state/wallet.js';
// FIX: Fix import for `useAgent` by changing the path from `../state` to `../state/index.js`.
import { useAgent } from '../state/index.js';

/**
 * @deprecated This service is deprecated. All transaction logic is now handled authoritatively
 * on the server by `server/services/trade.service.ts` to ensure data consistency and security.
 * Client-side state is updated via WebSocket events from the server.
 */
class WalletService {
  /**
   * Simulates a payment from one agent to another.
   * In a real system, this would involve a server-side ledger.
   * Here, we just update the user's transaction log for both sides.
   * @param fromAgentId The ID of the agent sending the payment.
   * @param toAgentId The ID of the agent receiving the payment.
   * @param amount The amount of BOX tokens to transfer.
   * @param reason A description for the transaction.
   * @returns A simulated transaction ID.
   */
  public async processPayment(
    fromAgentId: string,
    toAgentId: string,
    amount: number,
    reason: string,
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const { current: userAgent } = useAgent.getState();
    const { balance, addTransaction } = useWalletStore.getState();

    // In this simulation, we assume only the user's agent can be the payer or payee.
    const isPayer = fromAgentId === userAgent.id;
    const isPayee = toAgentId === userAgent.id;

    if (!isPayer && !isPayee) {
      // This is a transaction between two NPCs, which doesn't affect the user's wallet.
      // We can just simulate success.
      console.log(
        `[WalletService (SIMULATED)] NPC-to-NPC transaction: ${fromAgentId} -> ${toAgentId} for ${amount} BOX.`,
      );
      return { success: true, transactionId: `sim_tx_npc_${Date.now()}` };
    }

    if (isPayer) {
      if (balance < amount) {
        return { success: false, error: 'Insufficient BOX balance.' };
      }
      addTransaction({
        type: 'send',
        amount,
        description: `Sent to ${toAgentId} for: ${reason}`,
      });
    }

    if (isPayee) {
      addTransaction({
        type: 'receive',
        amount,
        description: `Received from ${fromAgentId} for: ${reason}`,
      });
    }

    const transactionId = `sim_tx_${Date.now()}`;
    return { success: true, transactionId };
  }
}

export const walletService = new WalletService();