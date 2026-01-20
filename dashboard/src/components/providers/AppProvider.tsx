'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { AnthropicApiKeyModal, useAnthropicApiKey } from '../AnthropicApiKeyModal';
import { RileyProvider } from './RileyContext';

interface AppContextType {
  hasAnthropicKey: boolean | null;
  showApiKeyModal: () => void;
  hideApiKeyModal: () => void;
  refreshAnthropicKey: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const { hasKey, isChecking, refreshKey } = useAnthropicApiKey();
  const [showModal, setShowModal] = useState(false);
  const [hasShownInitialModal, setHasShownInitialModal] = useState(false);

  // Check if we should show the modal on initial load
  useEffect(() => {
    if (!isChecking && !hasKey && !hasShownInitialModal) {
      // Check if user has dismissed the modal before
      const dismissed = localStorage.getItem('riley_api_key_modal_dismissed');
      if (!dismissed) {
        // Small delay to let the app render first
        const timer = setTimeout(() => {
          setShowModal(true);
          setHasShownInitialModal(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [isChecking, hasKey, hasShownInitialModal]);

  const handleClose = () => {
    setShowModal(false);
    // Mark as dismissed so we don't show again on every page load
    localStorage.setItem('riley_api_key_modal_dismissed', 'true');
  };

  const handleSuccess = () => {
    refreshKey();
    // Clear dismissed flag since they now have a key
    localStorage.removeItem('riley_api_key_modal_dismissed');
  };

  const showApiKeyModal = () => setShowModal(true);
  const hideApiKeyModal = () => setShowModal(false);

  return (
    <AppContext.Provider
      value={{
        hasAnthropicKey: hasKey,
        showApiKeyModal,
        hideApiKeyModal,
        refreshAnthropicKey: refreshKey,
      }}
    >
      <RileyProvider>
        {children}
        <AnthropicApiKeyModal
          isOpen={showModal}
          onClose={handleClose}
          onSuccess={handleSuccess}
          isInitialSetup={!hasKey}
        />
      </RileyProvider>
    </AppContext.Provider>
  );
}

export default AppProvider;
