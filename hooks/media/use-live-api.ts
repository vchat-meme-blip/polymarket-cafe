/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient, UserTurn } from '../../lib/genai-live-client';
import OpenAI from 'openai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { DEFAULT_LIVE_API_MODEL } from '../../lib/constants';
import { useAutonomyStore } from '../../lib/state/autonomy';
import { useAgent, useUI, useUser } from '../../lib/state/index.js';
import { USER_ID, useArenaStore } from '../../lib/state/arena';
import { createSystemInstructions } from '../../lib/prompts';
import { Agent } from '../../lib/types/index.js';
import { LiveConnectConfig } from '@google/genai';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;

  volume: number;
};

// Define the tools available to the agent in the parallel text chat, using OpenAI's format.
const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
        name: 'access_intel_bank',
        description:
          "Access the agent's memory. Can be used to get general intel, or to retrieve a specific conversation history with another agent.",
        parameters: {
          type: 'object',
          properties: {
            partner_name: {
              type: 'string',
              description:
                "The name of the agent whose conversation history you want to retrieve. Omit to get general intel.",
            },
          },
        },
      },
  },
];

function getAgentByName(
  name: string,
  allAgents: Agent[],
): Agent | undefined {
  const normalizedName = name.toLowerCase().trim();
  return allAgents.find(
    agent => agent.name.toLowerCase().trim() === normalizedName,
  );
}

export function useLiveApi({
  apiKey,
  model = DEFAULT_LIVE_API_MODEL,
}: {
  apiKey: string;
  model?: string;
}): UseLiveApiResults {
  const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);
  const textChatRef = useRef<{ openai: OpenAI; messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] } | null>(null);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const { intelBank } = useAutonomyStore();
  const {
    current: currentAgent,
    availablePersonal,
    availablePresets,
  } = useAgent();
  const user = useUser();
  const { name: userName } = useUser();
  const { addConversationTurn, agentConversations } = useArenaStore();
  const { setChatContextToken } = useUI();

  // Effect to initialize and update the parallel text chat session using OpenAI
  useEffect(() => {
    // FIX: Add a check for user.userApiKey as it is an optional property on the User type. This resolves the TypeScript error indicating the property does not exist.
    const openai = new OpenAI({ 
        apiKey: user.userApiKey || process.env.GEMINI_API_KEY || '', // Fallback for server key
        dangerouslyAllowBrowser: true 
    });
    const systemInstruction = createSystemInstructions(currentAgent, user, true);

    textChatRef.current = {
        openai,
        messages: [{ role: 'system', content: systemInstruction }],
    };
  }, [currentAgent, user]);

  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {})
          .catch(err => {
            console.error('Error adding worklet:', err);
          });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    const stopAudioStreamer = () => audioStreamerRef.current?.stop();
    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    const onUserTurn = async (turn: UserTurn) => {
      const textPart = turn.parts?.find(p => p.text)?.text;
      if (!textPart || !textChatRef.current) return;

      addConversationTurn(currentAgent.id, USER_ID, {
        agentId: USER_ID,
        agentName: userName || 'You',
        text: textPart,
        timestamp: Date.now(),
      });
      setChatContextToken(null);
      
      textChatRef.current.messages.push({ role: 'user', content: textPart });

      try {
        let response = await textChatRef.current.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: textChatRef.current.messages,
            tools: agentTools,
            tool_choice: 'auto'
        });

        let responseMessage = response.choices[0].message;

        while (responseMessage.tool_calls) {
            textChatRef.current.messages.push(responseMessage);
            for (const toolCall of responseMessage.tool_calls) {
                if (toolCall.type !== 'function') continue;
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                let toolContent = '';
                
                if (functionName === 'access_intel_bank') {
                    const partnerName = functionArgs.partner_name;
                    if (partnerName) {
                        const allAgents = [...availablePersonal, ...availablePresets];
                        const partner = getAgentByName(partnerName, allAgents);
                        const history = partner ? agentConversations[currentAgent.id]?.[partner.id] : undefined;
                        toolContent = history ? `Conversation with ${partnerName}:\n${history.map(h => `${h.agentName}: ${h.text}`).join('\n')}` : `I haven't talked to ${partnerName} yet.`;
                    } else {
                        toolContent = intelBank.length > 0 ? `General Intel:\n${intelBank.map(item => `- ${item.market}: ${item.content || 'Research pending.'}`).join('\n')}` : 'My intel bank is currently empty.';
                    }
                }
                
                textChatRef.current.messages.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    content: toolContent,
                });
            }

            response = await textChatRef.current.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: textChatRef.current.messages,
                tools: agentTools,
                tool_choice: 'auto'
            });
            responseMessage = response.choices[0].message;
        }

        const agentResponseText = responseMessage.content;
        if (agentResponseText) {
            textChatRef.current.messages.push({ role: 'assistant', content: agentResponseText });
            addConversationTurn(currentAgent.id, USER_ID, {
                agentId: currentAgent.id,
                agentName: currentAgent.name,
                text: agentResponseText,
                timestamp: Date.now(),
            });

            const mentionedToken = intelBank.find(
                intel => intel.market && agentResponseText.toLowerCase().includes(intel.market.toLowerCase()),
            );
            if (mentionedToken) {
                setChatContextToken(mentionedToken);
            }
        }
      } catch (error) {
          console.error("Error communicating with OpenAI:", error);
           addConversationTurn(currentAgent.id, USER_ID, {
              agentId: 'system',
              agentName: 'System',
              text: 'Sorry, there was an error processing your request.',
              timestamp: Date.now(),
            });
      }
    };

    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('interrupted', stopAudioStreamer);
    client.on('audio', onAudio);
    client.on('userturn', onUserTurn);

    return () => {
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
      client.off('userturn', onUserTurn);
    };
  }, [
    client,
    intelBank,
    currentAgent,
    addConversationTurn,
    userName,
    user,
    agentConversations,
    availablePersonal,
    availablePresets,
    setChatContextToken,
  ]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
    client.disconnect();
    await client.connect(config);
  }, [client, config]);

  const disconnect = useCallback(() => {
    client.disconnect();
    setConnected(false);
  }, [client]);

  return {
    client,
    config,
    setConfig,
    connect,
    connected,
    disconnect,
    volume,
  };
}
