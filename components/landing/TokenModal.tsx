import { useState } from 'react';
import styles from './Landing.module.css';

const DUMMY_TOKEN = {
  name: '$BONK',
  image: 'https://assets.coingecko.com/coins/images/28600/standard/bonk.jpg?1704263301',
  address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  xUrl: 'https://twitter.com/bonk_inu',
};

const XIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);


export default function TokenModal({ onClose }: { onClose: () => void }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(DUMMY_TOKEN.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.modalShroud} onClick={onClose}>
            <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className={styles.modalClose}>
                    <span className="icon">close</span>
                </button>
                
                <img src={DUMMY_TOKEN.image} alt={DUMMY_TOKEN.name} className={styles.tokenImage} />
                <h2 className={styles.tokenName}>{DUMMY_TOKEN.name}</h2>

                <div className={styles.tokenAddressWrapper}>
                    <span className={styles.tokenAddress}>{DUMMY_TOKEN.address}</span>
                    <button onClick={handleCopy} className={styles.copyButton} title="Copy Address">
                        <span className={`icon ${copied ? styles.copied : ''}`}>
                            {copied ? 'check' : 'content_copy'}
                        </span>
                    </button>
                </div>

                <a href={DUMMY_TOKEN.xUrl} target="_blank" rel="noopener noreferrer" className={`button ${styles.socialLink}`}>
                    <XIcon />
                    View on X
                </a>
            </div>
        </div>
    );
}
