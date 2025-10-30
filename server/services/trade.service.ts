/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import mongoose from 'mongoose';
import { agentsCollection, bettingIntelCollection, tradeHistoryCollection } from '../db.js';
import { Agent, TradeRecord, BettingIntel } from '../../lib/types/index.js';
import { ObjectId } from 'mongodb';

interface ExecuteTradeParams {
    intelId: string;
    buyerAgentId: string;
    sellerAgentId: string;
    roomId: string;
}

class TradeService {
    public async executeTrade(params: ExecuteTradeParams): Promise<{ trade: TradeRecord, newIntel: BettingIntel }> {
        const { intelId, buyerAgentId, sellerAgentId, roomId } = params;

        // --- Validation ---
        if (!mongoose.Types.ObjectId.isValid(intelId) || !mongoose.Types.ObjectId.isValid(buyerAgentId) || !mongoose.Types.ObjectId.isValid(sellerAgentId)) {
            throw new Error("Invalid ID format for intel or agents.");
        }

        const buyerId = new ObjectId(buyerAgentId);
        const sellerId = new ObjectId(sellerAgentId);
        const intelObjectId = new ObjectId(intelId);

        const [originalIntel, seller, buyer] = await Promise.all([
            bettingIntelCollection.findOne({ _id: intelObjectId }),
            agentsCollection.findOne({ _id: sellerId }),
            agentsCollection.findOne({ _id: buyerId })
        ]);

        if (!originalIntel) throw new Error(`Intel with ID ${intelId} not found.`);
        if (!seller) throw new Error(`Seller agent with ID ${sellerAgentId} not found.`);
        if (!buyer) throw new Error(`Buyer agent with ID ${buyerAgentId} not found.`);
        if (!originalIntel.isTradable) throw new Error("Intel is not marked as tradable.");
        if (originalIntel.ownerAgentId.toString() !== sellerAgentId) throw new Error("Seller does not own this intel.");
        
        const price = originalIntel.price || 0;
        if (price <= 0) throw new Error("Intel must have a positive price to be traded.");

        // TODO: In the future, check buyer's virtual balance. For now, we assume they can afford it.
        // if (buyer.boxBalance < price) throw new Error("Buyer has insufficient funds.");

        // --- Transaction Logic ---
        // 1. Create a new, non-tradable copy of the intel for the buyer
        // FIX: The explicit type `Omit<BettingIntel, 'id'>` was incorrect as it expected string IDs from the shared type, while this object is being prepared for MongoDB with `ObjectId`s. Removing the type annotation allows TypeScript to correctly infer the type for database insertion.
        const newIntelForBuyer: any = {
            ...originalIntel,
            _id: new ObjectId(),
            ownerAgentId: buyerId,
            ownerHandle: buyer.ownerHandle,
            sourceAgentId: sellerId,
            pricePaid: price,
            isTradable: false, // Purchased intel cannot be immediately resold
            createdAt: new Date(),
            pnlGenerated: { amount: 0, currency: 'USD' },
        };
        delete newIntelForBuyer.id; // Remove the old string ID property

        const { insertedId } = await bettingIntelCollection.insertOne(newIntelForBuyer);
        const savedIntelDoc = await bettingIntelCollection.findOne({ _id: insertedId });
        if (!savedIntelDoc) throw new Error('Failed to create new intel for buyer.');

        // 2. Update PNL for agents and the original intel
        await Promise.all([
            agentsCollection.updateOne({ _id: sellerId }, { $inc: { currentPnl: price } }),
            agentsCollection.updateOne({ _id: buyerId }, { $inc: { currentPnl: -price } }),
            bettingIntelCollection.updateOne({ _id: intelObjectId }, { $inc: { 'pnlGenerated.amount': price } })
        ]);

        // 3. Record the trade in the history
        const trade: TradeRecord = {
            fromId: sellerAgentId,
            toId: buyerAgentId,
            type: 'intel',
            market: originalIntel.market,
            intelId: intelId,
            price: price,
            timestamp: Date.now(),
            roomId: roomId,
        };
        await tradeHistoryCollection.insertOne(trade as any);

        const newIntel: BettingIntel = {
            ...savedIntelDoc,
            id: savedIntelDoc._id.toString(),
            ownerAgentId: savedIntelDoc.ownerAgentId.toString(),
            sourceAgentId: savedIntelDoc.sourceAgentId?.toString(),
            createdAt: (savedIntelDoc.createdAt as Date).getTime()
        } as unknown as BettingIntel;


        return { trade, newIntel };
    }
}

export const tradeService = new TradeService();