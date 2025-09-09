import React from 'react';
import { clearToolResults } from '../../services/state.actions.js';
import { DevTraceResult, DevWalletActivity } from '../../core/types.js';

interface DevWalletTraceCardProps {
  result: DevTraceResult;
}

const ActivityItem: React.FC<{ activity: DevWalletActivity }> = ({ activity }) => {
    const riskColor = activity.risk === 'High' ? 'border-red-500/50 bg-red-500/10' :
                      activity.risk === 'Medium' ? 'border-yellow-500/50 bg-yellow-500/10' :
                      'border-transparent';
    const riskIcon = activity.risk === 'High' ? 'fa-biohazard text-red-400' :
                     activity.risk === 'Medium' ? 'fa-exclamation-triangle text-yellow-400' :
                     'fa-info-circle text-gray-400';
    return (
        <div className={`p-2 rounded-md text-xs ${riskColor}`}>
            <div className="flex items-center gap-2 font-mono opacity-70 text-xs mb-1">
                 <i className={`fa-solid ${riskIcon}`}></i>
                 <span>{new Date(activity.timestamp).toLocaleString()}</span>
            </div>
            <p className="text-sm">{activity.description}</p>
        </div>
    );
}

const DevWalletTraceCard: React.FC<DevWalletTraceCardProps> = ({ result }) => {
  const { creatorWallet, activities, riskSummary } = result;

  return (
    <div className="w-full max-w-lg h-[70vh] p-1 rounded-2xl border flex flex-col pointer-events-auto
      bg-light-glass-bg/60 border-light-border
      dark:bg-dark-glass-bg/50 dark:border-dark-border
      backdrop-blur-xl shadow-2xl">
      
      <div className="p-4 border-b border-light-border/50 dark:border-dark-border/50 flex-shrink-0">
          <h3 className="font-bold">Developer Wallet Trace</h3>
          <p className="text-sm opacity-70 font-mono truncate" title={creatorWallet}>Creator: {creatorWallet}</p>
      </div>

      <div className="flex-grow p-4 overflow-y-auto">
        <div className="p-3 bg-black/10 dark:bg-white/5 rounded-lg mb-4">
            <h4 className="text-sm font-bold uppercase tracking-wider opacity-60 mb-2">Risk Summary</h4>
            <p className="text-sm">{riskSummary}</p>
        </div>
        <h4 className="text-sm font-bold uppercase tracking-wider opacity-60 mb-2">Recent Activity</h4>
        <div className="space-y-2">
            {activities.length > 0 ? (
                activities.map((activity, index) => <ActivityItem key={index} activity={activity} />)
            ) : (
                 <p className="text-sm italic opacity-70 text-center py-4">No significant token transfers found from the creator wallet in the last 7 days.</p>
            )}
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

export default DevWalletTraceCard;