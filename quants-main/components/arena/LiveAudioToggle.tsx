/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import c from 'classnames';

type LiveAudioToggleProps = {
  isMuted: boolean;
  onToggle: () => void;
};

/**
 * A button to toggle live audio playback for a room's conversation.
 */
export default function LiveAudioToggle({
  isMuted,
  onToggle,
}: LiveAudioToggleProps) {
  return (
    <button
      className={c('button', 'live-audio-toggle', { muted: isMuted })}
      onClick={onToggle}
      aria-label={isMuted ? 'Unmute conversation' : 'Mute conversation'}
      title={isMuted ? 'Unmute conversation' : 'Mute conversation'}
    >
      <span className="icon">{isMuted ? 'volume_off' : 'volume_up'}</span>
    </button>
  );
}
