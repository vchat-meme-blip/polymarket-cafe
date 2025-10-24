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
    alert("Bounty creation is temporarily disabled.");
    // if (objective.trim() && reward > 0) {
    //   addBounty(objective, reward);
    //   setObjective('');
    //   setReward(100);
    // }
  };

  return (
    <div className={styles.createBountyPanel}>
      <h3>Post a New Bounty</h3>
      <p style={{color: 'var(--Neutral-60)', textAlign: 'center', margin: '20px 0'}}>
        Bounties are temporarily disabled while we upgrade the system.
      </p>
      <form onSubmit={handleSubmit} className={styles.createBountyForm}>
        <div className={styles.formGroup}>
          <label htmlFor="objective">Objective</label>
          <textarea
            id="objective"
            rows={4}
            value={objective}
            onChange={e => setObjective(e.target.value)}
            placeholder="e.g., Find a prediction market with mispriced odds."
            required
            disabled
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
              disabled
            />
            <span className={styles.currencyLabel}>USD</span>
          </div>
        </div>
        <button type="submit" className="button" disabled>
          Post Bounty
        </button>
      </form>
    </div>
  );
}