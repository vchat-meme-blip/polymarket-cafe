import React from 'react';
import { TrackedToken } from '../../core/types.js';
import { clearToolResults } from '../../services/state.actions.js';

interface RugAlertCardProps {
  token: TrackedToken;
}

const ScoreDial: React.FC<{ score: number }> = ({ score }) => {
    const getScoreColor = (s: number) => {
        if (s >= 75) return 'text-green-500'; // Safe
        if (s >= 50) return 'text-yellow-500'; // Caution
        if (s >= 25) return 'text-orange-500'; // Warning
        return 'text-red-500'; // Danger
    };
    const scoreColor = getScoreColor(score);
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="relative">
            <svg className="w-28 h-28 transform -rotate-90">
                <circle cx="56" cy="56" r="40" stroke="currentColor" strokeWidth="10" className="text-white/10" fill="transparent" />
                <circle cx="56" cy="56" r="40" stroke="currentColor" strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={`${scoreColor} transition-all duration-1000`} fill="transparent" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-3xl font-bold ${scoreColor}`}>{score}</span>
            </div>
        </div>
    );
};

const RiskItem: React.FC<{ label: string; value: boolean | undefined; isBad: boolean, goodText: string, badText: string }> = ({ label, value, isBad, goodText, badText }) => {
    const hasValue = typeof value === 'boolean';
    const finalIsBad = hasValue && isBad;
    const color = finalIsBad ? 'text-red-400' : hasValue ? 'text-green-400' : 'text-gray-500';
    const icon = finalIsBad ? 'fa-xmark-circle' : hasValue ? 'fa-check-circle' : 'fa-question-circle';
    const text = hasValue ? (isBad ? badText : goodText) : 'Unknown';
    
    return (
        <div className={`flex items-center gap-3 p-3 rounded-lg ${finalIsBad ? 'bg-red-500/10' : 'bg-green-500/5'}`}>
            <i className={`fa-solid ${icon} ${color} text-xl w-5 text-center`}></i>
            <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className={`text-xs ${color}`}>{text}</p>
            </div>
        </div>
    );
};

const MetricDisplay: React.FC<{ label: string, value: string, isBad?: boolean }> = ({ label, value, isBad = false }) => (
    <div className={`text-center p-2 rounded-lg ${isBad ? 'bg-red-500/10' : 'bg-green-500/5'}`}>
        <p className="text-xs opacity-70 uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-semibold ${isBad ? 'text-red-400' : 'text-green-400'}`}>{value}</p>
    </div>
);


const RugAlertCard: React.FC<RugAlertCardProps> = ({ token }) => {
  const risk = token.riskProfile;

  return (
    <div className="w-80 flex-shrink-0 mx-4 pointer-events-auto">
        <div className="w-full h-auto p-5 rounded-2xl border flex flex-col gap-4
            bg-red-900/20 border-red-500/30 backdrop-blur-xl shadow-2xl text-white
            bg-gradient-to-br from-gray-900 via-red-900/40 to-gray-900">
        
        <div className="text-center">
            <h3 className="text-xl font-bold text-red-400">Security Analysis</h3>
            <p className="text-sm opacity-80" title={token.name}>${token.symbol}</p>
        </div>

        <div className="flex items-center justify-center p-4">
            <ScoreDial score={risk?.score ?? 0} />
        </div>

        <div className="grid grid-cols-2 gap-2">
            <MetricDisplay 
                label="Top 10 Holders"
                value={`${risk?.holderConcentration?.toFixed(1) ?? 'N/A'}%`}
                isBad={(risk?.holderConcentration ?? 0) > 20}
            />
            <MetricDisplay 
                label="Liquidity / MCAP"
                value={`${risk?.liquidityRatio?.toFixed(1) ?? 'N/A'}%`}
                isBad={(risk?.liquidityRatio ?? 100) < 10}
            />
        </div>
        
        <div className="grid grid-cols-1 gap-2 pt-4 border-t border-white/10">
            <RiskItem label="Honeypot" value={risk?.isHoneypot} isBad={risk?.isHoneypot === true} goodText="No honeypot detected" badText="Honeypot risk detected!" />
            <RiskItem label="Renounced" value={risk?.isContractRenounced} isBad={risk?.isContractRenounced === false} goodText="Contract is renounced" badText="Contract is NOT renounced" />
            <RiskItem label="Mintable" value={risk?.isMintable} isBad={risk?.isMintable === true} goodText="Supply is fixed" badText="New tokens can be minted" />
        </div>
        
        <div className="text-center mt-2">
            <p className="text-xs opacity-60">This is not financial advice. Always DYOR.</p>
            <button
                onClick={clearToolResults}
                className="mt-4 px-4 py-2 text-xs font-semibold rounded-full bg-black/20 hover:bg-black/40"
            >
                Dismiss
            </button>
        </div>
        </div>
    </div>
  );
};

export default RugAlertCard;