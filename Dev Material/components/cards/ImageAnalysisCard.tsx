
import React from 'react';
import { MediaAsset } from '../../core/types.js';
import { clearToolResults } from '../../services/state.actions.js';

interface ImageAnalysisCardProps {
  asset: MediaAsset;
}

const ImageAnalysisCard: React.FC<ImageAnalysisCardProps> = ({ asset }) => {
  return (
    <div className="w-full max-w-lg h-[70vh] p-1 rounded-2xl border flex flex-col pointer-events-auto
      bg-light-glass-bg/60 border-light-border
      dark:bg-dark-glass-bg/50 dark:border-dark-border
      backdrop-blur-xl shadow-2xl">
      
      <div className="p-4 border-b border-light-border/50 dark:border-dark-border/50 flex-shrink-0">
          <h3 className="font-bold">Image Analysis</h3>
          <p className="text-sm opacity-70 truncate" title={asset.name}>Analyzing: {asset.name}</p>
      </div>

      <div className="flex-grow p-4 overflow-y-auto grid md:grid-cols-2 gap-4">
        <div className="w-full h-full bg-black/10 dark:bg-white/5 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={asset.url} alt="Uploaded for analysis" className="max-w-full max-h-full object-contain"/>
        </div>
        <div className="w-full h-full p-3 bg-black/10 dark:bg-white/5 rounded-lg overflow-y-auto">
             <h4 className="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">AI Insights</h4>
             <p className="text-sm whitespace-pre-wrap">{asset.analyzedText}</p>
        </div>
      </div>

      <div className="p-3 border-t border-light-border/50 dark:border-dark-border/50 flex-shrink-0 text-center">
        <button
            onClick={clearToolResults}
            className="px-4 py-2 text-xs font-semibold rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20"
        >
            Dismiss
        </button>
      </div>
    </div>
  );
};

export default ImageAnalysisCard;
