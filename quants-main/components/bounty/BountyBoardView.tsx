/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useAutonomyStore } from '../../lib/state/autonomy';
import CreateBountyPanel from './CreateBountyPanel';
import styles from './Bounty.module.css';

export default function BountyBoardView() {
  const { bounties } = useAutonomyStore();

  const activeBounties = bounties.filter(b => b.status === 'active');
  const completedBounties = bounties.filter(b => b.status === 'completed');

  return (
    <div className={styles.bountyBoardView}>
      <h2>Bounty Board</h2>
      <div className={styles.bountyBoardGrid}>
        <div className={styles.bountyListContainer}>
          <h3>Active Bounties</h3>
          {activeBounties.length > 0 ? (
            <div className={styles.bountyList}>
              {activeBounties.map(bounty => (
                <div key={bounty.id} className={styles.bountyItem}>
                  <p className={styles.bountyObjective}>{bounty.objective}</p>
                  <div className={styles.bountyReward}>
                    <span className="icon">redeem</span>
                    <span>{bounty.reward.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No active bounties. Create one to give your agent a mission!</p>
          )}

          <h3 style={{ marginTop: '20px' }}>Completed Bounties</h3>
          {completedBounties.length > 0 ? (
            <div className={styles.bountyList}>
              {completedBounties.map(bounty => (
                <div key={bounty.id} className={`${styles.bountyItem} ${styles.completed}`}>
                  <p className={styles.bountyObjective}>{bounty.objective}</p>
                  <div className={styles.bountyReward}>
                    <span className="icon">redeem</span>
                    <span>{bounty.reward.toLocaleString()}</span>
                  </div>
                   <div className={`${styles.bountyStatus} ${styles.completed}`}>
                        <span className="icon">check_circle</span>
                        <span>Completed</span>
                    </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No bounties completed yet.</p>
          )}
        </div>
        <CreateBountyPanel />
      </div>
    </div>
  );
}