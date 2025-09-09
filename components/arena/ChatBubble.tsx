/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import c from 'classnames';

type ChatBubbleProps = {
  text: string;
  isShilling?: boolean;
  color: string;
};

/**
 * A chat bubble that appears above an agent's seat in a room.
 */
export default function ChatBubble({
  text,
  isShilling,
  color,
}: ChatBubbleProps) {
  const style = {
    '--agent-color': color,
    '--agent-color-transparent': `${color}33`,
    'background': `linear-gradient(45deg, var(--agent-color-transparent), ${color}, var(--agent-color-transparent))`
  } as React.CSSProperties;

  return (
    <div
      className={c('thoughtBubble', { 'shilling-chat-bubble': isShilling })}
      style={isShilling ? style : { borderColor: color }}
    >
      {text}
    </div>
  );
}
