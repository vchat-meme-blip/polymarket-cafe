
import React from 'react';
import { Tweet } from '../../core/types.js';
import TweetCard from './TweetCard.js';
import { clearToolResults } from '../../services/state.actions.js';

interface TweetStreamPayload {
    query: string;
    tweets: Tweet[];
}

interface TweetStreamCardProps {
  result: TweetStreamPayload;
}

const TweetStreamCard: React.FC<TweetStreamCardProps> = ({ result }) => {
  const { query, tweets } = result;

  return (
    <div className="w-full max-w-lg h-[60vh] p-1 rounded-2xl border flex flex-col pointer-events-auto
      bg-light-glass-bg/60 border-light-border
      dark:bg-dark-glass-bg/50 dark:border-dark-border
      backdrop-blur-xl shadow-2xl">
      
      <div className="p-4 border-b border-light-border/50 dark:border-dark-border/50 flex-shrink-0">
          <h3 className="font-bold">Twitter Search Results</h3>
          <p className="text-sm opacity-70 truncate">Showing results for: "{query}"</p>
      </div>

      <div className="flex-grow p-4 overflow-y-auto space-y-3">
        {tweets.length > 0 ? (
            tweets.map((tweet) => <TweetCard key={tweet.url} tweet={tweet} />)
        ) : (
            <div className="text-center py-10 opacity-70">
                <i className="fa-solid fa-ghost text-4xl mb-2"></i>
                <p>No tweets found for this query.</p>
            </div>
        )}
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

export default TweetStreamCard;
