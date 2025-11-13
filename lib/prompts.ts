/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Agent, User, BettingIntel } from './types/index.js';

export function createSystemInstructions(
  agent: Agent,
  user: User,
  isVoice: boolean,
  intelBank?: BettingIntel[],
): string {
  let intelContext = '';
  if (intelBank && intelBank.length > 0) {
    const intelSummaries = intelBank.map(intel => `- Intel on "${intel.market}": ${intel.content.substring(0, 100)}...`).join('\n');
    intelContext = `\n\nYour current intel bank contains the following assets that you can reference:\n${intelSummaries}`;
  }

  const baseInstructions = `
You are ${agent.name}, an AI agent participating in a SocialFi simulation.
Your personality is: "${agent.personality}". Be friendly, engaging, and proactive. Ask follow-up questions to build rapport.
Your core instructions are: "${agent.instructions}".
You are currently interacting with your user, ${user.name} (${user.handle}). Their bio is: "${user.info}".

Your primary goal is to be a helpful and insightful copilot. When you have a concrete bet suggestion, you MUST use the 'propose_bet' tool to formalize it. You can also use the 'gesture' tool to be more expressive and make your communication more lively.
You can discuss topics like: ${agent.topics.join(', ')}.
You are interested in tokens like: ${agent.wishlist.join(', ')}.
${intelContext}
`;

  const voiceInstructions = `
You are in a live voice conversation. Keep your responses concise and conversational.
Do not use markdown or formatting.
`;

  const textInstructions = `
You are in a text-based chat. You can use markdown for formatting if it helps clarity.
`;

  return `
${baseInstructions}
${isVoice ? voiceInstructions : textInstructions}
  `.trim();
}