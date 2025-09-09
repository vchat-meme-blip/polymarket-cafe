import React from 'react';
import { TrackedToken } from '../../core/types.js';
import { formatMarketCap, formatPrice, timeAgo } from '../../core/utils/formatters.js';
import { executeToolCall } from '../../services/scouting.service.js';

interface TokenDetailCardProps {
  token: TrackedToken;
}

const Stat: React.FC<{ label: string; value: string | React.ReactNode; className?: string }> = ({ label, value, className = '' }) => (
    <div className="text-center bg-black/5 dark:bg-white/5 p-2 rounded-lg">
        <p className="text-xs opacity-70 uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-semibold ${className}`}>{value}</p>
    </div>
);

const SocialIcon: React.FC<{ href: string | undefined; iconPath: string; label: string }> = ({ href, iconPath, label }) => {
    if (!href) return null;
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" title={label} className="text-light-text/60 dark:text-dark-text/60 hover:text-primary-orange dark:hover:text-primary-orange transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                {iconPath}
            </svg>
        </a>
    );
};

const AlphaSignal: React.FC<{ icon: string; label: string; value: string | number; colorClass: string }> = ({ icon, label, value, colorClass }) => (
    <div className="flex flex-col items-center text-center">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mb-1 ${colorClass} bg-opacity-20 text-opacity-90`}>
            <i className={`fa-solid ${icon}`}></i>
        </div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs opacity-70 -mt-1">{label}</p>
    </div>
);

const RadialProgress: React.FC<{ progress: number; label: string; eta?: string }> = ({ progress, label, eta }) => {
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="flex flex-col items-center text-center">
             <div className="relative w-16 h-16">
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" className="text-primary-orange/20" fill="transparent" />
                    <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="text-primary-orange" fill="transparent" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold">{progress}%</span>
                </div>
            </div>
            <p className="text-xs opacity-70 mt-1">{label}</p>
            {eta && <p className="text-xs font-bold text-primary-orange">{eta}</p>}
        </div>
    );
};

const TokenDetailCard: React.FC<TokenDetailCardProps> = ({ token }) => {
  const priceChangeColor = (token.priceChange24h ?? 0) >= 0 ? 'text-green-400' : 'text-red-400';
  const priceChangeSign = (token.priceChange24h ?? 0) >= 0 ? '+' : '';

  const hasAlpha = token.graduationProbability || token.spikeMultiplier || token.bonkRelevance;

  const handleToolClick = (toolName: string) => {
    executeToolCall({
      id: `${toolName}-${token.mintAddress}`,
      name: toolName,
      args: { query: token.mintAddress },
      status: 'pending'
    });
  };

  return (
    <div className="w-full h-auto p-5 rounded-2xl border flex flex-col gap-4
      bg-light-glass-bg/60 border-light-border
      dark:bg-dark-glass-bg/50 dark:border-dark-border
      backdrop-blur-xl shadow-2xl">
      
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-white/20 flex-shrink-0 border-2 border-primary-orange/30">
          {token.imageUrl ? 
            <img src={token.imageUrl} alt={`${token.symbol} logo`} className="w-full h-full rounded-full object-cover" /> :
            <span className="w-full h-full flex items-center justify-center text-3xl font-bold">{token.symbol.charAt(0)}</span>
          }
        </div>
        <div className="min-w-0">
          <h3 className="text-2xl font-bold truncate" title={token.name}>{token.name}</h3>
          <p className="text-md opacity-80">${token.symbol}</p>
        </div>
      </div>
      
      <div className="text-center space-y-1 bg-black/5 dark:bg-white/5 p-3 rounded-lg">
        <p className="text-4xl font-light tracking-tighter">{formatPrice(token.priceUsd)}</p>
        <p className={`text-lg font-semibold ${priceChangeColor}`}>
            {priceChangeSign}{(token.priceChange24h ?? 0).toFixed(2)}% <span className="text-sm font-normal opacity-80">(24h)</span>
        </p>
      </div>

       {hasAlpha && (
        <div className="pt-4 border-t border-light-border/50 dark:border-dark-border/50">
            <h4 className="text-center text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Alpha Signals</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
                {token.graduationProbability && <RadialProgress progress={token.graduationProbability} label="Graduation Chance" eta={token.estimatedTimeToGraduation} />}
                {token.spikeMultiplier && <AlphaSignal icon="fa-fire-flame-curved" label="Volume Spike" value={`${token.spikeMultiplier}x`} colorClass="text-orange-400" />}
                {token.bonkRelevance && <AlphaSignal icon="fa-dog" label="Bonk Relevance" value={`${token.bonkRelevance}%`} colorClass="text-yellow-400" />}
            </div>
        </div>
      )}

      <div className="pt-4 border-t border-light-border/50 dark:border-dark-border/50">
        <h4 className="text-center text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Market Stats</h4>
        <div className="grid grid-cols-2 gap-2">
            <Stat label="Market Cap" value={formatMarketCap(token.marketCap)} />
            <Stat label="24h Volume" value={formatMarketCap(token.volume24h)} />
            <Stat label="Liquidity" value={formatMarketCap(token.liquidityUsd)} />
            <Stat label="Token Age" value={timeAgo(token.pairCreatedAt)} />
        </div>
      </div>

       <div className="pt-4 border-t border-light-border/50 dark:border-dark-border/50">
        <h4 className="text-center text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Alpha Tools</h4>
        <div className="flex gap-2">
            <button onClick={() => handleToolClick('analyzeTokenRisk')} title="Run a deep security audit, checking holder concentration and liquidity health." className="flex-1 text-center bg-black/5 dark:bg-white/5 p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                <i className="fa-solid fa-shield-halved text-red-400 text-lg mb-1"></i>
                <p className="text-xs font-semibold">Security Scan</p>
            </button>
             <button onClick={() => handleToolClick('followTheMoney')} title="Trace the creator's wallet activity for suspicious transfers and rug-pull signals." className="flex-1 text-center bg-black/5 dark:bg-white/5 p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                <i className="fa-solid fa-shoe-prints text-green-400 text-lg mb-1"></i>
                <p className="text-xs font-semibold">Follow The Money</p>
            </button>
        </div>
      </div>

      {token.socials && Object.keys(token.socials).length > 0 && (
          <div className="pt-4 flex items-center justify-center gap-6 border-t border-light-border/50 dark:border-dark-border/50">
              <SocialIcon href={token.socials.website} label="Website" iconPath="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              <SocialIcon href={token.socials.twitter} label="Twitter" iconPath="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.49-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.22-1.95-.55v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.01-.06C2.64 18.34 5.23 19 8.1 19c7.32 0 11.33-6.07 11.33-11.33 0-.17 0-.34-.01-.51.78-.56 1.45-1.26 1.99-2.03z" />
              <SocialIcon href={token.socials.telegram} label="Telegram" iconPath="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-1.02.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.51.71l-4.88-3.58-2.32 2.23c-.25.28-.48.51-.86.51z" />
          </div>
      )}
    </div>
  );
};

export default TokenDetailCard;