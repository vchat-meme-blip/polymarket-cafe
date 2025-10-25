/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Arena.module.css';

type CafeMusicControllerProps = {
  roomId: string | null;
};

type Status = 'idle' | 'loading' | 'playing' | 'error';

const DEFAULT_VOLUME = 0.35;

export default function CafeMusicController({ roomId }: CafeMusicControllerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const isMutedRef = useRef(isMuted);

  const cleanupAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.onended = null;
    }
    if (trackUrlRef.current) {
      URL.revokeObjectURL(trackUrlRef.current);
      trackUrlRef.current = null;
    }
    setStatus('idle');
  }, []);

  const fetchAndPlay = useCallback(async (forceRefresh = false) => {
    if (!roomId) {
      cleanupAudio();
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const url = `/api/music/cafe/${roomId}${forceRefresh ? '?refresh=1' : ''}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const promptHeader = response.headers.get('X-Music-Prompt');
      setPrompt(promptHeader ?? 'Cafe ambience');

      if (trackUrlRef.current) {
        URL.revokeObjectURL(trackUrlRef.current);
      }
      const objectUrl = URL.createObjectURL(blob);
      trackUrlRef.current = objectUrl;

      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }

      audio.src = objectUrl;
      audio.loop = false;
      audio.currentTime = 0;
      const muted = isMutedRef.current;
      audio.muted = muted;
      audio.volume = muted ? 0 : DEFAULT_VOLUME;
      audio.onended = () => {
        void fetchAndPlay(true);
      };

      const playPromise = audio.play();
      if (playPromise) {
        await playPromise.catch(err => {
          console.warn('[CafeMusic] Playback was interrupted:', err);
          setError('Playback blocked. Tap refresh after interacting with the page.');
          audio?.pause();
        });
      }

      setStatus(audio.paused ? 'idle' : 'playing');
    } catch (err) {
      console.error('[CafeMusic] Failed to load music track:', err);
      setError(err instanceof Error ? err.message : 'Unexpected error while loading cafe music.');
      setStatus('error');
    }
  }, [cleanupAudio, roomId]);

  useEffect(() => {
    if (!roomId) {
      cleanupAudio();
      setPrompt(null);
      setError(null);
      return;
    }

    void fetchAndPlay(false);

    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio, fetchAndPlay, roomId]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = isMuted;
    audio.volume = isMuted ? 0 : DEFAULT_VOLUME;

    if (!isMuted && audio.paused && trackUrlRef.current) {
      const resume = audio.play();
      resume?.catch(err => {
        console.warn('[CafeMusic] Failed to resume playback:', err);
      });
    }
  }, [isMuted]);

  const handleToggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const handleRefresh = () => {
    void fetchAndPlay(true);
  };

  const renderStatusLabel = () => {
    switch (status) {
      case 'loading':
        return 'Loading music…';
      case 'playing':
        return 'Now playing';
      case 'error':
        return 'Playback error';
      default:
        return roomId ? 'Ready' : 'No room selected';
    }
  };

  return (
    <div className={styles.cafeMusicController}>
      <div className={styles.cafeMusicMeta}>
        <span className="icon">music_note</span>
        <div>
          <p className={styles.cafeMusicStatus}>{renderStatusLabel()}</p>
          {prompt && <p className={styles.cafeMusicPrompt}>{prompt}</p>}
          {error && <p className={styles.cafeMusicError}>{error}</p>}
        </div>
      </div>
      <div className={styles.cafeMusicActions}>
        <button className="button" onClick={handleToggleMute} disabled={!roomId}>
          <span className="icon">{isMuted ? 'volume_off' : 'volume_up'}</span>
          <span className={styles.cafeMusicActionLabel}>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>
        <button
          className={`button secondary ${styles.cafeMusicRefreshButton}`}
          onClick={handleRefresh}
          disabled={!roomId || status === 'loading'}
        >
          <span className="icon">refresh</span>
          <span className={styles.cafeMusicActionLabel}>New Track</span>
        </button>
      </div>
    </div>
  );
}
