import React from 'react';
import { clearToolResults } from '../../services/state.actions.js';
import { TransactionStep } from '../../core/types.js';

interface TracePayload {
    traceImage: string; // base64
    steps: TransactionStep[];
}

interface TransactionTraceCardProps {
  result: TracePayload;
}

const TransactionTraceCard: React.FC<TransactionTraceCardProps> = ({ result }) => {
  const { traceImage, steps } = result;

  return (
    <div className="w-full max-w-2xl h-[70vh] p-1 rounded-2xl border flex flex-col pointer-events-auto
      bg-light-glass-bg/60 border-light-border
      dark:bg-dark-glass-bg/50 dark:border-dark-border
      backdrop-blur-xl shadow-2xl">
      
      <div className="p-4 border-b border-light-border/50 dark:border-dark-border/50 flex-shrink-0">
          <h3 className="font-bold">Follow The Money</h3>
          <p className="text-sm opacity-70">Transaction Trace Results</p>
      </div>

      <div className="flex-grow p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="w-full h-full bg-black/10 dark:bg-white/5 rounded-lg flex items-center justify-center overflow-hidden p-2">
            <img 
                src={`data:image/png;base64,${traceImage}`} 
                alt="Transaction flow diagram" 
                className="max-w-full max-h-full object-contain"
            />
        </div>
        <div className="w-full h-full p-1 overflow-y-auto">
             <h4 className="text-sm font-bold uppercase tracking-wider opacity-60 mb-3 px-2">Transaction Steps</h4>
             <div className="space-y-2">
                {steps.map((step, index) => (
                    <div key={index} className="p-2 bg-black/5 dark:bg-white/5 rounded-md text-xs">
                        <div className="font-mono opacity-70">{step.timestamp}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="truncate" title={step.from}>{step.from.slice(0, 6)}...</span>
                            <span className="text-primary-orange font-bold">&rarr;</span>
                            <span className="truncate" title={step.to}>{step.to.slice(0, 6)}...</span>
                        </div>
                         <div className="font-semibold mt-1">{step.amount.toFixed(2)} ${step.tokenSymbol}</div>
                    </div>
                ))}
             </div>
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

export default TransactionTraceCard;
