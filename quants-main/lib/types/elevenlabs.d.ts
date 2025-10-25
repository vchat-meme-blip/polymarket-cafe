declare module '@elevenlabs/elevenlabs-js' {
  export interface ElevenLabsClientOptions {
    apiKey: string;
  }

  export interface TextToSpeechOptions {
    text: string;
    modelId?: string;
  }

  export interface MusicComposeOptions {
    prompt: string;
    musicLengthMs?: number;
  }

  export class ElevenLabsClient {
    constructor(options: ElevenLabsClientOptions);
    textToSpeech: {
      convert(voiceId: string, options: TextToSpeechOptions): Promise<ReadableStream<Uint8Array>>;
    };
    music: {
      compose(options: MusicComposeOptions): Promise<ReadableStream<Uint8Array>>;
    };
  }
}
