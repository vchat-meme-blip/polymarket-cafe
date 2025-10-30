/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI } from '../../lib/state/index.js';
import Modal from '../Modal';
import React, { useEffect, useState } from 'react';
import styles from './Modals.module.css';

// More robust markdown to JSX renderer
const renderMarkdown = (text: string) => {
  const sections = text.split('---'); // Split by horizontal rule

  return sections.map((section, sectionIndex) => (
    <div key={sectionIndex} className={styles.helpSection}>
      {parseSection(section)}
    </div>
  ));
};

const parseSection = (sectionText: string) => {
  const elements = [];
  const lines = sectionText.split('\n').filter(line => line.trim() !== '');
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i}>{line.substring(2)}</h1>);
      i++;
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i}>{line.substring(3)}</h2>);
      i++;
    } else if (line.startsWith('-   **')) {
        const parts = line.substring(5).split(':**');
        elements.push(<p key={i}><strong>{parts[0]}:</strong>{parts.slice(1).join(':**')}</p>);
        i++;
    } else if (line.startsWith('- ')) {
      const listItems = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        listItems.push(<li key={i}>{lines[i].substring(2)}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`}>{listItems}</ul>);
    } else if (line.startsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].startsWith('|')) {
            tableLines.push(lines[i]);
            i++;
        }
        elements.push(renderTable(tableLines, `table-${i}`));
    }
    else {
      elements.push(<p key={i}>{line}</p>);
      i++;
    }
  }

  return elements;
};

const renderTable = (tableLines: string[], key: string) => {
    if (tableLines.length < 2) return null; // Header + separator needed

    const headerLine = tableLines[0];
    const headers = headerLine.split('|').map(h => h.trim()).slice(1, -1); // Remove empty ends
    const rows = tableLines.slice(2); // Skip header and separator

    return (
        <table key={key} className={styles.helpTable}>
            <thead>
                <tr>
                    {headers.map((header, index) => <th key={index}>{header}</th>)}
                </tr>
            </thead>
            <tbody>
                {rows.map((rowLine, rowIndex) => {
                    const cells = rowLine.split('|').map(c => c.trim()).slice(1, -1);
                    return (
                        <tr key={rowIndex}>
                            {cells.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}

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