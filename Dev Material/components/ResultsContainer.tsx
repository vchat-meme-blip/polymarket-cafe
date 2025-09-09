import React, { useState, useEffect } from 'react';
import TokenDetailCard from './cards/TokenDetailCard.js';
import RugAlertCard from './cards/RugAlertCard.js';
import { clearToolResults } from '../services/state.actions.js';
import { ToolResult } from '../core/types/state.js';
import { TrackedToken } from '../core/types.js';
import TweetStreamCard from './cards/TweetStreamCard.js';
import ImageAnalysisCard from './cards/ImageAnalysisCard.js';
import DevWalletTraceCard from './cards/DevWalletTraceCard.js';
import DailySummaryCard from './cards/DailySummaryCard.js';

interface ResultsContainerProps {
  results: ToolResult | null;
}

const ResultsContainer: React.FC<ResultsContainerProps> = ({ results }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (results && results.payload) {
      setCurrentIndex(0);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [results]);

  if (!results || !results.payload) {
    return null;
  }

  const renderContent = () => {
    switch (results.displayType) {
      case 'TOKEN_DETAIL_CARD':
      case 'TOKEN_WIDGET_GRID': // Also handle this for tools returning lists
        const items = Array.isArray(results.payload) ? results.payload : [results.payload];
        if (items.length === 0) return null;
        const hasMultiple = items.length > 1;

        const handleNext = () => setCurrentIndex((prev) => (prev + 1) % items.length);
        const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
        
        return (
          <>
            <div className="w-full h-full [transform-style:preserve-3d] flex items-center justify-center relative pointer-events-auto">
              <div 
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }} // Simple slide for now
              >
                {items.map((token: TrackedToken, index: number) => (
                   <div 
                     key={token.mintAddress || index} 
                     className="w-80 flex-shrink-0 mx-4 transition-all duration-500"
                     style={{ 
                        // This logic is simplified to show one card at a time for clarity in the carousel
                        display: index === currentIndex ? 'block' : 'none', 
                     }}
                   >
                    <TokenDetailCard token={token} />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute bottom-[280px] z-30 flex items-center gap-4 pointer-events-auto">
              {hasMultiple && (
                  <button onClick={handlePrev} className="p-2 rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>
                  </button>
              )}
              <button 
                  onClick={clearToolResults} 
                  className="px-4 py-2 text-xs font-semibold rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20"
              >
                  Dismiss
              </button>
              {hasMultiple && (
                  <button onClick={handleNext} className="p-2 rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path></svg>
                  </button>
              )}
            </div>
          </>
        );
      
      case 'RUG_ALERT_CARD':
        return <RugAlertCard token={results.payload} />;
      
      case 'TWEET_STREAM_CARD':
        return <TweetStreamCard result={results.payload} />;
        
      case 'IMAGE_ANALYSIS_CARD':
        return <ImageAnalysisCard asset={results.payload} />;

      case 'DEV_WALLET_TRACE_CARD':
        return <DevWalletTraceCard result={results.payload} />;

      case 'DAILY_SUMMARY_CARD':
        return <DailySummaryCard result={results.payload} />;

      case 'ERROR_CARD':
        return (
          <div className="w-80 flex-shrink-0 mx-4 pointer-events-auto">
            <div className="p-6 bg-red-500/20 dark:bg-red-900/40 rounded-2xl border border-red-500/30 backdrop-blur-md text-center">
              <h3 className="text-lg font-bold text-red-400 mb-2">Error</h3>
              <p className="text-sm text-light-text dark:text-dark-text mb-4">{results.payload.message || 'An unknown error occurred.'}</p>
              <button
                  onClick={clearToolResults}
                  className="px-4 py-2 text-xs font-semibold rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20"
              >
                  Dismiss
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="w-80 flex-shrink-0 mx-4">
            <div className="p-6 bg-red-500/20 dark:bg-red-900/40 rounded-2xl border border-red-500/30 backdrop-blur-md text-center">
              <h3 className="text-lg font-bold text-red-400 mb-2">Display Error</h3>
              <p className="text-sm text-light-text dark:text-dark-text">Unknown result type: {results.displayType}</p>
            </div>
          </div>
        );
    }
  };
  
  const animationClass = isVisible ? 'animate-float-in' : 'animate-float-out';

  return (
    <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none ${animationClass}`}>
      {renderContent()}
    </div>
  );
};

export default ResultsContainer;