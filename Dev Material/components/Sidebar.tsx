import React, { useState, useMemo, useRef, useEffect } from 'react';
import { type TrackedToken } from '../core/types.js';
import TokenWidgetCard from './cards/TokenWidgetCard.js';
import { AppState } from '../core/types/state.js';

type PrimaryTab = 'scouting' | 'watchlist' | 'resources';

interface SidebarProps {
  isOpen: boolean;
  tokens: (TrackedToken & { isWatched?: boolean })[];
  userLists: AppState['userLists'];
  resourceBank: AppState['resourceBank'];
  onDisplayTokenDetails: (token: TrackedToken) => void;
  onAddToWatchlist: (mintAddress: string) => void;
  onRemoveFromWatchlist: (mintAddress: string) => void;
  onHideToken: (mintAddress: string) => void;
  onForceScan: () => void;
  onImageUpload: (file: File) => void;
  onGetDailySummary: () => void;
}

const categoryConfig: { [key: string]: { title: string; icon: React.ReactNode; tooltip?: string, animationClass?: string } } = {
  'Bonk Prospects': { title: 'Prospects', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z"></path></svg>, tooltip: "Tokens with a high probability of graduating soon." },
  'Volume Spikes': { title: 'Surges', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.93 2.14a1 1 0 0 0-1.86 0L9.29 6.25a1 1 0 0 0 .93 1.45h3.56a1 1 0 0 0 .93-1.45zM11.5 8.5v3.29a2.5 2.5 0 1 0 1 0V8.5zm5.32 4.02-3.56 3.56a1 1 0 0 0 1.42 1.42l3.56-3.56a1 1 0 0 0-1.42-1.42zM7.18 12.52l-3.56 3.56a1 1 0 1 0 1.42 1.42l3.56-3.56a1 1 0 0 0-1.42-1.42zM15 22h-6a1 1 0 1 1 0-2h6a1 1 0 1 1 0 2z"></path></svg>, tooltip: "Pre-graduation tokens with a sudden volume explosion." },
  'Trending': { title: 'Trending', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z"></path></svg>, tooltip: "Tokens trending by volume on major DEXs." },
  'Trench Runners': { title: 'Runners', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 5.5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5zm-4 10c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5zm8-5c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5zM6 2l-4 4 1.41 1.41L5 5.83V18.17l-1.59 1.59L5 21l4-4-1.41-1.41L6 17.17V6.83l1.59-1.59L6 2z"></path></svg>, tooltip: "Recently graduated tokens now exploding in volume." },
  'Bonk Heroes': { title: 'Heroes', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5L12 1zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"></path></svg>, tooltip: "Proven winners with exceptional long-term performance." },
  'Bonding Curve': { title: 'Bonding', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 18.5l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.09-4-4L2 17.09z"></path></svg>, tooltip: "Tokens currently active on their bonding curve." },
  'Recently Graduated': { title: 'Graduated', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"></path></svg>, tooltip: "Top tokens that have recently launched." },
};
const orderedCategoryKeys = Object.keys(categoryConfig);

const PrimaryNavItem: React.FC<{ icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void }> = ({ icon, label, isActive, onClick }) => (
  <button onClick={onClick} className={`w-12 h-12 flex flex-col items-center justify-center transition-all duration-200 rounded-lg ${isActive ? 'bg-primary-orange/20 text-primary-orange' : 'hover:bg-black/10 dark:hover:bg-white/10'}`} title={label}>
    {icon}
    <span className="text-[10px] font-bold mt-0.5">{label}</span>
  </button>
);

const ScanTimer: React.FC<{ onForceScan: () => void }> = ({ onForceScan }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(p => (p >= 100 ? 0 : p + (100 / 150))); // 15 seconds * 10 steps/sec
        }, 100);
        return () => clearInterval(interval);
    }, []);

    const circumference = 2 * Math.PI * 18;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="relative w-12 h-12 flex items-center justify-center" title="Next scan progress">
            <svg className="w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="3" className="text-primary-orange/10" fill="transparent" />
                <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="text-primary-orange/80 transition-all duration-100" fill="transparent" />
            </svg>
            <button onClick={onForceScan} className="absolute inset-0 flex items-center justify-center text-light-text/80 dark:text-dark-text/80 hover:text-primary-orange transition-colors" title="Scan Now">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>
            </button>
        </div>
    );
};


const Sidebar: React.FC<SidebarProps> = ({ isOpen, tokens, userLists, onDisplayTokenDetails, onAddToWatchlist, onRemoveFromWatchlist, onHideToken, onForceScan, onImageUpload, resourceBank, onGetDailySummary }) => {
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTab>('scouting');
  const [activeScoutingTab, setActiveScoutingTab] = useState(orderedCategoryKeys[0]);
  const [activeResourceTab, setActiveResourceTab] = useState<'summaries' | 'media'>('summaries');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groupedTokens = useMemo(() => {
    return tokens.reduce((acc, token) => {
      const category = token.category || 'Trending';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(token);
      return acc;
    }, {} as Record<string, (TrackedToken & { isWatched?: boolean })[]>);
  }, [tokens]);
  
  const watchlistTokens = useMemo(() => {
    const watchlistSet = new Set(userLists.watchlist);
    // This is inefficient, a map would be better. For now, find tokens from the main list.
    return tokens.filter(token => watchlistSet.has(token.mintAddress));
  }, [tokens, userLists.watchlist]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            onImageUpload(event.target.files[0]);
        }
    };

  return (
    <aside className={`fixed top-0 left-0 h-full z-40 flex pt-20 pb-5 box-border transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Primary Icon Navigation */}
      <div className="w-20 h-full flex flex-col items-center p-2 gap-2 backdrop-blur-lg bg-sidebar-light-bg/80 dark:bg-sidebar-dark-bg/80 border-r border-sidebar-light-border dark:border-sidebar-dark-border">
          <PrimaryNavItem icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>} label="Scout" isActive={activePrimaryTab === 'scouting'} onClick={() => setActivePrimaryTab('scouting')} />
          <PrimaryNavItem icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>} label="Watchlist" isActive={activePrimaryTab === 'watchlist'} onClick={() => setActivePrimaryTab('watchlist')} />
          <PrimaryNavItem icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"></path></svg>} label="Resources" isActive={activePrimaryTab === 'resources'} onClick={() => setActivePrimaryTab('resources')} />
      </div>

      {/* Content Panel */}
      <div className="w-72 h-full flex flex-col bg-sidebar-light-bg dark:bg-sidebar-dark-bg border-r border-sidebar-light-border dark:border-sidebar-dark-border shadow-lg">
        {/* Scouting Panel */}
        {activePrimaryTab === 'scouting' && (
            <>
                <div className="p-2 border-b border-sidebar-light-border dark:border-sidebar-dark-border">
                    <div className="flex flex-wrap gap-1">
                        {orderedCategoryKeys.map(key => (
                            <button key={key} onClick={() => setActiveScoutingTab(key)} title={categoryConfig[key].tooltip} className={`px-2.5 py-1 text-xs font-bold rounded-full transition-colors ${activeScoutingTab === key ? 'bg-primary-orange text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                                {categoryConfig[key].title}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                    {(groupedTokens[activeScoutingTab] || []).map(token => (
                         <TokenWidgetCard 
                            key={token.mintAddress} 
                            token={token} 
                            isWatched={token.isWatched}
                            onToggleWatchlist={() => token.isWatched ? onRemoveFromWatchlist(token.mintAddress) : onAddToWatchlist(token.mintAddress)}
                            onHide={() => onHideToken(token.mintAddress)}
                            onClick={() => onDisplayTokenDetails(token)}
                        />
                    ))}
                     {(!groupedTokens[activeScoutingTab] || groupedTokens[activeScoutingTab].length === 0) && (
                        <p className="px-2 py-10 text-center text-xs italic opacity-70 dark:opacity-60">Scanning for {activeScoutingTab}...</p>
                    )}
                </div>
                <div className="p-2 border-t border-sidebar-light-border dark:border-sidebar-dark-border flex items-center justify-center">
                    <ScanTimer onForceScan={onForceScan} />
                </div>
            </>
        )}
        {/* Watchlist Panel */}
        {activePrimaryTab === 'watchlist' && (
            <>
                <div className="p-4 border-b border-sidebar-light-border dark:border-sidebar-dark-border">
                    <h3 className="font-bold text-lg">My Watchlist</h3>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                    {watchlistTokens.length > 0 ? (
                        watchlistTokens.map(token => (
                            <TokenWidgetCard 
                                key={token.mintAddress} 
                                token={token} 
                                isWatched={true}
                                onToggleWatchlist={() => onRemoveFromWatchlist(token.mintAddress)}
                                onHide={() => onHideToken(token.mintAddress)}
                                onClick={() => onDisplayTokenDetails(token)}
                            />
                        ))
                    ) : (
                         <p className="px-2 py-10 text-center text-xs italic opacity-70 dark:opacity-60">Your watchlist is empty. Add tokens by hovering over them in the Scout panel.</p>
                    )}
                </div>
            </>
        )}
        {/* Resource Bank Panel */}
        {activePrimaryTab === 'resources' && (
             <>
                <div className="p-4 border-b border-sidebar-light-border dark:border-sidebar-dark-border">
                    <h3 className="font-bold text-lg">Resource Bank</h3>
                </div>
                <div className="p-2 border-b border-sidebar-light-border dark:border-sidebar-dark-border">
                     <div className="flex gap-1">
                        <button onClick={() => { setActiveResourceTab('summaries'); onGetDailySummary(); }} className={`flex-1 px-2.5 py-1 text-xs font-bold rounded-full transition-colors ${activeResourceTab === 'summaries' ? 'bg-primary-orange text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                           Daily Briefing
                        </button>
                         <button onClick={() => setActiveResourceTab('media')} className={`flex-1 px-2.5 py-1 text-xs font-bold rounded-full transition-colors ${activeResourceTab === 'media' ? 'bg-primary-orange text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                           Media Library
                        </button>
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-4">
                    {activeResourceTab === 'summaries' && (
                        <div className="text-center py-10 opacity-70">
                            <i className="fa-solid fa-newspaper text-4xl mb-2"></i>
                            <p className="text-xs italic">Click "Daily Briefing" to generate today's summary.</p>
                        </div>
                    )}
                    {activeResourceTab === 'media' && (
                        <div className="text-center py-10">
                            <i className="fa-solid fa-upload text-4xl mb-4 opacity-70"></i>
                            <p className="text-sm font-semibold mb-2">Analyze an Image</p>
                            <p className="text-xs opacity-70 mb-4">Upload a chart or meme for the AI to analyze.</p>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-primary-orange/80 text-white font-bold text-sm rounded-lg hover:bg-primary-orange transition-colors">
                                Upload Image
                            </button>
                        </div>
                    )}
                </div>
            </>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;