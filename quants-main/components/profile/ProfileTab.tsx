/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUser } from '../../lib/state';
import styles from './Profile.module.css';

type ProfileTabProps = {
  onSave: () => void;
};

export default function ProfileTab({ onSave }: ProfileTabProps) {
  const { name, info, handle, setName, setInfo } = useUser();

  return (
    <div className={styles.profileTabContent}>
      <p>
        This is a simple tool that allows you to design, test, and banter with
        custom AI characters on the fly.
      </p>

      <form
        onSubmit={e => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className={styles.userHandleDisplay}>
          Signed in as: <strong>{handle}</strong>
        </div>

        <div>
          <p>Your Display Name</p>
          <input
            type="text"
            name="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="What do you like to be called?"
          />
        </div>

        <div>
          <p>Your Bio / Interests</p>
          <textarea
            rows={3}
            name="info"
            value={info}
            onChange={e => setInfo(e.target.value)}
            placeholder="Things we should know about you… Likes, dislikes, hobbies, interests, favorite movies, books, tv shows, foods, etc."
          />
        </div>

        <button className="button primary">Save Settings</button>
      </form>
    </div>
  );
}