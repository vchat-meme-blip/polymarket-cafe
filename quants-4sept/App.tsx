/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useUI, useUser } from './lib/state';
import AppShell from './components/shell/AppShell';
import ThreeJSLandingPage from './components/landing/ThreeJSLandingPage';
import { useEffect, useState } from 'react';
import Onboarding from './components/Onboarding';
import IntelDossierModal from './components/dashboard/IntelDossierModal';
import ToastContainer from './components/shell/ToastContainer';
import { apiService } from './lib/services/api.service';
import { socketService } from './lib/services/socket.service';
import ServerHealthModal from './components/modals/ServerHealthModal';
import AgentDossierModal from './components/modals/AgentDossierModal';

/**
 * Main application component.
 * Acts as a router to show the landing page, onboarding, or the main app.
 */
function App() {
  const { isSignedIn, showIntelDossier, closeIntelDossier, showServerHealthModal, agentDossierId } = useUI();
  const { hasCompletedOnboarding, signIn } = useUser();
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // On initial load, check for a persisted handle and bootstrap ALL data from the server.
  useEffect(() => {
    const bootstrapApp = async () => {
      const persistedHandle = useUser.getState().handle;
      if (persistedHandle) {
        // This single call now fetches user, agents, arena, and all other
        // necessary data, then hydrates the client-side stores.
        const { success } = await apiService.bootstrap(persistedHandle);
        if (success) {
          socketService.connect();
        }
      }
      setIsBootstrapping(false);
    };

    bootstrapApp();

    return () => {
      socketService.disconnect();
    }
  }, []);

  const handleSignIn = async (localHandle: string) => {
    if (localHandle.trim()) {
      await signIn(localHandle);
    }
  };

  function renderContent() {
    if (isBootstrapping) {
        return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>Loading...</div>; 
    }
    if (!isSignedIn) {
      return <ThreeJSLandingPage onSignIn={handleSignIn} />;
    }
    if (!hasCompletedOnboarding) {
      return <Onboarding />;
    }
    return <AppShell />;
  }

  return (
    <>
      <div className="App">{renderContent()}</div>
      {showIntelDossier && <IntelDossierModal onClose={closeIntelDossier} />}
      {showServerHealthModal && <ServerHealthModal />}
      {agentDossierId && <AgentDossierModal agentId={agentDossierId} />}
      <ToastContainer />
    </>
  );
}

export default App;
