'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  X,
  Edit2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Send,
  User,
  Building,
  MapPin,
  ExternalLink,
  Linkedin,
  Github,
  Loader2,
  AlertCircle,
  MessageSquare,
  UserPlus,
  Mail,
  Trash2,
  Sparkles,
  Brain,
  ClipboardList,
  Link2,
  Copy,
} from 'lucide-react';
import { OutreachProgressModal, type OutreachProgress } from '../../components/OutreachProgressModal';
import {
  TIMING_PROFILES,
  humanLikeDelay,
  incrementConnectionCount,
  incrementInMailCount,
  incrementMessageCount,
  canSendConnection,
  canSendInMail,
  canSendMessage,
  getRemainingAllowance,
  type HumanLikeTimingConfig,
} from '../../lib/humanLikeTiming';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// TYPES
// =============================================================================

interface QueuedCandidate {
  id: string;
  candidateId: string;
  providerId?: string;
  name: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  profileUrl: string;
  profilePictureUrl?: string;
  relevanceScore: number;
  status: 'pending' | 'approved' | 'sent' | 'connection_accepted' | 'pitch_pending' | 'pitch_sent' | 'replied' | 'rejected' | 'failed';
  messageType: 'connection_request' | 'connection_only' | 'inmail' | 'message';
  messageDraft?: string;
  createdAt: string;
  searchCriteria?: {
    jobTitle: string;
    skills: string[];
  };
  errorMessage?: string;
  // Job requisition linkage for assessments
  jobRequisitionId?: string;
  assessmentTemplateId?: string;
  assessmentUrl?: string;
  // Outreach tracking
  trackerId?: string;
  acceptedAt?: string;
  pitchSentAt?: string;
  // Source tracking (linkedin or github)
  source?: 'linkedin' | 'github';
}

interface AssessmentTemplate {
  id: string;
  name: string;
  jobTitle?: string;
  companyName?: string;
  isActive: boolean;
}

interface UnipileConfig {
  apiKey: string;
  dsn: string;
  port: string;
  accountId: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatWaitTime(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const messageTypeLabels: Record<string, { label: string; icon: typeof Send }> = {
  connection_request: { label: 'Connect + Message', icon: UserPlus },
  connection_only: { label: 'Connect (No Message)', icon: UserPlus },
  inmail: { label: 'InMail', icon: Mail },
  message: { label: 'Direct Message', icon: MessageSquare },
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  sent: 'bg-green-100 text-green-800',
  connection_accepted: 'bg-emerald-100 text-emerald-800',
  pitch_pending: 'bg-purple-100 text-purple-800',
  pitch_sent: 'bg-indigo-100 text-indigo-800',
  replied: 'bg-cyan-100 text-cyan-800',
  rejected: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  sent: 'Sent',
  connection_accepted: 'Connected',
  pitch_pending: 'Ready to Pitch',
  pitch_sent: 'Pitch Sent',
  replied: 'Replied',
  rejected: 'Rejected',
  failed: 'Failed',
};

// =============================================================================
// COMPONENT
// =============================================================================

// Outreach flow types for tab organization
type OutreachFlow = 'connection' | 'direct';

function QueuePageContent() {
  const searchParams = useSearchParams();
  const [queue, setQueue] = useState<QueuedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [unipileConfig, setUnipileConfig] = useState<UnipileConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftText, setDraftText] = useState<string>('');
  const [generatingAI, setGeneratingAI] = useState<Set<string>>(new Set());
  const [fetchingAssessment, setFetchingAssessment] = useState<Set<string>>(new Set());
  const [copiedAssessmentLink, setCopiedAssessmentLink] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [assessmentTemplates, setAssessmentTemplates] = useState<AssessmentTemplate[]>([]);
  const [linkingAssessment, setLinkingAssessment] = useState<string | null>(null); // candidate id being linked
  const [sendingPitch, setSendingPitch] = useState<Set<string>>(new Set()); // tracking pitch sends
  const [expandedAwaitingItems, setExpandedAwaitingItems] = useState<Set<string>>(new Set()); // expanded awaiting connection items
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null); // item pending removal confirmation
  // Connection Accepted - pitch editing state
  const [expandedConnectedItems, setExpandedConnectedItems] = useState<Set<string>>(new Set()); // expanded connection accepted items
  const [editingPitchDraft, setEditingPitchDraft] = useState<string | null>(null); // item id being edited
  const [pitchDraftText, setPitchDraftText] = useState<string>(''); // current pitch draft text
  const [generatingPitchPreview, setGeneratingPitchPreview] = useState<Set<string>>(new Set()); // loading state for pitch preview

  // Human-like outreach timing state
  const [showOutreachProgress, setShowOutreachProgress] = useState(false);
  const [outreachProgress, setOutreachProgress] = useState<OutreachProgress>({
    current: 0,
    total: 0,
    status: 'waiting',
    statusMessage: '',
    remainingMs: 0,
    isBreak: false,
    successCount: 0,
    failureCount: 0,
    errors: [],
  });
  const outreachCancelledRef = useRef(false);
  const timingConfig: HumanLikeTimingConfig = TIMING_PROFILES.moderate;

