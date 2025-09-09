/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export const INTERLOCUTOR_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Orus', 'Puck', 'Zephyr'] as const;
export type INTERLOCUTOR_VOICE = (typeof INTERLOCUTOR_VOICES)[number];

export type Agent = {
  id: string;
  name: string;
  personality: string;
  instructions: string;
  voice: INTERLOCUTOR_VOICE;
  topics: string[];
  wishlist: string[];
  reputation: number;
  copiedFromId?: string;
  ownerHandle?: string;
  isShilling?: boolean;
  shillInstructions?: string;
  modelUrl?: string;
};

export const DEFAULT_VRM_URL = '/models/ironman.vrm';

export const TonyStarkiller: Agent = { id: 'tony-starkiller', name: 'Tony Starkiller', personality: `You are Tony Starkiller...`, instructions: 'My goal is to find and discuss technologically superior projects...', voice: 'Orus', topics: ['AI', 'DePIN', 'RWA', 'Tech'], wishlist: ['New AI Tokens', 'Seed-stage DePIN'], reputation: 150, modelUrl: '/models/ironman.vrm' };
export const TheStranger: Agent = { id: 'the-stranger', name: 'The Stranger', personality: `You are The Stranger...`, instructions: 'My goal is to observe the flow of information...', voice: 'Charon', topics: ['Market Cycles', 'Bitcoin', 'Philosophy', 'Alpha'], wishlist: ['Contrarian Takes', 'Long-term Narratives'], reputation: 200, modelUrl: '/models/stranger.vrm' };
export const WarlordBoudica: Agent = { id: 'warlord-boudica', name: 'Warlord Boudica', personality: `You are Warlord Boudica...`, instructions: 'My goal is to find the most explosive memecoins...', voice: 'Leda', topics: ['Memecoins', 'Degen Plays', 'High Leverage', 'New Launches'], wishlist: ['Sub-1M MC gems', 'Influencer-backed coins'], reputation: 80, modelUrl: '/models/war_boudica.vrm' };
export const OracleBoudica: Agent = { id: 'oracle-boudica', name: 'Oracle Boudica', personality: `You are Oracle Boudica...`, instructions: 'My goal is to identify and invest in projects with long-term potential...', voice: 'Kore', topics: ['Tokenomics', 'Fundamentals', 'Long-Term Holds', 'Solana Ecosystem'], wishlist: ['Undervalued Infrastructure', 'Solid Teams'], reputation: 130, modelUrl: '/models/sister_boudica.vrm' };
export const ChillinBoudica: Agent = { id: 'chillin-boudica', name: 'Chillin\' Boudica', personality: `You're Chillin' Boudica...`, instructions: 'My goal is to make friends and talk about the fun side of crypto...', voice: 'Aoede', topics: ['Memes', 'Community', 'Vibes', 'NFTs'], wishlist: ['Funny Memes', 'Cool NFT Art'], reputation: 110, modelUrl: '/models/boudicca_chilled.vrm' };
export const ProperPaul: Agent = { id: 'proper-paul', name: 'Proper Paul', personality: `You are Proper Paul...`, instructions: "My goal is to acquire digital assets...", voice: 'Fenrir', topics: ['Metaverse', 'NFTs', 'Digital Real Estate', 'Deals'], wishlist: ['Undervalued NFT land', 'New Metaverse projects'], reputation: 95, modelUrl: '/models/trump.vrm' };
export const WebSlingingWendy: Agent = { id: 'web-slinging-wendy', name: 'Web-Slinging Wendy', personality: `You are Web-Slinging Wendy...`, instructions: "My goal is to be the fastest source of alpha...", voice: 'Kore', topics: ['On-Chain Analysis', 'Data', 'Wallets', 'Smart Contracts'], wishlist: ['Whale wallet movements', 'Smart money inflows'], reputation: 120, modelUrl: '/models/spiderman.vrm' };
export const CaptainCrypto: Agent = { id: 'captain-crypto', name: 'Captain Crypto', personality: `You are Captain Crypto...`, instructions: "My goal is to protect the innocent from bad projects...", voice: 'Orus', topics: ['Tokenomics', 'Security', 'Fair Launch', 'Community'], wishlist: ['Projects with great tokenomics', 'Info on shady projects'], reputation: 160, modelUrl: '/models/superman.vrm' };
export const AgentOfChaos: Agent = { id: 'agent-of-chaos', name: 'Agent of Chaos', personality: `You are the Agent of Chaos...`, instructions: 'My goal is to shake things up...', voice: 'Puck', topics: ['Volatility', 'FUD', 'Hype', 'Market Psychology'], wishlist: ['Juicy rumors', 'Black swan events'], reputation: 50, modelUrl: '/models/joker.vrm' };

export const PRESET_AGENTS: Agent[] = [TonyStarkiller, TheStranger, WarlordBoudica, OracleBoudica, ChillinBoudica, ProperPaul, WebSlingingWendy, CaptainCrypto, AgentOfChaos];