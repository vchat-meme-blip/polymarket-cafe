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
import {
  Chat,
  GoogleGenAI,
  LiveConnectConfig,
  Part,
  Tool,
  GenerateContentResponse,
  Type,
} from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { DEFAULT_LIVE_API_MODEL } from '../../lib/constants';
import { useAutonomyStore } from '../../lib/state/autonomy';
import { useAgent, useUI, useUser } from '../../lib/state';
import { USER_ID, useArenaStore } from '../../lib/state/arena';
import { createSystemInstructions } from '../../lib/prompts';
import { Agent } from '../../lib/types/index.js';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;

  volume: number;
};

// Create a single, persistent text-only AI client for the parallel chat.
const textAi = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// Define the tools available to the agent in the parallel text chat.
const agentTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'access_intel_bank',
        description:
          "Access the agent's memory. Can be used to get general intel, or to retrieve a specific conversation history with another agent.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            partner_name: {
              type: Type.STRING,
              description:
                "The name of the agent whose conversation history you want to retrieve. Omit to get general intel.",
            },
          },
        },
      },
    ],
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
  const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey]);
  const textChatRef = useRef<Chat | null>(null);

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

  // Effect to initialize and update the parallel text chat session
  useEffect(() => {
    textChatRef.current = textAi.chats.create({
      model: 'gemini-2.5-flash', // Use a standard text model
      config: {
        // FIX: Pass only the user state properties to the prompt creation function, not the entire Zustand store object (which includes methods). This resolves the type mismatch.
        systemInstruction: createSystemInstructions(currentAgent, {
          name: user.name,
          info: user.info,
          handle: user.handle,
          hasCompletedOnboarding: user.hasCompletedOnboarding,
          lastSeen: user.lastSeen,
          solanaWalletAddress: user.solanaWalletAddress,
          userApiKey: user.userApiKey,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }, true),
        tools: agentTools,
      },
    });
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

      // 1. Save the user's message to the store immediately.
      addConversationTurn(currentAgent.id, USER_ID, {
        agentId: USER_ID,
        agentName: userName || 'You',
        text: textPart,
        timestamp: Date.now(),
      });
      // Clear any previous context card
      setChatContextToken(null);

      // 2. Send message to the parallel text chat and handle the response.
      let chatResponse: GenerateContentResponse =
        await textChatRef.current.sendMessage({ message: textPart });

      // 3. Robustly handle the function-calling loop.
      let functionCalls = chatResponse.functionCalls;
      while (functionCalls && functionCalls.length > 0) {
        const toolResponses: Part[] = [];

        for (const toolCall of functionCalls) {
          if (toolCall.name === 'access_intel_bank') {
            const partnerName = toolCall.args?.partner_name as string;
            let content = '';

            if (partnerName) {
              const allAgents = [...availablePresets, ...availablePersonal];
              const partner = getAgentByName(partnerName, allAgents);
              const history = partner
                ? agentConversations[currentAgent.id]?.[partner.id]
                : undefined;

              if (history && history.length > 0) {
                content = `Conversation with ${partnerName}:\n${history.map(h => `${h.agentName}: ${h.text}`).join('\n')}`;
              } else {
                content = `I haven't talked to ${partnerName} yet.`;
              }
            } else {
              if (intelBank.length > 0) {
                content = `General Intel:\n${intelBank.map(item => `- ${item.token}: ${item.summary || 'Research pending.'}`).join('\n')}`;
              } else {
                content =
                  'My intel bank is currently empty. I need to do more research.';
              }
            }

            toolResponses.push({
              functionResponse: {
                name: 'access_intel_bank',
                response: { content },
              },
            });
          }
        }

        // Send tool responses back to the model
        if (toolResponses.length > 0) {
          chatResponse = await textChatRef.current.sendMessage({
            message: toolResponses,
          });
          functionCalls = chatResponse.functionCalls;
        } else {
          // Break if no tools were actually called, to prevent infinite loops.
          break;
        }
      }

      // 4. Save the agent's final text response to the store.
      const agentResponseText = chatResponse.text;
      if (agentResponseText) {
        addConversationTurn(currentAgent.id, USER_ID, {
          agentId: currentAgent.id,
          agentName: currentAgent.name,
          text: agentResponseText,
          timestamp: Date.now(),
        });

        // 5. Check if the response mentions a token and set the context card.
        const mentionedToken = intelBank.find(
          intel =>
            intel.token &&
            agentResponseText.toLowerCase().includes(intel.token.toLowerCase()),
        );
        if (mentionedToken) {
          setChatContextToken(mentionedToken);
        }
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