  // Manual sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    syncedAt: string;
    foundTrackers: number;
    updatedItems: number;
    sentItemsChecked: number;
  } | null>(null);

  // Initialize activeFlow from URL params, default to 'connection'
  const initialFlow = searchParams.get('flow') as OutreachFlow | null;
  const [activeFlow, setActiveFlow] = useState<OutreachFlow>(
    initialFlow === 'direct' ? 'direct' : 'connection'
  );

  // Load Unipile config and queue from localStorage on mount
  useEffect(() => {
    loadUnipileConfig();
    loadQueue();
    fetchAssessmentTemplates();
  }, []);

  // Sync queue status with backend every 30 seconds
  // This catches connection acceptances, pitch sends, etc.
  useEffect(() => {
    const syncStatusWithBackend = async () => {
      // Get all provider IDs from queue items that are in "sent" status
      const sentItems = queue.filter(item => item.providerId && item.status === 'sent');
      if (sentItems.length === 0) return;

      const providerIds = sentItems.map(item => item.providerId).filter(Boolean) as string[];

      try {
        const response = await fetch(`${API_BASE}/api/outreach/status-by-providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerIds }),
        });

        if (response.ok) {
          const data = await response.json();
          const statusMap = data.statusMap as Record<string, {
            trackerId: string;
            status: string;
            acceptedAt: string | null;
            pitchSentAt: string | null;
          }>;

          // Update queue items based on backend status
          let hasUpdates = false;
          const updatedQueue = queue.map(item => {
            if (!item.providerId || !statusMap[item.providerId]) return item;

            const backendStatus = statusMap[item.providerId];

            // Map backend status to queue status
            let newStatus: QueuedCandidate['status'] = item.status;
            let trackerId = item.trackerId;

            if (backendStatus.status === 'CONNECTION_ACCEPTED' && item.status === 'sent') {
              newStatus = 'connection_accepted';
              hasUpdates = true;
            } else if (backendStatus.status === 'PITCH_PENDING' && item.status !== 'pitch_pending' && item.status !== 'pitch_sent') {
              newStatus = 'pitch_pending';
              hasUpdates = true;
            } else if (backendStatus.status === 'PITCH_SENT' && item.status !== 'pitch_sent' && item.status !== 'replied') {
              newStatus = 'pitch_sent';
              hasUpdates = true;
            } else if (backendStatus.status === 'REPLIED' && item.status !== 'replied') {
              newStatus = 'replied';
              hasUpdates = true;
            }

            // Always update trackerId if we have one
            if (backendStatus.trackerId && !item.trackerId) {
              trackerId = backendStatus.trackerId;
              hasUpdates = true;
            }

            if (newStatus !== item.status || trackerId !== item.trackerId) {
              return {
                ...item,
                status: newStatus,
                trackerId,
                acceptedAt: backendStatus.acceptedAt || item.acceptedAt,
                pitchSentAt: backendStatus.pitchSentAt || item.pitchSentAt,
              };
            }

            return item;
          });

          if (hasUpdates) {
            console.log('[Queue] Synced status updates from backend');
            saveQueue(updatedQueue);
          }
        }
      } catch (err) {
        console.error('[Queue] Failed to sync status with backend:', err);
      }
    };

    // Initial sync
    syncStatusWithBackend();

    // Set up polling interval (every 30 seconds)
    const interval = setInterval(syncStatusWithBackend, 30000);

    return () => clearInterval(interval);
  }, [queue]);

  // Fetch available assessment templates for linking
  const fetchAssessmentTemplates = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/assessments/templates`);
      if (response.ok) {
        const data = await response.json();
        // API returns { templates: [...] }
        setAssessmentTemplates(data.templates || []);
      }
    } catch {
      // Use mock data for demo
      setAssessmentTemplates([
        { id: 'tmpl-1', name: 'Senior Software Engineer Assessment', jobTitle: 'Senior Software Engineer', companyName: 'Acme Corp', isActive: true },
        { id: 'tmpl-2', name: 'Product Manager Assessment', jobTitle: 'Product Manager', companyName: 'TechStartup Inc', isActive: true },
        { id: 'tmpl-3', name: 'Data Scientist Assessment', jobTitle: 'Data Scientist', isActive: true },
      ]);
    }
  };

  // Link an assessment template to a candidate
  const linkAssessmentToCandidate = (itemId: string, templateId: string) => {
    const template = assessmentTemplates.find(t => t.id === templateId);
    const updatedQueue = queue.map((item) =>
      item.id === itemId ? {
        ...item,
        assessmentTemplateId: templateId,
        searchCriteria: {
          ...item.searchCriteria,
          jobTitle: template?.jobTitle || template?.name || item.searchCriteria?.jobTitle || '',
          skills: item.searchCriteria?.skills || [],
        }
      } : item
    );
    saveQueue(updatedQueue);
    setLinkingAssessment(null);
  };

  const loadUnipileConfig = () => {
    try {
      const savedConfig = localStorage.getItem('riley_unipile_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.apiKey && parsed.accountId && parsed.dsn) {
          setUnipileConfig(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
  };

  const loadQueue = useCallback(() => {
    setLoading(true);
    try {
      const savedQueue = localStorage.getItem('riley_messaging_queue');
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue) as QueuedCandidate[];
        setQueue(parsed);
      } else {
        setQueue([]);
      }
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveQueue = (newQueue: QueuedCandidate[]) => {
    localStorage.setItem('riley_messaging_queue', JSON.stringify(newQueue));
    setQueue(newQueue);
  };

  // Manual sync function - queries LinkedIn directly via Unipile to check connection status
  const forceSyncWithBackend = async () => {
    setSyncing(true);
    setError(null);

    // Get all provider IDs from queue items that are in "sent" status
    const sentItems = queue.filter(item => item.providerId && item.status === 'sent');

    if (sentItems.length === 0) {
      setLastSyncResult({
        syncedAt: new Date().toISOString(),
        foundTrackers: 0,
        updatedItems: 0,
        sentItemsChecked: 0,
      });
      setSyncing(false);
      return;
    }

    const providerIds = sentItems.map(item => item.providerId).filter(Boolean) as string[];

    try {
      console.log('[Queue] Manual sync - checking', providerIds.length, 'sent items');
      console.log('[Queue] Provider IDs being checked:', providerIds);

      // STEP 1: Try to sync directly from LinkedIn via Unipile
      // This queries actual connection status, not just our database
      if (unipileConfig) {
        console.log('[Queue] Querying LinkedIn directly for connection status...');
        console.log('[Queue] Sending', providerIds.length, 'provider IDs to LinkedIn sync endpoint');

        try {
          const linkedInResponse = await fetch(`${API_BASE}/api/outreach/sync-connections-from-linkedin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerIds,
              unipileConfig: {
                apiKey: unipileConfig.apiKey,
                dsn: unipileConfig.dsn,
                port: unipileConfig.port,
                accountId: unipileConfig.accountId,
              },
            }),
          });

          console.log('[Queue] LinkedIn sync response status:', linkedInResponse.status);

          if (linkedInResponse.ok) {
            const linkedInData = await linkedInResponse.json();
            console.log('[Queue] LinkedIn sync result:', linkedInData.summary);

            if (linkedInData.summary.updated > 0) {
              console.log('[Queue] LinkedIn sync updated', linkedInData.summary.updated, 'trackers');
            }

            // Log details about each result
            if (linkedInData.results) {
              linkedInData.results.forEach((r: { providerId: string; isConnected: boolean; wasUpdated: boolean; candidateName?: string; error?: string }) => {
                if (r.isConnected) {
                  console.log(`[Queue] ✅ ${r.candidateName || r.providerId}: Connected${r.wasUpdated ? ' (tracker updated)' : ''}`);
                } else if (r.error) {
                  console.log(`[Queue] ❌ ${r.providerId}: ${r.error}`);
                }
              });
            }
          } else {
            const errorText = await linkedInResponse.text();
            console.warn('[Queue] LinkedIn sync failed:', linkedInResponse.status, errorText);
          }
        } catch (linkedInError) {
          console.error('[Queue] LinkedIn sync request failed:', linkedInError);
          // Continue with database sync even if LinkedIn sync fails
        }
      } else {
        console.log('[Queue] No Unipile config - skipping LinkedIn direct query');
      }

      // STEP 2: Now sync from our database to update local queue state
      const response = await fetch(`${API_BASE}/api/outreach/status-by-providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerIds }),
      });

      if (response.ok) {
        const data = await response.json();
        const statusMap = data.statusMap as Record<string, {
          trackerId: string;
          status: string;
          acceptedAt: string | null;
          pitchSentAt: string | null;
        }>;

        console.log('[Queue] Backend response - found trackers:', Object.keys(statusMap).length);
        console.log('[Queue] Status map:', statusMap);

        // Update queue items based on backend status
        let updatedCount = 0;
        const updatedQueue = queue.map(item => {
          if (!item.providerId || !statusMap[item.providerId]) return item;

          const backendStatus = statusMap[item.providerId];
          console.log(`[Queue] Checking ${item.name}: local status=${item.status}, backend status=${backendStatus.status}`);

          // Map backend status to queue status
          let newStatus: QueuedCandidate['status'] = item.status;
          let trackerId = item.trackerId;

          if (backendStatus.status === 'CONNECTION_ACCEPTED' && item.status === 'sent') {
            newStatus = 'connection_accepted';
            updatedCount++;
            console.log(`[Queue] Updating ${item.name} to connection_accepted`);
          } else if (backendStatus.status === 'PITCH_PENDING' && item.status !== 'pitch_pending' && item.status !== 'pitch_sent') {
            newStatus = 'pitch_pending';
            updatedCount++;
          } else if (backendStatus.status === 'PITCH_SENT' && item.status !== 'pitch_sent' && item.status !== 'replied') {
            newStatus = 'pitch_sent';
            updatedCount++;
          } else if (backendStatus.status === 'REPLIED' && item.status !== 'replied') {
            newStatus = 'replied';
            updatedCount++;
          }

          // Always update trackerId if we have one
          if (backendStatus.trackerId && !item.trackerId) {
            trackerId = backendStatus.trackerId;
          }

          if (newStatus !== item.status || trackerId !== item.trackerId) {
            return {
              ...item,
              status: newStatus,
              trackerId,
              acceptedAt: backendStatus.acceptedAt || item.acceptedAt,
              pitchSentAt: backendStatus.pitchSentAt || item.pitchSentAt,
            };
          }

          return item;
        });

        setLastSyncResult({
          syncedAt: new Date().toISOString(),
          foundTrackers: Object.keys(statusMap).length,
          updatedItems: updatedCount,
          sentItemsChecked: sentItems.length,
        });

        if (updatedCount > 0) {
          saveQueue(updatedQueue);
          console.log('[Queue] Manual sync completed - updated', updatedCount, 'items');
        } else {
          console.log('[Queue] Manual sync completed - no updates needed');
          // If no updates but we have sent items without trackers, show a warning
          const itemsWithoutTrackers = sentItems.filter(item => !statusMap[item.providerId!]);
          if (itemsWithoutTrackers.length > 0) {
            console.warn('[Queue] Warning: These sent items have no backend tracker:',
              itemsWithoutTrackers.map(i => ({ name: i.name, providerId: i.providerId })));
            setError(`${itemsWithoutTrackers.length} sent item(s) have no backend tracker. The connection may have been sent before tracker creation was implemented, or the Unipile webhook isn't receiving updates.`);
          }
        }
      } else {
        const errorText = await response.text();
        console.error('[Queue] Sync failed:', response.status, errorText);
        setError(`Sync failed: ${response.status} - ${errorText}`);
      }
    } catch (err) {
      console.error('[Queue] Failed to sync status with backend:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync with backend');
    } finally {
      setSyncing(false);
    }
  };

  // Toggle expanded state for awaiting connection items
  const toggleAwaitingExpansion = (itemId: string) => {
    setExpandedAwaitingItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Remove an item from the queue
  const removeFromQueue = (itemId: string) => {
    const updatedQueue = queue.filter((item) => item.id !== itemId);
    saveQueue(updatedQueue);
    setConfirmingRemove(null);
    // Also remove from expanded set if present
    setExpandedAwaitingItems(prev => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    setExpandedConnectedItems(prev => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  // Toggle expanded state for connection accepted items
  const toggleConnectedExpansion = (itemId: string) => {
    setExpandedConnectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Generate a pitch preview for editing
  const generatePitchPreview = async (item: QueuedCandidate) => {
    if (!item.trackerId) {
      setError(`Cannot generate pitch for ${item.name}: No outreach tracker found.`);
      return;
    }

    const anthropicApiKey = localStorage.getItem('riley_anthropic_api_key');
    if (!anthropicApiKey) {
      setError('Anthropic API key is required to generate AI pitches. Please configure it in Settings.');
      return;
    }

    setGeneratingPitchPreview(prev => new Set(prev).add(item.id));
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/outreach/${item.trackerId}/generate-pitch-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Anthropic-Api-Key': anthropicApiKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to generate pitch: ${response.status}`);
      }

      const data = await response.json();
      setPitchDraftText(data.message);
      setEditingPitchDraft(item.id);
      console.log(`[Queue] Pitch preview generated for ${item.name}`);
    } catch (err) {
      console.error(`[Queue] Error generating pitch preview for ${item.name}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to generate pitch preview');
    } finally {
      setGeneratingPitchPreview(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Send pitch with custom message
  const sendPitchWithCustomMessage = async (item: QueuedCandidate, customMessage: string) => {
    if (!item.trackerId) {
      setError(`Cannot send pitch to ${item.name}: No outreach tracker found.`);
      return;
    }

    setSendingPitch(prev => new Set(prev).add(item.id));
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/outreach/${item.trackerId}/send-pitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // forceUpdateStatus: true will auto-update tracker from SENT to CONNECTION_ACCEPTED if needed
        // Pass unipileConfig so backend can create a UnipileClient for sending
        body: JSON.stringify({
          customMessage,
          forceUpdateStatus: true,
          unipileConfig: unipileConfig ? {
            apiKey: unipileConfig.apiKey,
            dsn: unipileConfig.dsn,
            port: unipileConfig.port,
            accountId: unipileConfig.accountId,
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to send pitch: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Queue] Custom pitch sent to ${item.name}, conversation ID: ${data.conversationId}`);

      // Update item status to pitch_sent
      const updatedQueue = queue.map((q) =>
        q.id === item.id ? { ...q, status: 'pitch_sent' as const, pitchSentAt: new Date().toISOString() } : q
      );
      saveQueue(updatedQueue);

      // Clear editing state
      setEditingPitchDraft(null);
      setPitchDraftText('');
      setExpandedConnectedItems(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } catch (err) {
      console.error(`[Queue] Error sending custom pitch to ${item.name}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to send pitch');
    } finally {
      setSendingPitch(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Track items being marked as connected
  const [markingConnected, setMarkingConnected] = useState<Set<string>>(new Set());

  // Manually mark an item as connected (for items sent before tracking was implemented)
  const markAsConnected = async (item: QueuedCandidate) => {
    setMarkingConnected((prev) => new Set(prev).add(item.id));
    setError(null);

    try {
      // If we have a trackerId, update the backend tracker status first
      if (item.trackerId) {
        const response = await fetch(`${API_BASE}/api/outreach/${item.trackerId}/mark-connected`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to mark as connected: ${response.status}`);
        }

        console.log('[Queue] Backend tracker updated to CONNECTION_ACCEPTED:', item.trackerId);
      } else {
        console.log('[Queue] No trackerId, only updating localStorage for:', item.id);
      }

      // Update localStorage
      const updatedQueue = queue.map((q) =>
        q.id === item.id
          ? {
              ...q,
              status: 'connection_accepted' as const,
              acceptedAt: new Date().toISOString(),
            }
          : q
      );
      saveQueue(updatedQueue);

      // Collapse the item since it will move to a different section
      setExpandedAwaitingItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });

      console.log('[Queue] Manually marked as connected:', item.id);
    } catch (err) {
      console.error('[Queue] Error marking as connected:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark as connected');
    } finally {
      setMarkingConnected((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Helper to determine if an item is connection flow or direct flow
  const isConnectionFlow = (item: QueuedCandidate) =>
    item.messageType === 'connection_request' || item.messageType === 'connection_only';

  const isDirectFlow = (item: QueuedCandidate) =>
    item.messageType === 'inmail' || item.messageType === 'message';

  // Filter queue items by flow type first
  const connectionFlowItems = queue.filter(isConnectionFlow);
  const directFlowItems = queue.filter(isDirectFlow);

  // Then filter by status within each flow
  // Connection Flow items
  const connectionPending = connectionFlowItems.filter((item) => item.status === 'pending');
  const connectionSent = connectionFlowItems.filter((item) => item.status === 'sent');
  const connectionAccepted = connectionFlowItems.filter((item) => item.status === 'connection_accepted' || item.status === 'pitch_pending');
  const connectionPitchSent = connectionFlowItems.filter((item) => item.status === 'pitch_sent');
  const connectionReplied = connectionFlowItems.filter((item) => item.status === 'replied');
  const connectionFailed = connectionFlowItems.filter((item) => item.status === 'failed');

  // Direct Flow items
  const directPending = directFlowItems.filter((item) => item.status === 'pending');
  const directSent = directFlowItems.filter((item) => item.status === 'sent');
  const directReplied = directFlowItems.filter((item) => item.status === 'replied');
  const directFailed = directFlowItems.filter((item) => item.status === 'failed');

  // Legacy combined filters for header stats
  const pendingItems = queue.filter((item) => item.status === 'pending');
  const sentItems = queue.filter((item) => item.status === 'sent');
  const acceptedItems = queue.filter((item) => item.status === 'connection_accepted' || item.status === 'pitch_pending');
  const pitchSentItems = queue.filter((item) => item.status === 'pitch_sent');
  const repliedItems = queue.filter((item) => item.status === 'replied');
  const failedItems = queue.filter((item) => item.status === 'failed');

  const toggleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  const selectAll = () => {
    // Select all pending items in the active flow
    const flowPending = activeFlow === 'connection' ? connectionPending : directPending;
    if (selectedItems.size === flowPending.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(flowPending.map((item) => item.id)));
    }
  };

  // Generate a default message based on the candidate and search criteria
  const generateDefaultMessage = (item: QueuedCandidate): string => {
    const jobTitle = item.searchCriteria?.jobTitle || 'an exciting opportunity';
    const skills = item.searchCriteria?.skills?.slice(0, 3).join(', ') || '';
    const assessmentNote = item.assessmentUrl
      ? `\n\nTo help me understand your background better, please complete this brief assessment: ${item.assessmentUrl}`
      : '';

    if (item.messageType === 'connection_request') {
      // Connection requests have 300 char limit, keep it short
      return `Hi ${item.name.split(' ')[0]},

I came across your profile and was impressed by your experience${item.currentCompany ? ` at ${item.currentCompany}` : ''}. I'm reaching out about ${jobTitle} that I think could be a great match for your background${skills ? ` in ${skills}` : ''}.

Would love to connect and share more details if you're open to it!`;
    }

    return `Hi ${item.name.split(' ')[0]},

I hope this message finds you well. I came across your profile and was impressed by your experience${item.currentCompany ? ` at ${item.currentCompany}` : ''}.

I'm reaching out about ${jobTitle} that I believe could be a great fit for your skills${skills ? ` in ${skills}` : ''}.

Would you be open to a brief conversation to learn more?${assessmentNote}

Best regards`;
  };

  // Fetch or generate assessment link for a candidate
  const fetchAssessmentLink = async (item: QueuedCandidate): Promise<string | null> => {
    if (!item.jobRequisitionId) {
      console.log('[Queue] No job requisition ID for candidate, skipping assessment link');
      return null;
    }

    // If already have an assessment URL, return it
    if (item.assessmentUrl) {
      return item.assessmentUrl;
    }

    setFetchingAssessment((prev) => new Set(prev).add(item.id));

    try {
      // Create a temporary conversation ID for this assessment
      const conversationId = `queue-${item.id}`;

      const response = await fetch(`${API_BASE}/api/assessments/create-link-for-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobRequisitionId: item.jobRequisitionId,
          conversationId,
          candidateName: item.name,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create assessment link');
      }

      const data = await response.json();

      if (data.success && data.assessmentLink?.url) {
        // Update the queue item with the assessment info
        const updatedQueue = queue.map((q) =>
          q.id === item.id
            ? {
                ...q,
                assessmentTemplateId: data.templateId,
                assessmentUrl: data.assessmentLink.url,
              }
            : q
        );
        saveQueue(updatedQueue);

        return data.assessmentLink.url;
      }

      return null;
    } catch (err) {
      console.error('[Queue] Failed to fetch assessment link:', err);
      return null;
    } finally {
      setFetchingAssessment((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Generate assessment link and add to message at cursor position
  const addAssessmentToMessage = async (item: QueuedCandidate) => {
    const url = await fetchAssessmentLink(item);
    if (url) {
      const currentDraft = item.messageDraft || generateDefaultMessage(item);

      // Don't add if already present
      if (currentDraft.includes(url)) {
        return;
      }

      let updatedDraft: string;

      // If editing with textarea, insert at cursor position
      if (editingDraft === item.id && textareaRef.current) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const textBefore = draftText.substring(0, start);
        const textAfter = draftText.substring(end);

        // Insert just the URL at cursor position
        updatedDraft = textBefore + url + textAfter;
        setDraftText(updatedDraft);

        // Update cursor position after the inserted URL
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + url.length;
          textarea.focus();
        }, 0);
      } else {
        // Not editing - append to end with full sentence
        const assessmentNote = `\n\nTo help me understand your background better, please complete this brief assessment: ${url}`;
        updatedDraft = currentDraft + assessmentNote;

        // If editing, update the draft text
        if (editingDraft === item.id) {
          setDraftText(updatedDraft);
        }
      }

      // Save to queue with assessmentUrl
      const updatedQueue = queue.map((q) =>
        q.id === item.id ? { ...q, messageDraft: updatedDraft, assessmentUrl: url } : q
      );
      saveQueue(updatedQueue);
    } else {
      setError('Could not generate assessment link. Make sure the candidate has a job requisition linked.');
    }
  };

  // Copy assessment link to clipboard
  const copyAssessmentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAssessmentLink(url);
      setTimeout(() => setCopiedAssessmentLink(null), 2000);
    } catch {
      setError('Failed to copy link to clipboard');
    }
  };

  // Start editing a message draft
  const startEditingDraft = (item: QueuedCandidate) => {
    setEditingDraft(item.id);
    setDraftText(item.messageDraft || generateDefaultMessage(item));
    setExpandedItem(item.id);
  };

  // Save the edited draft
  const saveDraft = (itemId: string) => {
    const updatedQueue = queue.map((item) =>
      item.id === itemId ? { ...item, messageDraft: draftText } : item
    );
    saveQueue(updatedQueue);
    setEditingDraft(null);
  };

  // Generate AI-powered personalized message
  const generateAIMessage = async (item: QueuedCandidate) => {
    setGeneratingAI((prev) => new Set(prev).add(item.id));
    setError(null);

    try {
      // Get the Anthropic API key from localStorage
      const apiKey = localStorage.getItem('riley_anthropic_api_key');

      const response = await fetch(`${API_BASE}/api/demo/ai/generate-outreach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Anthropic-Api-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          candidate: {
            id: item.candidateId,
            name: item.name,
            headline: item.headline,
            currentTitle: item.currentTitle,
            currentCompany: item.currentCompany,
            location: item.location,
            skills: item.searchCriteria?.skills || [],
          },
          role: {
            title: item.searchCriteria?.jobTitle || 'Software Engineer',
            company: 'Your Company', // Could be made configurable
            highlights: [
              'Great team and culture',
              'Competitive compensation',
              'Growth opportunities',
            ],
          },
          channel: item.messageType === 'connection_request' || item.messageType === 'connection_only'
            ? 'linkedin_connection'
            : item.messageType === 'inmail'
            ? 'linkedin_inmail'
            : 'email',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate message: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.outreach?.message) {
        // Update the draft with the AI-generated message
        const generatedMessage = data.outreach.message;

        // If we're editing, update the draft text
        if (editingDraft === item.id) {
          setDraftText(generatedMessage);
        }

        // Always save to the queue
        const updatedQueue = queue.map((q) =>
          q.id === item.id ? { ...q, messageDraft: generatedMessage } : q
        );
        saveQueue(updatedQueue);

        // Expand the item to show the result
        setExpandedItem(item.id);
        setEditingDraft(item.id);
        setDraftText(generatedMessage);

        console.log('[Queue] AI message generated:', {
          aiPowered: data.aiPowered,
          personalization: data.outreach.personalization,
        });
      } else {
        throw new Error('Invalid response from AI service');
      }
    } catch (err) {
      console.error('[Queue] AI generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate AI message');
    } finally {
      setGeneratingAI((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Change message type
  const changeMessageType = (itemId: string, newType: 'connection_request' | 'connection_only' | 'inmail' | 'message') => {
    const updatedQueue = queue.map((item) =>
      item.id === itemId ? { ...item, messageType: newType } : item
    );
    saveQueue(updatedQueue);
  };

  // Send a single message via Unipile
  const sendMessage = async (item: QueuedCandidate) => {
    if (!unipileConfig) {
      setError('LinkedIn is not connected. Please connect in Settings first.');
      return;
    }

    if (!item.providerId) {
      setError(`Cannot send message to ${item.name}: Missing LinkedIn provider ID. This candidate may have been sourced from demo mode or their LinkedIn ID wasn't captured during search. Try re-sourcing this candidate from the Sourcing page with LinkedIn connected.`);
      return;
    }

    setSending((prev) => new Set(prev).add(item.id));
    setError(null);

    try {
      const messageText = item.messageDraft || generateDefaultMessage(item);
      const apiUrl = `https://${unipileConfig.dsn}.unipile.com:${unipileConfig.port}/api/v1`;

      if (item.messageType === 'connection_request' || item.messageType === 'connection_only') {
        // Send connection request - with or without message
        const requestBody: Record<string, string> = {
          provider_id: item.providerId,
          account_id: unipileConfig.accountId,
        };

        // Only include message if it's a connection_request (not connection_only)
        if (item.messageType === 'connection_request') {
          requestBody.message = messageText;
        }

        const response = await fetch(`${apiUrl}/users/invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': unipileConfig.apiKey,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to send connection request: ${response.status} - ${errorText}`);
        }

        console.log(`[Queue] Connection request ${item.messageType === 'connection_only' ? '(no message)' : 'with message'} sent to ${item.name}`);

        // Create outreach tracker for connection requests
        try {
          const trackerResponse = await fetch(`${API_BASE}/api/outreach/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidateProviderId: item.providerId,
              candidateName: item.name,
              candidateProfileUrl: item.profileUrl,
              outreachType: item.messageType === 'connection_only' ? 'CONNECTION_ONLY' : 'CONNECTION_REQUEST',
              messageContent: item.messageType === 'connection_request' ? messageText : undefined,
              jobRequisitionId: item.jobRequisitionId,
              jobTitle: item.searchCriteria?.jobTitle,
              assessmentTemplateId: item.assessmentTemplateId,
              sourceQueueItemId: item.id,
            }),
          });

          if (trackerResponse.ok) {
            const trackerData = await trackerResponse.json();
            console.log(`[Queue] Created outreach tracker: ${trackerData.tracker?.id}`);
            // Store tracker ID with the queue item
            item.trackerId = trackerData.tracker?.id;
          } else {
            console.warn('[Queue] Failed to create outreach tracker, continuing anyway');
          }
        } catch (trackerErr) {
          console.warn('[Queue] Error creating outreach tracker:', trackerErr);
          // Don't fail the send if tracker creation fails
        }
      } else {
        // Send InMail or direct message via starting a new chat
        const response = await fetch(`${apiUrl}/chats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': unipileConfig.apiKey,
          },
          body: JSON.stringify({
            account_id: unipileConfig.accountId,
            text: messageText,
            attendees_ids: [item.providerId],
            options: item.messageType === 'inmail' ? {
              linkedin: {
                api: 'classic',
                inmail: true,
              },
            } : undefined,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to send message: ${response.status} - ${errorText}`);
        }

        console.log(`[Queue] ${item.messageType} sent to ${item.name}`);
      }

      // Update item status to sent
      const updatedQueue = queue.map((q) =>
        q.id === item.id ? { ...q, status: 'sent' as const } : q
      );
      saveQueue(updatedQueue);
    } catch (err) {
      console.error(`[Queue] Error sending to ${item.name}:`, err);

      // Update item status to failed
      const updatedQueue = queue.map((q) =>
        q.id === item.id
          ? { ...q, status: 'failed' as const, errorMessage: err instanceof Error ? err.message : 'Unknown error' }
          : q
      );
      saveQueue(updatedQueue);

      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Send all selected messages with human-like timing
  const sendSelected = async () => {
    const itemsToSend = pendingItems.filter((item) => selectedItems.has(item.id) && item.providerId);

    if (itemsToSend.length === 0) {
      setError('No valid candidates selected (missing LinkedIn provider IDs)');
      return;
    }

    // Check daily limits based on message types
    const connectionItems = itemsToSend.filter(
      i => i.messageType === 'connection_request' || i.messageType === 'connection_only'
    );
    const inMailItems = itemsToSend.filter(i => i.messageType === 'inmail');
    const messageItems = itemsToSend.filter(i => i.messageType === 'message');

    const remaining = getRemainingAllowance(timingConfig);

    if (connectionItems.length > 0 && !canSendConnection(timingConfig)) {
      setError(`Daily connection limit reached. ${remaining.connections} connections remaining for today.`);
      return;
    }
    if (inMailItems.length > 0 && !canSendInMail(timingConfig)) {
      setError(`Daily InMail limit reached. ${remaining.inMails} InMails remaining for today.`);
      return;
    }
    if (messageItems.length > 0 && !canSendMessage(timingConfig)) {
      setError(`Daily message limit reached. ${remaining.messages} messages remaining for today.`);
      return;
    }

    // Initialize progress modal
    let sent = 0;
    let failed = 0;
    let lastBreakAt = 0;
    const errors: Array<{ candidateName: string; error: string }> = [];

    outreachCancelledRef.current = false;
    setOutreachProgress({
      current: 0,
      total: itemsToSend.length,
      status: 'waiting',
      statusMessage: 'Starting outreach...',
      remainingMs: 0,
      isBreak: false,
      successCount: 0,
      failureCount: 0,
      errors: [],
    });
    setShowOutreachProgress(true);

    for (let i = 0; i < itemsToSend.length; i++) {
      const item = itemsToSend[i];

      // Check if cancelled
      if (outreachCancelledRef.current) {
        console.log('[Queue] Outreach cancelled by user');
        setOutreachProgress(prev => ({
          ...prev,
          status: 'cancelled',
          statusMessage: 'Outreach cancelled by user',
        }));
        break;
      }

      // Human-like delay before sending (except first message)
      if (i > 0) {
        const delayResult = await humanLikeDelay(
          sent + failed,
          timingConfig,
          lastBreakAt,
          (status, remainingMs, isBreak) => {
            setOutreachProgress(prev => ({
              ...prev,
              status: isBreak ? 'break' : 'waiting',
              statusMessage: status,
              remainingMs,
              isBreak,
            }));
          },
          () => outreachCancelledRef.current
        );

        if (delayResult.cancelled) {
          console.log('[Queue] Outreach cancelled during delay');
          setOutreachProgress(prev => ({
            ...prev,
            status: 'cancelled',
            statusMessage: 'Outreach cancelled by user',
          }));
          break;
        }

        if (delayResult.tookBreak) {
          lastBreakAt = sent + failed;
        }
      }

      // Update progress to show sending
      setOutreachProgress(prev => ({
        ...prev,
        current: i + 1,
        status: 'sending',
        statusMessage: `Sending to ${item.name}...`,
        currentCandidateName: item.name,
        remainingMs: 0,
        isBreak: false,
      }));

      // Send the message
      try {
        await sendMessageWithTracking(item);
        sent++;

        // Update daily stats based on message type
        if (item.messageType === 'connection_request' || item.messageType === 'connection_only') {
          incrementConnectionCount(1);
        } else if (item.messageType === 'inmail') {
          incrementInMailCount(1);
        } else {
          incrementMessageCount(1);
        }

        setOutreachProgress(prev => ({
          ...prev,
          successCount: sent,
        }));
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ candidateName: item.name, error: errorMsg });
        setOutreachProgress(prev => ({
          ...prev,
          failureCount: failed,
          errors: [...errors],
        }));
      }
    }

    // Update final status
    if (!outreachCancelledRef.current) {
      setOutreachProgress(prev => ({
        ...prev,
        status: 'complete',
        statusMessage: `Sent ${sent} messages, ${failed} failed`,
        currentCandidateName: undefined,
      }));
    }

    setSelectedItems(new Set());
  };

  // Internal send function that throws on error (for batch sending)
  const sendMessageWithTracking = async (item: QueuedCandidate): Promise<void> => {
    if (!unipileConfig) {
      throw new Error('LinkedIn is not connected');
    }

    if (!item.providerId) {
      throw new Error('Missing LinkedIn provider ID');
    }

    const messageText = item.messageDraft || generateDefaultMessage(item);
    const apiUrl = `https://${unipileConfig.dsn}.unipile.com:${unipileConfig.port}/api/v1`;

    if (item.messageType === 'connection_request' || item.messageType === 'connection_only') {
      // Send connection request - with or without message
      const requestBody: Record<string, string> = {
        provider_id: item.providerId,
        account_id: unipileConfig.accountId,
      };

      if (item.messageType === 'connection_request') {
        requestBody.message = messageText;
      }

      const response = await fetch(`${apiUrl}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': unipileConfig.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Update queue item status to failed
        const updatedQueue = queue.map((q) =>
          q.id === item.id
            ? { ...q, status: 'failed' as const, errorMessage: errorText }
            : q
        );
        saveQueue(updatedQueue);
        throw new Error(`Failed to send connection request: ${response.status} - ${errorText}`);
      }

      console.log(`[Queue] Connection request ${item.messageType === 'connection_only' ? '(no message)' : 'with message'} sent to ${item.name}`);

      // Create outreach tracker
      try {
        const trackerResponse = await fetch(`${API_BASE}/api/outreach/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateProviderId: item.providerId,
            candidateName: item.name,
            candidateProfileUrl: item.profileUrl,
            outreachType: item.messageType === 'connection_only' ? 'CONNECTION_ONLY' : 'CONNECTION_REQUEST',
            messageContent: item.messageType === 'connection_request' ? messageText : undefined,
            jobRequisitionId: item.jobRequisitionId,
            jobTitle: item.searchCriteria?.jobTitle,
            assessmentTemplateId: item.assessmentTemplateId,
            sourceQueueItemId: item.id,
          }),
        });

        if (trackerResponse.ok) {
          const trackerData = await trackerResponse.json();
          item.trackerId = trackerData.tracker?.id;
        }
      } catch (trackerErr) {
        console.warn('[Queue] Error creating outreach tracker:', trackerErr);
      }
    } else {
      // Send InMail or direct message via starting a new chat
      const response = await fetch(`${apiUrl}/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': unipileConfig.apiKey,
        },
        body: JSON.stringify({
          account_id: unipileConfig.accountId,
          text: messageText,
          attendees_ids: [item.providerId],
          options: item.messageType === 'inmail' ? {
            linkedin: {
              api: 'classic',
              inmail: true,
            },
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Update queue item status to failed
        const updatedQueue = queue.map((q) =>
          q.id === item.id
            ? { ...q, status: 'failed' as const, errorMessage: errorText }
            : q
        );
        saveQueue(updatedQueue);
        throw new Error(`Failed to send message: ${response.status} - ${errorText}`);
      }

      console.log(`[Queue] ${item.messageType} sent to ${item.name}`);
    }

    // Update item status to sent
    const updatedQueue = queue.map((q) =>
      q.id === item.id ? { ...q, status: 'sent' as const } : q
    );
    saveQueue(updatedQueue);
  };

  // Send pitch to a connected candidate (manual pitch when autopilot is off)
  const sendPitch = async (item: QueuedCandidate) => {
    if (!item.trackerId) {
      setError(`Cannot send pitch to ${item.name}: No outreach tracker found. This candidate may not have been properly tracked.`);
      return;
    }

    setSendingPitch((prev) => new Set(prev).add(item.id));
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/outreach/${item.trackerId}/send-pitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // forceUpdateStatus: true will auto-update tracker from SENT to CONNECTION_ACCEPTED if needed
        // Pass unipileConfig so backend can create a UnipileClient for sending
        body: JSON.stringify({
          forceUpdateStatus: true,
          unipileConfig: unipileConfig ? {
            apiKey: unipileConfig.apiKey,
            dsn: unipileConfig.dsn,
            port: unipileConfig.port,
            accountId: unipileConfig.accountId,
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to send pitch: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Queue] Pitch sent to ${item.name}, conversation ID: ${data.conversationId}`);

      // Update item status to pitch_sent
      const updatedQueue = queue.map((q) =>
        q.id === item.id ? { ...q, status: 'pitch_sent' as const, pitchSentAt: new Date().toISOString() } : q
      );
      saveQueue(updatedQueue);
    } catch (err) {
      console.error(`[Queue] Error sending pitch to ${item.name}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to send pitch');
    } finally {
      setSendingPitch((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Remove an item from the queue
  const removeItem = (itemId: string) => {
    const updatedQueue = queue.filter((item) => item.id !== itemId);
    saveQueue(updatedQueue);
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  // Clear all sent/failed items
  const clearCompleted = () => {
    const updatedQueue = queue.filter((item) => item.status === 'pending');
    saveQueue(updatedQueue);
  };

  // Clear all items from the queue
  const clearAllItems = () => {
    if (confirm('Are you sure you want to clear all items from the queue? This cannot be undone.')) {
      saveQueue([]);
      setSelectedItems(new Set());
    }
  };

  // Count candidates without provider IDs
  const candidatesWithoutProviderId = pendingItems.filter(item => !item.providerId).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messaging Queue</h1>
          <p className="text-gray-600">
            {pendingItems.length} pending
            {sentItems.length > 0 && ` • ${sentItems.length} sent`}
            {acceptedItems.length > 0 && ` • ${acceptedItems.length} connected`}
            {pitchSentItems.length > 0 && ` • ${pitchSentItems.length} pitched`}
            {repliedItems.length > 0 && ` • ${repliedItems.length} replied`}
            {failedItems.length > 0 && ` • ${failedItems.length} failed`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unipileConfig ? (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
              <Linkedin className="h-3 w-3" />
              LinkedIn Connected
            </span>
          ) : (
            <a
              href="/settings"
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200 transition-colors"
            >
              <AlertCircle className="h-3 w-3" />
              Connect LinkedIn
            </a>
          )}
          {selectedItems.size > 0 && unipileConfig && (
            <button
              onClick={sendSelected}
              disabled={sending.size > 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              {sending.size > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send {selectedItems.size} Messages
            </button>
          )}
          {(sentItems.length > 0 || failedItems.length > 0) && (
            <button
              onClick={clearCompleted}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear Completed
            </button>
          )}
          {queue.length > 0 && (
            <button
              onClick={clearAllItems}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </button>
          )}
          <button
            onClick={loadQueue}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={forceSyncWithBackend}
            disabled={syncing}
            className="px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 flex items-center gap-2"
            title="Force check backend for status updates"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Status
          </button>
        </div>
      </div>

      {/* Sync Result Info */}
      {lastSyncResult && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm">
          <div className="flex items-center justify-between">
            <span className="text-blue-700">
              Last sync: {new Date(lastSyncResult.syncedAt).toLocaleTimeString()} —
              Checked {lastSyncResult.sentItemsChecked} sent items,
              found {lastSyncResult.foundTrackers} backend trackers,
              updated {lastSyncResult.updatedItems} items
            </span>
            <button
              onClick={() => setLastSyncResult(null)}
              className="text-blue-600 hover:text-blue-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {lastSyncResult.foundTrackers === 0 && lastSyncResult.sentItemsChecked > 0 && (
            <p className="mt-1 text-orange-600 text-xs">
              ⚠️ No backend trackers found. This could mean:
              <br />• The connection was sent before tracker creation was added
              <br />• The backend database has no record of these outreaches
              <br />• Check browser console for detailed provider IDs
            </p>
          )}
        </div>
      )}

      {/* Flow Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Outreach Flow">
          <button
            onClick={() => setActiveFlow('connection')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeFlow === 'connection'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Connection Flow
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
              activeFlow === 'connection'
                ? 'bg-blue-100 text-blue-600'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {connectionFlowItems.length}
            </span>
          </button>
          <button
            onClick={() => setActiveFlow('direct')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeFlow === 'direct'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Mail className="h-4 w-4" />
            Direct Outreach
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
              activeFlow === 'direct'
                ? 'bg-purple-100 text-purple-600'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {directFlowItems.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Flow Description */}
      {activeFlow === 'connection' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Connection Flow (Basic / Sales Navigator)
          </h3>
          <p className="text-sm text-blue-700 mt-1">
            Send connection request → Wait for acceptance → Send pitch message → Follow-up sequence
          </p>
          <div className="flex gap-2 mt-3 text-xs">
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Pending: {connectionPending.length}</span>
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded">Awaiting Accept: {connectionSent.length}</span>
            <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded">Connected: {connectionAccepted.length}</span>
            <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded">Pitched: {connectionPitchSent.length}</span>
            <span className="px-2 py-1 bg-cyan-100 text-cyan-800 rounded">Replied: {connectionReplied.length}</span>
            {connectionFailed.length > 0 && <span className="px-2 py-1 bg-red-100 text-red-800 rounded">Failed: {connectionFailed.length}</span>}
          </div>
        </div>
      ) : (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-medium text-purple-800 flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Direct Outreach (Recruiter / InMail)
          </h3>
          <p className="text-sm text-purple-700 mt-1">
            Send initial pitch directly → No connection required → Follow-up sequence
          </p>
          <div className="flex gap-2 mt-3 text-xs">
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Pending: {directPending.length}</span>
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded">Sent: {directSent.length}</span>
            <span className="px-2 py-1 bg-cyan-100 text-cyan-800 rounded">Replied: {directReplied.length}</span>
            {directFailed.length > 0 && <span className="px-2 py-1 bg-red-100 text-red-800 rounded">Failed: {directFailed.length}</span>}
          </div>
        </div>
      )}

      {/* Warning for candidates without LinkedIn IDs */}
      {candidatesWithoutProviderId > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-yellow-800">
              {candidatesWithoutProviderId} candidate{candidatesWithoutProviderId > 1 ? 's' : ''} cannot be messaged
            </h3>
            <p className="text-sm text-yellow-700 mt-1">
              These candidates are missing LinkedIn IDs, likely because they were sourced from demo mode.
              To send messages, clear this queue and re-source candidates from the Sourcing page with LinkedIn connected.
            </p>
            <div className="mt-3 flex gap-2">
              <a
                href="/sourcing"
                className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-lg text-sm hover:bg-yellow-200"
              >
                Go to Sourcing
              </a>
              <button
                onClick={clearAllItems}
                className="px-3 py-1.5 border border-yellow-300 text-yellow-800 rounded-lg text-sm hover:bg-yellow-100"
              >
                Clear Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-red-800">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-sm text-red-600 hover:text-red-800 mt-2 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && queue.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          Loading queue...
        </div>
      )}

      {/* Empty State - Global */}
      {!loading && queue.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <div className="text-gray-400 mb-4">
            <MessageSquare className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates in queue</h3>
          <p className="text-gray-500 mb-4">
            Source candidates from LinkedIn and add them to the queue to start messaging.
          </p>
          <a
            href="/sourcing"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Linkedin className="h-4 w-4" />
            Go to Sourcing
          </a>
        </div>
      )}

      {/* Empty State - Active Flow */}
      {!loading && queue.length > 0 && (
        (activeFlow === 'connection' && connectionFlowItems.length === 0) ||
        (activeFlow === 'direct' && directFlowItems.length === 0)
      ) && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <div className="text-gray-400 mb-4">
            {activeFlow === 'connection' ? (
              <UserPlus className="h-12 w-12 mx-auto" />
            ) : (
              <Mail className="h-12 w-12 mx-auto" />
            )}
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No {activeFlow === 'connection' ? 'connection requests' : 'direct messages'} in queue
          </h3>
          <p className="text-gray-500 mb-4">
            {activeFlow === 'connection'
              ? 'Add candidates with "Connect + Message" or "Connect (No Message)" message type.'
              : 'Add candidates with "InMail" or "Direct Message" message type for Recruiter accounts.'}
          </p>
          <div className="flex justify-center gap-3">
            <a
              href="/sourcing"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Linkedin className="h-4 w-4" />
              Go to Sourcing
            </a>
            <button
              onClick={() => setActiveFlow(activeFlow === 'connection' ? 'direct' : 'connection')}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              View {activeFlow === 'connection' ? 'Direct Outreach' : 'Connection Flow'}
            </button>
          </div>
        </div>
      )}

      {/* Queue List - Flow Aware */}
      {((activeFlow === 'connection' && connectionPending.length > 0) ||
        (activeFlow === 'direct' && directPending.length > 0)) && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
            <input
              type="checkbox"
              checked={
                activeFlow === 'connection'
                  ? selectedItems.size === connectionPending.length && connectionPending.length > 0
                  : selectedItems.size === directPending.length && directPending.length > 0
              }
              onChange={selectAll}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="w-64">Candidate</span>
            <span className="flex-1">Message Type</span>
            <span className="w-24 text-center">Score</span>
            <span className="w-20 text-center">Added</span>
            <span className="w-48 text-center">Actions</span>
          </div>

          {/* Pending Items - Filtered by active flow */}
          {(activeFlow === 'connection' ? connectionPending : directPending).map((item) => (
            <div key={item.id} className="border-b border-gray-200 last:border-b-0">
              <div className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.id)}
                  onChange={() => toggleItemSelection(item.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />

                {/* Candidate Info */}
                <div className="w-64 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium overflow-hidden flex-shrink-0 relative">
                    {item.profilePictureUrl ? (
                      <img
                        src={item.profilePictureUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      item.name.split(' ').map((n) => n[0]).join('')
                    )}
                    {!item.providerId && (
                      <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-0.5" title="Missing LinkedIn ID - cannot send message">
                        <AlertCircle className="h-3 w-3 text-yellow-900" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{item.name}</p>
                      {item.source === 'github' && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-800 text-white text-xs rounded-md" title="Sourced from GitHub">
                          <Github className="h-3 w-3" />
                        </span>
                      )}
                      <a
                        href={item.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex-shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {item.currentTitle || item.headline}
                    </p>
                    {!item.providerId && (
                      <p className="text-xs text-yellow-600">Missing LinkedIn ID</p>
                    )}
                  </div>
                </div>

                {/* Message Type Selector */}
                <div className="flex-1">
                  <select
                    value={item.messageType}
                    onChange={(e) => changeMessageType(item.id, e.target.value as 'connection_request' | 'connection_only' | 'inmail' | 'message')}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="connection_request">Connect + Message</option>
                    <option value="connection_only">Connect (No Message)</option>
                    <option value="inmail">InMail (Premium)</option>
                    <option value="message">Direct Message</option>
                  </select>
                </div>

                {/* Score */}
                <div className="w-24 text-center">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    item.relevanceScore >= 85 ? 'bg-green-100 text-green-800' :
                    item.relevanceScore >= 70 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {item.relevanceScore}%
                  </span>
                </div>

                {/* Time Added */}
                <div className="w-20 text-center text-sm text-gray-500">
                  {formatWaitTime(item.createdAt)}
                </div>

                {/* Actions */}
                <div className="w-48 flex items-center justify-center gap-1">
                  <button
                    onClick={() => generateAIMessage(item)}
                    disabled={generatingAI.has(item.id)}
                    className="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50"
                    title="Generate AI message"
                  >
                    {generatingAI.has(item.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => startEditingDraft(item)}
                    className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    title="Edit message"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => sendMessage(item)}
                    disabled={sending.has(item.id) || !unipileConfig}
                    className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                    title="Send message"
                  >
                    {sending.has(item.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    title="Remove from queue"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    title="Show details"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedItem === item.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Expanded Details / Edit Mode */}
              {expandedItem === item.id && (
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left: Message Editor */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Message Content</h4>
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        {editingDraft === item.id ? (
                          <>
                            <textarea
                              ref={textareaRef}
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              rows={8}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Write your message..."
                            />
                            <div className="flex justify-between mt-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => generateAIMessage(item)}
                                  disabled={generatingAI.has(item.id)}
                                  className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 flex items-center gap-1 disabled:opacity-50"
                                >
                                  {generatingAI.has(item.id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  {generatingAI.has(item.id) ? 'Generating...' : 'Regenerate with AI'}
                                </button>
                                {item.jobRequisitionId && !item.assessmentUrl && (
                                  <button
                                    onClick={() => addAssessmentToMessage(item)}
                                    disabled={fetchingAssessment.has(item.id)}
                                    className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 flex items-center gap-1 disabled:opacity-50"
                                    title="Add pre-screening assessment link to message"
                                  >
                                    {fetchingAssessment.has(item.id) ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <ClipboardList className="h-3 w-3" />
                                    )}
                                    Add Assessment
                                  </button>
                                )}
                                {item.assessmentUrl && (
                                  <button
                                    onClick={() => {
                                      // Insert assessment URL at cursor position in textarea
                                      if (textareaRef.current) {
                                        const textarea = textareaRef.current;
                                        const start = textarea.selectionStart;
                                        const end = textarea.selectionEnd;
                                        const textBefore = draftText.substring(0, start);
                                        const textAfter = draftText.substring(end);
                                        const updatedDraft = textBefore + item.assessmentUrl + textAfter;
                                        setDraftText(updatedDraft);
                                        setTimeout(() => {
                                          textarea.selectionStart = textarea.selectionEnd = start + (item.assessmentUrl?.length || 0);
                                          textarea.focus();
                                        }, 0);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 flex items-center gap-1"
                                    title="Insert assessment link at cursor position"
                                  >
                                    <Link2 className="h-3 w-3" />
                                    Insert Link
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setEditingDraft(null)}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => saveDraft(item.id)}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                                >
                                  Save Draft
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Show indicator if message is AI-generated vs default */}
                            {item.messageDraft ? (
                              <div className="flex items-center gap-1 text-xs text-purple-600 mb-2">
                                <Sparkles className="h-3 w-3" />
                                AI-Generated Message
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-xs text-yellow-600 mb-2">
                                <AlertCircle className="h-3 w-3" />
                                Default Template - Click "Generate with AI" for personalized message
                              </div>
                            )}
                            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                              {item.messageDraft || generateDefaultMessage(item)}
                            </pre>
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => generateAIMessage(item)}
                                disabled={generatingAI.has(item.id)}
                                className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 flex items-center gap-1 disabled:opacity-50"
                              >
                                {generatingAI.has(item.id) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                {generatingAI.has(item.id) ? 'Generating...' : item.messageDraft ? 'Regenerate with AI' : 'Generate with AI'}
                              </button>
                              <button
                                onClick={() => startEditingDraft(item)}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
                              >
                                <Edit2 className="h-3 w-3" />
                                Edit Message
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: Candidate Details */}
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Candidate Info</h4>
                        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
                          {item.headline && (
                            <p className="text-gray-700">{item.headline}</p>
                          )}
                          {item.currentCompany && (
                            <div className="flex items-center gap-2 text-gray-600">
                              <Building className="h-4 w-4" />
                              {item.currentCompany}
                            </div>
                          )}
                          {item.location && (
                            <div className="flex items-center gap-2 text-gray-600">
                              <MapPin className="h-4 w-4" />
                              {item.location}
                            </div>
                          )}
                          <a
                            href={item.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                          >
                            <Linkedin className="h-4 w-4" />
                            View LinkedIn Profile
                          </a>
                        </div>
                      </div>

                      {item.searchCriteria && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Search Criteria</h4>
                          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Job Title</span>
                              <span>{item.searchCriteria.jobTitle}</span>
                            </div>
                            {item.searchCriteria.skills.length > 0 && (
                              <div>
                                <span className="text-gray-500">Skills</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.searchCriteria.skills.map((skill, i) => (
                                    <span
                                      key={i}
                                      className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Assessment Link Section - Always show */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Assessment Link</h4>
                        <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm">
                          {item.assessmentUrl ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-green-600" />
                                <span className="text-green-700 font-medium">Link Available</span>
                              </div>
                              <div className="flex items-center gap-2 bg-gray-50 p-2 rounded border">
                                <code className="text-xs text-gray-600 flex-1 truncate">{item.assessmentUrl}</code>
                                <button
                                  onClick={() => copyAssessmentLink(item.assessmentUrl!)}
                                  className="p-1 hover:bg-gray-200 rounded"
                                  title="Copy link"
                                >
                                  {copiedAssessmentLink === item.assessmentUrl ? (
                                    <Check className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <Copy className="h-4 w-4 text-gray-500" />
                                  )}
                                </button>
                              </div>
                              <p className="text-xs text-gray-500">
                                Click &quot;Edit Message&quot; and use &quot;Insert Link&quot; to add at cursor position
                              </p>
                            </div>
                          ) : item.jobRequisitionId ? (
                            <div className="space-y-2">
                              <p className="text-gray-500 text-sm">No assessment link generated yet</p>
                              <button
                                onClick={() => addAssessmentToMessage(item)}
                                disabled={fetchingAssessment.has(item.id)}
                                className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 flex items-center gap-1 disabled:opacity-50"
                              >
                                {fetchingAssessment.has(item.id) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ClipboardList className="h-3 w-3" />
                                )}
                                Generate Assessment Link
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-gray-500 text-sm">No assessment linked</p>
                              {linkingAssessment === item.id ? (
                                <div className="space-y-2">
                                  <select
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        linkAssessmentToCandidate(item.id, e.target.value);
                                      }
                                    }}
                                    defaultValue=""
                                  >
                                    <option value="" disabled>Select an assessment...</option>
                                    {assessmentTemplates.filter(t => t.isActive).map((template) => (
                                      <option key={template.id} value={template.id}>
                                        {template.name}{template.companyName ? ` (${template.companyName})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => setLinkingAssessment(null)}
                                    className="text-xs text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setLinkingAssessment(item.id)}
                                  className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 flex items-center gap-1"
                                >
                                  <Link2 className="h-3 w-3" />
                                  Link Assessment
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.providerId && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Technical Details</h4>
                          <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Provider ID</span>
                              <code className="text-xs bg-gray-100 px-1 rounded">{item.providerId}</code>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Connection Accepted - Ready for Pitch (Connection Flow Only) */}
      {activeFlow === 'connection' && connectionAccepted.length > 0 && (
        <div className="bg-white rounded-lg border border-emerald-200 overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
            <h3 className="font-medium text-emerald-800 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Connection Accepted ({connectionAccepted.length})
              <span className="ml-2 px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full text-xs">
                Ready to Pitch
              </span>
            </h3>
            <p className="text-xs text-emerald-600 mt-1">
              These candidates accepted your connection request. Expand to customize the pitch message before sending.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {connectionAccepted.map((item) => (
              <div key={item.id} className="flex flex-col">
                {/* Main row - clickable to expand */}
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleConnectedExpansion(item.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-sm font-medium overflow-hidden">
                    {item.profilePictureUrl ? (
                      <img
                        src={item.profilePictureUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      item.name.split(' ').map((n) => n[0]).join('')
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.currentTitle} {item.currentCompany && `at ${item.currentCompany}`}</p>
                    {item.acceptedAt && (
                      <p className="text-xs text-emerald-600">Connected {formatWaitTime(item.acceptedAt)} ago</p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                  {item.profileUrl && (
                    <a
                      href={item.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                      title="View LinkedIn Profile"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {/* Quick send button (auto-generated message) */}
                  {(item.status === 'connection_accepted' || item.status === 'pitch_pending') && item.trackerId && !expandedConnectedItems.has(item.id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); sendPitch(item); }}
                      disabled={sendingPitch.has(item.id)}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50"
                      title="Send auto-generated pitch message"
                    >
                      {sendingPitch.has(item.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {sendingPitch.has(item.id) ? 'Sending...' : 'Quick Send'}
                    </button>
                  )}
                  {(item.status === 'connection_accepted' || item.status === 'pitch_pending') && !item.trackerId && (
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs">
                      No tracker
                    </span>
                  )}
                  {/* Expand/collapse chevron */}
                  <button
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    onClick={(e) => { e.stopPropagation(); toggleConnectedExpansion(item.id); }}
                  >
                    {expandedConnectedItems.has(item.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Expanded details section */}
                {expandedConnectedItems.has(item.id) && (
                  <div className="px-4 pb-4 pt-1 bg-emerald-50/50 border-t border-emerald-100">
                    <div className="ml-12 space-y-3">
                      {/* Job info */}
                      {item.searchCriteria?.jobTitle && (
                        <div className="flex items-center gap-2 text-sm">
                          <ClipboardList className="h-4 w-4 text-emerald-600" />
                          <span className="text-gray-600">Job:</span>
                          <span className="font-medium text-gray-900">{item.searchCriteria.jobTitle}</span>
                        </div>
                      )}

                      {/* Pitch message editor */}
                      {item.trackerId && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-emerald-600" />
                              Pitch Message
                            </label>
                            {editingPitchDraft !== item.id && (
                              <button
                                onClick={() => generatePitchPreview(item)}
                                disabled={generatingPitchPreview.has(item.id)}
                                className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                              >
                                {generatingPitchPreview.has(item.id) ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3" />
                                    Generate with AI
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {editingPitchDraft === item.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={pitchDraftText}
                                onChange={(e) => setPitchDraftText(e.target.value)}
                                className="w-full h-40 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                                placeholder="Enter your pitch message..."
                              />
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">
                                  {pitchDraftText.length} characters
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => { setEditingPitchDraft(null); setPitchDraftText(''); }}
                                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => sendPitchWithCustomMessage(item, pitchDraftText)}
                                    disabled={sendingPitch.has(item.id) || !pitchDraftText.trim()}
                                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50"
                                  >
                                    {sendingPitch.has(item.id) ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Sending...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="h-3.5 w-3.5" />
                                        Send Custom Pitch
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm text-gray-600">
                              <p className="italic">Click "Generate with AI" to create a personalized pitch, or write your own.</p>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  onClick={() => { setPitchDraftText(''); setEditingPitchDraft(item.id); }}
                                  className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                                >
                                  <Edit2 className="h-3 w-3" />
                                  Write manually
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-emerald-100">
                        <div className="flex items-center gap-2">
                          {/* Send auto-generated pitch */}
                          {item.trackerId && editingPitchDraft !== item.id && (
                            <button
                              onClick={() => sendPitch(item)}
                              disabled={sendingPitch.has(item.id)}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50"
                              title="Send auto-generated pitch message"
                            >
                              {sendingPitch.has(item.id) ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Send className="h-3.5 w-3.5" />
                                  Send Auto Pitch
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Remove from queue button */}
                        {confirmingRemove === item.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-600">Remove from queue?</span>
                            <button
                              onClick={() => removeFromQueue(item.id)}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              Yes, remove
                            </button>
                            <button
                              onClick={() => setConfirmingRemove(null)}
                              className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmingRemove(item.id)}
                            className="px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg text-sm flex items-center gap-1.5"
                            title="Remove from queue"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pitch Sent - Awaiting Response (Connection Flow Only) */}
      {activeFlow === 'connection' && connectionPitchSent.length > 0 && (
        <div className="bg-white rounded-lg border border-indigo-200 overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
            <h3 className="font-medium text-indigo-800 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Pitch Sent ({connectionPitchSent.length})
              <span className="ml-2 px-2 py-0.5 bg-indigo-200 text-indigo-800 rounded-full text-xs">
                Awaiting Response
              </span>
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {connectionPitchSent.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                  {item.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.currentTitle} {item.currentCompany && `at ${item.currentCompany}`}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.pitch_sent}`}>
                  Pitch Sent
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replied - Candidates who responded (Flow-aware) */}
      {((activeFlow === 'connection' && connectionReplied.length > 0) ||
        (activeFlow === 'direct' && directReplied.length > 0)) && (
        <div className="bg-white rounded-lg border border-cyan-200 overflow-hidden">
          <div className="px-4 py-3 bg-cyan-50 border-b border-cyan-200">
            <h3 className="font-medium text-cyan-800 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Replied ({activeFlow === 'connection' ? connectionReplied.length : directReplied.length})
              <span className="ml-2 px-2 py-0.5 bg-cyan-200 text-cyan-800 rounded-full text-xs">
                In Conversation
              </span>
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {(activeFlow === 'connection' ? connectionReplied : directReplied).map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600 text-sm font-medium">
                  {item.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.currentTitle} {item.currentCompany && `at ${item.currentCompany}`}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.replied}`}>
                  Replied
                </span>
                <a
                  href="/conversations"
                  className="px-3 py-1 text-xs bg-cyan-100 text-cyan-700 rounded-lg hover:bg-cyan-200"
                >
                  View Conversation
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent Items - Connection Flow (Awaiting Connection) */}
      {activeFlow === 'connection' && connectionSent.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-gray-200">
            <h3 className="font-medium text-green-800 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Awaiting Connection ({connectionSent.length})
            </h3>
            <p className="text-xs text-green-600 mt-1">
              Connection requests sent. Waiting for candidates to accept before pitching.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {connectionSent.map((item) => (
              <div key={item.id} className="border-b border-gray-100 last:border-b-0">
                {/* Main row - clickable to expand */}
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleAwaitingExpansion(item.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium">
                    {item.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      {item.source === 'github' && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-800 text-white text-xs rounded-md" title="Sourced from GitHub">
                          <Github className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{messageTypeLabels[item.messageType].label}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.sent}`}>
                    Sent
                  </span>
                  <button className="p-1 text-gray-400 hover:text-gray-600">
                    {expandedAwaitingItems.has(item.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Expanded details */}
                {expandedAwaitingItems.has(item.id) && (
                  <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                    <div className="ml-12 space-y-2">
                      {/* Job info */}
                      {item.searchCriteria?.jobTitle && (
                        <div className="flex items-center gap-2 text-sm">
                          <ClipboardList className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">Job:</span>
                          <span className="font-medium text-gray-900">{item.searchCriteria.jobTitle}</span>
                        </div>
                      )}

                      {/* Connection type */}
                      <div className="flex items-center gap-2 text-sm">
                        <UserPlus className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600">Type:</span>
                        <span className="font-medium text-gray-900">{messageTypeLabels[item.messageType].label}</span>
                      </div>

                      {/* Message preview (if has message) */}
                      {item.messageDraft && item.messageType !== 'connection_only' && (
                        <div className="text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-600">Message:</span>
                          </div>
                          <p className="ml-6 text-gray-700 text-xs bg-white p-2 rounded border border-gray-200 line-clamp-3">
                            {item.messageDraft}
                          </p>
                        </div>
                      )}

                      {/* Sent timestamp */}
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>Sent {new Date(item.createdAt).toLocaleDateString()} at {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {/* Action buttons */}
                      <div className="pt-2 border-t border-gray-200 mt-3 flex items-center gap-3">
                        {/* Mark as Connected button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsConnected(item);
                          }}
                          disabled={markingConnected.has(item.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Manually mark this connection as accepted (for items sent before tracking was enabled)"
                        >
                          {markingConnected.has(item.id) ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Check className="h-3 w-3" />
                              Mark as Connected
                            </>
                          )}
                        </button>

                        {/* Remove button */}
                        {confirmingRemove === item.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-red-600">Remove?</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromQueue(item.id);
                              }}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Yes
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingRemove(null);
                              }}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingRemove(item.id);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent Items - Direct Flow (Awaiting Reply) */}
      {activeFlow === 'direct' && directSent.length > 0 && (
        <div className="bg-white rounded-lg border border-purple-200 overflow-hidden">
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-200">
            <h3 className="font-medium text-purple-800 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Sent - Awaiting Reply ({directSent.length})
            </h3>
            <p className="text-xs text-purple-600 mt-1">
              Initial pitch messages sent directly. Waiting for candidate response.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {directSent.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-medium">
                  {item.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{messageTypeLabels[item.messageType].label}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800`}>
                  Sent
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Items (Flow-aware) */}
      {((activeFlow === 'connection' && connectionFailed.length > 0) ||
        (activeFlow === 'direct' && directFailed.length > 0)) && (
        <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <h3 className="font-medium text-red-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Failed ({activeFlow === 'connection' ? connectionFailed.length : directFailed.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {(activeFlow === 'connection' ? connectionFailed : directFailed).map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium">
                  {item.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-red-600 truncate">{item.errorMessage || 'Unknown error'}</p>
                </div>
                <button
                  onClick={() => {
                    const updatedQueue = queue.map((q) =>
                      q.id === item.id ? { ...q, status: 'pending' as const, errorMessage: undefined } : q
                    );
                    saveQueue(updatedQueue);
                  }}
                  className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                >
                  Retry
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Human-Like Outreach Progress Modal */}
      <OutreachProgressModal
        isOpen={showOutreachProgress}
        progress={outreachProgress}
        config={timingConfig}
        outreachType={outreachProgress.total > 0 ?
          (pendingItems.find(i => selectedItems.has(i.id))?.messageType === 'inmail' ? 'inmail' :
           pendingItems.find(i => selectedItems.has(i.id))?.messageType === 'message' ? 'message' : 'connection')
          : 'connection'}
        onCancel={() => {
          outreachCancelledRef.current = true;
        }}
        onClose={() => {
          setShowOutreachProgress(false);
          setOutreachProgress({
            current: 0,
            total: 0,
            status: 'waiting',
            statusMessage: '',
            remainingMs: 0,
            isBreak: false,
            successCount: 0,
            failureCount: 0,
            errors: [],
          });
        }}
      />
    </div>
  );
}

// Wrap with Suspense for Next.js 14+ useSearchParams() requirement
export default function QueuePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <QueuePageContent />
    </Suspense>
  );
}
