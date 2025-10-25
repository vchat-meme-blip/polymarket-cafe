/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Added missing `React` import to resolve namespace errors.
import React from 'react';
import { useState } from 'react';
import { useAutonomyStore } from '../../lib/state/autonomy';
import styles from './Bounty.module.css';

export default function CreateBountyPanel() {
  const [objective, setObjective] = useState('');
  const [reward, setReward] = useState(100);
  const { addBounty } = useAutonomyStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (objective.trim() && reward > 0) {
      addBounty(objective, reward);
      setObjective('');
      setReward(100);
    }
  };

  return (
    <div className={styles.createBountyPanel}>
      <h3>Post a New Bounty</h3>
      <form onSubmit={handleSubmit} className={styles.createBountyForm}>
        <div className={styles.formGroup}>
          <label htmlFor="objective">Objective</label>
          <textarea
            id="objective"
            rows={4}
            value={objective}
            onChange={e => setObjective(e.target.value)}
            placeholder="e.g., Find the next 100x memecoin"
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="reward">Reward</label>
          <div className={styles.rewardInputGroup}>
            <input
              id="reward"
              type="number"
              value={reward}
              onChange={e => setReward(Number(e.target.value))}
              min="1"
              required
            />
            <span className={styles.currencyLabel}>BOX</span>
          </div>
        </div>
        <button type="submit" className="button" disabled={!objective.trim()}>
          Post Bounty
        </button>
      </form>
    </div>
  );
}