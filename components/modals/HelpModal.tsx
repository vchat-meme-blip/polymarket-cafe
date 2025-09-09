/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '../../lib/state';
import Modal from '../Modal';
import { useEffect, useState } from 'react';
import styles from './Modals.module.css';

// Basic markdown to HTML renderer
const renderMarkdown = (text: string) => {
  return text
    .split('---') // Split by the horizontal rule
    .map((section, sectionIndex) => (
      <div key={sectionIndex} className={styles.helpSection}>
        {section.split('\n').map((line, lineIndex) => {
          if (line.startsWith('## ')) return <h2 key={lineIndex}>{line.substring(3)}</h2>;
          if (line.startsWith('-   **')) {
             const parts = line.substring(5).split(':**');
             return <p key={lineIndex}><strong>{parts[0]}:</strong>{parts[1]}</p>;
          }
          if (line.startsWith('- ')) return <li key={lineIndex}>{line.substring(2)}</li>;
          if (line.startsWith('# ')) return <h1 key={lineIndex}>{line.substring(2)}</h1>;
          return <p key={lineIndex}>{line}</p>;
        })}
      </div>
    ));
};

export default function HelpModal() {
  const { closeHelpModal } = useUI();
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/FEATURES.md')
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load FEATURES.md", err);
        setContent("Could not load help content.");
        setIsLoading(false);
      });
  }, []);

  return (
    <Modal onClose={closeHelpModal}>
      <div className={`${styles.helpModal} ${styles.modalContentPane}`}>
        {isLoading ? (
          <p>Loading help...</p>
        ) : (
          renderMarkdown(content)
        )}
      </div>
    </Modal>
  );
}