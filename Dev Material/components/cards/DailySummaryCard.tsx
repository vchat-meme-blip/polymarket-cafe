import React from 'react';
import { clearToolResults } from '../../services/state.actions.js';

interface DailySummaryPayload {
    summary: string;
}

interface DailySummaryCardProps {
  result: DailySummaryPayload;
}

const DailySummaryCard: React.FC<DailySummaryCardProps> = ({ result }) => {
  const { summary } = result;

  // Basic markdown to HTML conversion
  const renderMarkdown = (text: string) => {
    return text
      .split('\n')
      .map((line, index) => {
        if (line.startsWith('### ')) return <h3 key={index} className="text-md font-bold mt-3 mb-1 text-primary-orange">{line.substring(4)}</h3>;
        if (line.startsWith('## ')) return <h2 key={index} className="text-lg font-bold mt-4 mb-2 text-primary-orange">{line.substring(3)}</h2>;
        if (line.startsWith('# ')) return <h1 key={index} className="text-xl font-bold mt-4 mb-2">{line.substring(2)}</h1>;
        if (line.startsWith('* ')) return <li key={index} className="ml-5 list-disc">{line.substring(2)}</li>;
        if (line.trim() === '') return <br key={index} />;
        return <p key={index} className="mb-2">{line}</p>;
      });
  };

  return (
    <div className="w-full max-w-2xl h-[70vh] p-1 rounded-2xl border flex flex-col pointer-events-auto
      bg-light-glass-bg/60 border-light-border
      dark:bg-dark-glass-bg/50 dark:border-dark-border
      backdrop-blur-xl shadow-2xl">
      
      <div className="p-4 border-b border-light-border/50 dark:border-dark-border/50 flex-shrink-0">
          <h3 className="font-bold">Daily Intelligence Briefing</h3>
          <p className="text-sm opacity-70">Summary for {new Date().toLocaleDateString()}</p>
      </div>

      <div className="flex-grow p-6 overflow-y-auto text-sm">
        {summary ? renderMarkdown(summary) : <p className="italic opacity-70">Generating summary...</p>}
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

export default DailySummaryCard;
