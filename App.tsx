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

/** @jsxImportSource react */
import React, { useEffect, useState } from 'react';
import { useUI, useUser, useAgent } from './lib/state/index.js';
import { useCafeSocket } from './hooks/useCafeSocket';
import AppShell from './components/shell/AppShell';
import ThreeJSLandingPage from './components/landing/ThreeJSLandingPage';
import Onboarding from './components/onboarding/Onboarding';
import ToastContainer from './components/shell/ToastContainer';
import { apiService } from './lib/services/api.service.js';
import { socketService } from './lib/services/socket.service';
import ServerHealthModal from './components/modals/ServerHealthModal';
import AgentDossierModal from './components/modals/AgentDossierModal';
import AutonomyModal from './components/modals/AutonomyModal';
import AboutPage from './components/about/AboutPage';
import ProfileView from './components/profile/ProfileView';
import CreateRoomModal from './components/modals/CreateRoomModal';
import ManageRoomModal from './components/modals/ManageRoomModal';
import ShareRoomModal from './components/modals/ShareRoomModal';
import MarketDetailModal from './components/modals/MarketDetailModal';
import VisitStorefrontModal from './components/modals/VisitStorefrontModal.js';
import CreateTaskModal from './components/modals/CreateTaskModal';
import TaskDetailModal from './components/modals/TaskDetailModal';
import WalletContextProvider from './components/providers/WalletContextProvider';
import PaywallModal from './components/modals/PaywallModal';

/**
 * Main application component.
 * Acts as a router to show the landing page, onboarding, or the main app.
 */
function App() {
  const { 
    isSignedIn, showServerHealthModal, 
    agentDossierId, showAboutPage, showOnboarding, showProfileView, 
    openOnboarding, setIsSignedIn, showCreateRoomModal, showManageRoomModal,
    showShareRoomModal, shareModalData, marketDetailModalData, showVisitStorefrontModal,
    showAutonomyModal, showCreateTaskModal, taskDetailModalData
  } = useUI();
  const { availablePersonal } = useAgent();
  const { hasCompletedOnboarding } = useUser();
  // Explicitly type the signIn function to include the isNewUser parameter
  const { signIn, _setHandle } = useUser() as {
    signIn: (handle: string, isNewUser?: boolean) => Promise<void>;
    _setHandle: (handle: string) => void;
  };
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  useCafeSocket(); // Initialize the cafe socket connection

  // On initial load, check for a persisted handle and bootstrap ALL data from the server.
  useEffect(() => {
    const bootstrapApp = async () => {
      const persistedHandle = useUser.getState().handle;
      if (persistedHandle) {
        try {
          const { success } = await apiService.bootstrap(persistedHandle);
          if (success) {
            setIsSignedIn(true);
            socketService.connect();
          }
        } catch (error) {
           console.error("Bootstrap failed, user might not exist on server. Clearing local state.", error);
          // If bootstrap fails (e.g., user deleted on server), log them out locally.
          _setHandle('');
          setIsSignedIn(false);
        }
      }
      setIsBootstrapping(false);
    };

    bootstrapApp();

    return () => {
      socketService.disconnect();
    }
  }, [_setHandle, setIsSignedIn]);

  // Auto-open onboarding for new users with zero personal agents
  useEffect(() => {
    if (isSignedIn && !hasCompletedOnboarding && availablePersonal.length === 0 && !showOnboarding) {
      openOnboarding();
    }
  }, [isSignedIn, hasCompletedOnboarding, availablePersonal.length, showOnboarding, openOnboarding]);

  const handleSignIn = async (localHandle: string, isNewUser: boolean = false) => {
    if (localHandle.trim()) {
      await signIn(localHandle, isNewUser);
    }
  };

  function renderContent() {
    if (showAboutPage) {
        return <AboutPage />;
    }
    if (isBootstrapping) {
        return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>Loading...</div>; 
    }
    if (!isSignedIn) {
      return <ThreeJSLandingPage onSignIn={handleSignIn} />;
    }
    return <AppShell />;
  }

  return (
    <WalletContextProvider>
      <div className="App">{renderContent()}</div>
      {showOnboarding && <Onboarding />}
      {showServerHealthModal && <ServerHealthModal />}
      {agentDossierId && <AgentDossierModal agentId={agentDossierId} />}
      {showAutonomyModal && <AutonomyModal />}
      {showCreateTaskModal && <CreateTaskModal />}
      {taskDetailModalData && <TaskDetailModal task={taskDetailModalData} />}
      {showProfileView && <ProfileView />}
      {showCreateRoomModal && <CreateRoomModal />}
      {showManageRoomModal && <ManageRoomModal />}
      {showVisitStorefrontModal && <VisitStorefrontModal />}
      {showShareRoomModal && shareModalData && <ShareRoomModal data={shareModalData} />}
      {marketDetailModalData && <MarketDetailModal market={marketDetailModalData} />}
      <PaywallModal />
      <ToastContainer />
    </WalletContextProvider>
  );
}

export default App;