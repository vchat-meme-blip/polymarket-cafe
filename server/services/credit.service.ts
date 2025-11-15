/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { usersCollection, creditUsageLogsCollection, transactionsCollection } from '../db.js';
import { CreditUsageLog, Transaction, TransactionType } from '../../lib/types/index.js';
import { ObjectId } from 'mongodb';

// Pricing model for gpt-4.1-nano with a 3% markup
const BASE_INPUT_COST_PER_MILLION = 0.10;
const BASE_OUTPUT_COST_PER_MILLION = 0.40;
const MARKUP_PERCENTAGE = 0.03;

const MARKED_UP_INPUT_COST_PER_MILLION = BASE_INPUT_COST_PER_MILLION * (1 + MARKUP_PERCENTAGE);
const MARKED_UP_OUTPUT_COST_PER_MILLION = BASE_OUTPUT_COST_PER_MILLION * (1 + MARKUP_PERCENTAGE);

// 1 credit = $0.001
const CREDITS_PER_DOLLAR = 1000;

class CreditService {
    public calculateCost(inputTokens: number, outputTokens: number): number {
        const inputCost = (inputTokens / 1_000_000) * MARKED_UP_INPUT_COST_PER_MILLION;
        const outputCost = (outputTokens / 1_000_000) * MARKED_UP_OUTPUT_COST_PER_MILLION;
        const totalCostInDollars = inputCost + outputCost;
        return Math.ceil(totalCostInDollars * CREDITS_PER_DOLLAR);
    }

    public async debit(ownerHandle: string, cost: number): Promise<void> {
        if (cost <= 0) return;

        const result = await usersCollection.updateOne(
            { handle: ownerHandle },
            { $inc: { credits: -cost } }
        );

        if (result.modifiedCount === 0) {
            console.warn(`[CreditService] Failed to debit ${cost} credits from user ${ownerHandle}. User not found or no change made.`);
        }
    }

    public async credit(ownerHandle: string, credits: number, description: string): Promise<number> {
        if (credits <= 0) return 0;
    
        const user = await usersCollection.findOneAndUpdate(
            { handle: ownerHandle },
            { $inc: { credits } },
            { returnDocument: 'after' }
        );
    
        if (!user) {
            throw new Error(`User with handle ${ownerHandle} not found.`);
        }
    
        // FIX: Add the `ownerHandle` property when creating a `newTransaction` object to match the updated `Transaction` type definition and resolve the TypeScript error.
        const newTransaction: Omit<Transaction, 'id'> = {
            ownerHandle,
            timestamp: Date.now(),
            type: 'credit_purchase',
            amount: credits,
            description,
        };
        await transactionsCollection.insertOne(newTransaction as any);
    
        return user.credits || 0;
    }

    public async logUsage(ownerHandle: string, agentId: string, inputTokens: number, outputTokens: number, cost: number, description: string): Promise<void> {
        const logEntry: Omit<CreditUsageLog, '_id'> = {
            ownerHandle,
            agentId,
            timestamp: Date.now(),
            description,
            cost,
            tokens: {
                input: inputTokens,
                output: outputTokens,
            },
        };
        await creditUsageLogsCollection.insertOne(logEntry as any);
    }

    public async debitForUsage(ownerHandle: string, agentId: string, usage: { prompt_tokens: number, completion_tokens: number }, description: string) {
        const inputTokens = usage.prompt_tokens;
        const outputTokens = usage.completion_tokens;
        const cost = this.calculateCost(inputTokens, outputTokens);
        
        await this.debit(ownerHandle, cost);
        await this.logUsage(ownerHandle, agentId, inputTokens, outputTokens, cost, description);
    }
}

export const creditService = new CreditService();