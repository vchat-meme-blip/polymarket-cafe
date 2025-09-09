import React from 'react';
import { Tweet } from '../../core/types.js';

const Stat: React.FC<{ icon: string, value: number }> = ({ icon, value }) => (
    <div className="flex items-center gap-1.5">
        <i className={`fa-solid ${icon}`}></i>
        <span>{Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)}</span>
    </div>
);

const TweetCard: React.FC<{ tweet: Tweet }> = ({ tweet }) => {
    
    const sentimentColor = 
        tweet.sentiment === 'BULLISH' ? 'border-green-500/50 bg-green-500/5' :
        tweet.sentiment === 'BEARISH' ? 'border-red-500/50 bg-red-500/5' :
        'border-transparent';

    return (
        <a href={tweet.url} target="_blank" rel="noopener noreferrer" 
           className={`block p-3 bg-black/5 dark:bg-white/5 rounded-lg border-l-4 transition-all hover:bg-black/10 dark:hover:bg-white/10 ${sentimentColor}`}>
            <div className="flex items-center gap-3 mb-2">
                {tweet.authorImageUrl ?
                    <img src={tweet.authorImageUrl} alt={tweet.author} className="w-8 h-8 rounded-full bg-white/10"/>
                    : <div className="w-8 h-8 rounded-full bg-primary-orange/20 text-primary-orange flex items-center justify-center font-bold text-sm">{tweet.author.charAt(1)}</div>
                }
                <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{tweet.author}</p>
                    <p className="text-xs opacity-60">{tweet.createdAt}</p>
                </div>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{tweet.text}</p>
            <div className="flex items-center gap-4 text-xs opacity-70 mt-3">
                <Stat icon="fa-heart" value={tweet.stats.likes} />
                <Stat icon="fa-retweet" value={tweet.stats.retweets} />
                <Stat icon="fa-comment" value={tweet.stats.replies} />
            </div>
        </a>
    );
};

export default TweetCard;
