import React from 'react';
import { TrackedToken } from '../../core/types.js';
import { formatMarketCap } from '../../core/utils/formatters.js';

interface TokenWidgetCardProps {
  token: TrackedToken & { isWatched?: boolean };
  isWatched?: boolean;
  onClick: () => void;
  onToggleWatchlist: () => void;
  onHide: () => void;
}

const TokenWidgetCard: React.FC<TokenWidgetCardProps> = ({ token, isWatched, onClick, onToggleWatchlist, onHide }) => {
  const hasPriceChange = typeof token.priceChange24h === 'number';
  const isTrenchRunner = token.category === 'Trench Runners' && typeof token.trenchScore === 'number';

  let metricValue = formatMarketCap(token.marketCap);
  let metricColor = 'text-light-text/80 dark:text-dark-text/80';

  if (isTrenchRunner) {
    metricValue = `Score: ${token.trenchScore}`;
    metricColor = 'text-blue-400';
  } else if (hasPriceChange) {
    metricValue = `${token.priceChange24h! >= 0 ? '+' : ''}${token.priceChange24h!.toFixed(1)}%`;
    metricColor = token.priceChange24h! >= 0 ? 'text-green-400' : 'text-red-400';
  }

  const StarIcon: React.FC<{ isFilled: boolean }> = ({ isFilled }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 transition-colors ${isFilled ? 'text-yellow-400' : 'text-inherit'}`}>
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
  
  const HideIcon = () => (
     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"></path></svg>
  );

  return (
    <div className="w-full flex items-center p-1.5 rounded-lg transition-colors duration-200 group hover:bg-sidebar-light-hover dark:hover:bg-sidebar-dark-hover">
        <button onClick={onClick} className="flex-grow flex items-center min-w-0 text-left">
            <div className="w-8 h-8 rounded-md bg-white/20 flex-shrink-0 border border-white/10 flex items-center justify-center mr-2">
                {token.imageUrl ? 
                    <img src={token.imageUrl} alt={token.symbol} className="w-full h-full rounded-md object-cover" /> :
                    <span className="text-sm font-bold opacity-80">{token.symbol.charAt(0)}</span>
                }
            </div>
            <div className="flex-grow min-w-0">
                <p className="text-sm font-semibold truncate">{token.symbol}</p>
                <p className={`text-xs font-medium ${metricColor}`}>{metricValue}</p>
            </div>
        </button>

        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button onClick={onToggleWatchlist} title={isWatched ? "Remove from Watchlist" : "Add to Watchlist"} className="w-7 h-7 flex items-center justify-center rounded-md text-light-text/60 dark:text-dark-text/60 hover:bg-black/10 dark:hover:bg-white/10">
                <StarIcon isFilled={isWatched || false} />
            </button>
             <button onClick={onHide} title="Hide Token" className="w-7 h-7 flex items-center justify-center rounded-md text-light-text/60 dark:text-dark-text/60 hover:bg-black/10 dark:hover:bg-white/10">
                <HideIcon />
            </button>
        </div>
    </div>
  );
};

export default TokenWidgetCard;