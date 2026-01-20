'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Types for Riley's activity context
interface RecentSearch {
  query: string;
  resultCount: number;
  timestamp: string;
}

interface PipelineCandidate {
  name: string;
  title: string;
  company: string;
  score: number;
  recommendation: string;
  stage: string;
}

interface ActivityLog {
  type: string;
  description: string;
  timestamp: string;
}

interface RileyContextType {
  // Recent searches performed in this session
  recentSearches: RecentSearch[];
  addSearch: (query: string, resultCount: number) => void;

  // Candidates currently in the pipeline
  candidatesInPipeline: PipelineCandidate[];
  setCandidatesInPipeline: (candidates: PipelineCandidate[]) => void;

  // Pending approvals count
  pendingApprovals: number;
  setPendingApprovals: (count: number) => void;

  // Recent activity log
  recentActivity: ActivityLog[];
  logActivity: (type: string, description: string) => void;

  // Current job requisition context
  currentJobRequisition: Record<string, unknown> | null;
  setCurrentJobRequisition: (requisition: Record<string, unknown> | null) => void;

  // Get context for chat
  getChatContext: () => {
    recentSearches: RecentSearch[];
    candidatesInPipeline: PipelineCandidate[];
    pendingApprovals: number;
    recentActivity: ActivityLog[];
    jobRequisition?: Record<string, unknown>;
  };
}

const RileyContext = createContext<RileyContextType | null>(null);

export function useRileyContext() {
  const context = useContext(RileyContext);
  if (!context) {
    throw new Error('useRileyContext must be used within a RileyProvider');
  }
  return context;
}

interface RileyProviderProps {
  children: ReactNode;
}

export function RileyProvider({ children }: RileyProviderProps) {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [candidatesInPipeline, setCandidatesInPipeline] = useState<PipelineCandidate[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [currentJobRequisition, setCurrentJobRequisition] = useState<Record<string, unknown> | null>(null);

  const logActivity = useCallback((type: string, description: string) => {
    const newActivity: ActivityLog = {
      type,
      description,
      timestamp: new Date().toLocaleString(),
    };
    setRecentActivity(prev => [newActivity, ...prev].slice(0, 20)); // Keep last 20 activities
  }, []);

  const addSearch = useCallback((query: string, resultCount: number) => {
    const newSearch: RecentSearch = {
      query,
      resultCount,
      timestamp: new Date().toLocaleString(),
    };
    setRecentSearches(prev => [newSearch, ...prev].slice(0, 10)); // Keep last 10 searches

    // Also log as activity
    logActivity('Search', `Searched for "${query}" - found ${resultCount} candidates`);
  }, [logActivity]);

  const getChatContext = useCallback(() => {
    return {
      recentSearches,
      candidatesInPipeline,
      pendingApprovals,
      recentActivity,
      ...(currentJobRequisition && { jobRequisition: currentJobRequisition }),
    };
  }, [recentSearches, candidatesInPipeline, pendingApprovals, recentActivity, currentJobRequisition]);

  return (
    <RileyContext.Provider
      value={{
        recentSearches,
        addSearch,
        candidatesInPipeline,
        setCandidatesInPipeline,
        pendingApprovals,
        setPendingApprovals,
        recentActivity,
        logActivity,
        currentJobRequisition,
        setCurrentJobRequisition,
        getChatContext,
      }}
    >
      {children}
    </RileyContext.Provider>
  );
}
