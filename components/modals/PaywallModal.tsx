import React, { useState } from 'react';
import { usePaywallStore } from '../../lib/state/paywall';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import styles from './Modals.module.css';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // Mainnet USDC

const PaywallModal = () => {
    const { isOpen, details, closePaywall } = usePaywallStore();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const [isPaying, setIsPaying] = useState(false);

    if (!isOpen || !details) {
        return null;
    }

    const handleConfirmPayment = async () => {
        if (!publicKey || !details) return;
        setIsPaying(true);
        try {
            const amountInSmallestUnit = parseFloat(details.price) * 1_000_000; // USDC has 6 decimals

            const fromTokenAccount = await getAssociatedTokenAddress(USDC_MINT, publicKey);
            const toTokenAccount = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(details.payTo));

            const transaction = new Transaction().add(
                createTransferInstruction(
                    fromTokenAccount,
                    toTokenAccount,
                    publicKey,
                    amountInSmallestUnit
                )
            );

            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'processed');

            details.onSuccess(signature);
            closePaywall();
        } catch (error) {
            console.error("Payment failed", error);
            alert("Payment failed. Please ensure you have enough USDC and try again.");
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <div className={styles.modalShroud} onClick={closePaywall}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                 <button onClick={closePaywall} className={styles.modalClose}>
                    <span className="icon">close</span>
                </button>
                <div className={styles.modalContentPane}>
                    <h2>402 Payment Required</h2>
                    <p>To access this content, please complete the payment.</p>
                    <div>
                        <p><strong>Item:</strong> {details.description}</p>
                        <p><strong>Price:</strong> {details.price} USDC</p>
                        <p><strong>Recipient:</strong> {details.payTo.slice(0, 4)}...{details.payTo.slice(-4)}</p>
                    </div>
                    <div className={styles.modalFooter}>
                        <button className="button secondary" onClick={closePaywall}>Cancel</button>
                        <button className="button primary" onClick={handleConfirmPayment} disabled={!publicKey || isPaying}>
                            {isPaying ? 'Processing...' : 'Pay with Wallet'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaywallModal;
