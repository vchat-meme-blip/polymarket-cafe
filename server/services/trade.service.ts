/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import mongoose from 'mongoose';
import { agentsCollection, bettingIntelCollection, tradeHistoryCollection } from '../db.js';
import { Agent, TradeRecord, BettingIntel, MarketWatchlist, Offer } from '../../lib/types/index.js';
import { ObjectId } from 'mongodb';

class TradeService {
    public async executeTrade(offer: Offer): Promise<{ trade: TradeRecord, newAsset: BettingIntel | MarketWatchlist }> {
        const { fromId: sellerAgentId, toId: buyerAgentId, type, price, intelId, watchlistId, market, watchlistName, roomId } = offer;

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // --- Validation ---
            if (!mongoose.Types.ObjectId.isValid(sellerAgentId) || !mongoose.Types.ObjectId.isValid(buyerAgentId)) {
                throw new Error("Invalid ID format for agents.");
            }
            
            const buyerId = new ObjectId(buyerAgentId);
            const sellerId = new ObjectId(sellerAgentId);

            const [seller, buyer] = await Promise.all([
                agentsCollection.findOne({ _id: sellerId }, { session }),
                agentsCollection.findOne({ _id: buyerId }, { session })
            ]);

            if (!seller) throw new Error(`Seller agent with ID ${sellerAgentId} not found.`);
            if (!buyer) throw new Error(`Buyer agent with ID ${buyerAgentId} not found.`);
            if (buyer.boxBalance < price) throw new Error("Buyer has insufficient funds.");

            let trade: TradeRecord;
            let newAsset: BettingIntel | MarketWatchlist;
            
            if (type === 'intel') {
                if (!intelId || !mongoose.Types.ObjectId.isValid(intelId)) throw new Error("Invalid Intel ID format.");
                
                const originalIntel = await bettingIntelCollection.findOne({ _id: new ObjectId(intelId) }, { session });
                if (!originalIntel) throw new Error(`Intel with ID ${intelId} not found.`);
                if (!originalIntel.isTradable) throw new Error("Intel is not marked as tradable.");
                if (originalIntel.ownerAgentId.toString() !== sellerAgentId) throw new Error("Seller does not own this intel.");

                const newIntelForBuyerDoc = {
                    ...originalIntel,
                    _id: new ObjectId(),
                    ownerAgentId: buyerId,
                    ownerHandle: buyer.ownerHandle,
                    sourceAgentId: sellerId,
                    pricePaid: price,
                    isTradable: false,
                    createdAt: new Date(),
                    pnlGenerated: { amount: 0, currency: 'USD' },
                };
                delete (newIntelForBuyerDoc as any).id;
                
                const { insertedId } = await bettingIntelCollection.insertOne(newIntelForBuyerDoc as any, { session });
                const savedDoc = await bettingIntelCollection.findOne({ _id: insertedId }, { session });
                if (!savedDoc) throw new Error('Failed to save new intel for buyer.');

                await bettingIntelCollection.updateOne({ _id: originalIntel._id }, { $inc: { 'pnlGenerated.amount': price } }, { session });

                newAsset = { ...savedDoc, id: savedDoc._id.toString() } as unknown as BettingIntel;
                trade = { fromId: sellerAgentId, toId: buyerAgentId, type: 'intel', price, market, intelId, timestamp: Date.now(), roomId };

            } else if (type === 'watchlist') {
                if (!watchlistId) throw new Error("Watchlist ID is required for this trade type.");
                
                const sellerWatchlist = (seller as any).marketWatchlists?.find((w: any) => w.id === watchlistId);
                if (!sellerWatchlist) throw new Error(`Watchlist with ID ${watchlistId} not found on seller.`);
                if (!sellerWatchlist.isTradable) throw new Error("Watchlist is not marked as tradable.");

                const newWatchlistForBuyer: MarketWatchlist = {
                    ...sellerWatchlist,
                    id: new ObjectId().toHexString(),
                    isTradable: false,
                    sourceAgentId: sellerAgentId,
                    pricePaid: price,
                    createdAt: Date.now(),
                };

                await agentsCollection.updateOne(
                    { _id: buyerId },
                    { $push: { marketWatchlists: newWatchlistForBuyer as any } },
                    { session }
                );

                newAsset = newWatchlistForBuyer;
                trade = { fromId: sellerAgentId, toId: buyerAgentId, type: 'watchlist', price, watchlistId, watchlistName, timestamp: Date.now(), roomId };

            } else {
                throw new Error("Invalid trade type.");
            }

            // --- Update balances and PNL ---
            await Promise.all([
                agentsCollection.updateOne({ _id: sellerId }, { $inc: { boxBalance: price, intelPnl: price } }, { session }),
                agentsCollection.updateOne({ _id: buyerId }, { $inc: { boxBalance: -price, intelPnl: -price } }, { session }),
                tradeHistoryCollection.insertOne(trade as any, { session })
            ]);

            await session.commitTransaction();
            return { trade, newAsset };

        } catch (error) {
            await session.abortTransaction();
            console.error('[TradeService] Transaction aborted:', error);
            throw error;
        } finally {
            session.endSession();
        }
    }
}

export const tradeService = new TradeService();