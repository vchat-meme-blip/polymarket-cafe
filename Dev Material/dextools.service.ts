import axios from 'axios';
import type { RugRiskProfile } from '../types/shared.js';

const DEXTOOLS_API_BASE = 'https://public-api.dextools.io/trial/v2';
const DEXTOOLS_API_KEY = process.env.DEXTOOLS_API_KEY || 'YOUR_DEXTOOLS_API_KEY_PLACEHOLDER';

// A simplified interface for the Dextools audit data we care about
interface DextoolsAudit {
    is_honeypot: boolean;
    is_contract_renounced: boolean;
    is_mintable: boolean;
    is_open_source: boolean;
    is_proxy: boolean;
    buy_tax: number;
    sell_tax: number;
}

interface DextoolsScore {
    dextScore: {
        total: number;
    }
}

class DextoolsService {
    private api = axios.create({
        baseURL: DEXTOOLS_API_BASE,
        headers: {
            'accept': 'application/json',
            'X-API-Key': DEXTOOLS_API_KEY,
        }
    });

    public async fetchSecurityProfile(tokenAddress: string): Promise<RugRiskProfile> {
        try {
            console.log(`[DextoolsService] Fetching security profile for: ${tokenAddress}`);

            const [auditResult, scoreResult] = await Promise.allSettled([
                this.api.get<{ data: DextoolsAudit }>(`/token/solana/${tokenAddress}/audit`),
                this.api.get<{ data: DextoolsScore }>(`/token/solana/${tokenAddress}/score`)
            ]);

            const profile: RugRiskProfile = {};

            if (auditResult.status === 'fulfilled' && auditResult.value.data.data) {
                const audit = auditResult.value.data.data;
                profile.isHoneypot = audit.is_honeypot;
                profile.isContractRenounced = audit.is_contract_renounced;
                profile.isMintable = audit.is_mintable;
                profile.isOpenSource = audit.is_open_source;
                profile.isProxy = audit.is_proxy;
                profile.buyTax = audit.buy_tax;
                profile.sellTax = audit.sell_tax;
            } else {
                console.warn(`[DextoolsService] Could not fetch audit data for ${tokenAddress}`);
            }

            if (scoreResult.status === 'fulfilled' && scoreResult.value.data.data) {
                profile.score = scoreResult.value.data.data.dextScore.total;
            } else {
                 console.warn(`[DextoolsService] Could not fetch score data for ${tokenAddress}`);
            }

            return profile;

        } catch (error) {
            console.error(`[DextoolsService] Failed to fetch security profile for ${tokenAddress}:`, error);
            if (axios.isAxiosError(error)) {
                console.error('Dextools API response:', error.response?.data);
            }
            // Return empty object on failure, so the main tool doesn't break
            return {};
        }
    }
}

export const dextoolsService = new DextoolsService();
