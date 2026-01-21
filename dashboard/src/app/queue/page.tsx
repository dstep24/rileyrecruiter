'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Check,
  X,
  Edit2,
  ChevronDown,
  RefreshCw,
  Send,
  User,
  Building,
  MapPin,
  ExternalLink,
  Linkedin,
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
}

interface JobRequisition {
  id: string;
  title: string;
  status: string;
}

interface AssessmentTemplate {
  id: string;
  name: string;
  jobTitle?: string;
  status: string;
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

export default function QueuePage() {
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
  const [hasAiKey, setHasAiKey] = useState<boolean | null>(null);
  const [fetchingAssessment, setFetchingAssessment] = useState<Set<string>>(new Set());
  const [copiedAssessmentLink, setCopiedAssessmentLink] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [assessmentTemplates, setAssessmentTemplates] = useState<AssessmentTemplate[]>([]);
  const [linkingAssessment, setLinkingAssessment] = useState<string | null>(null); // candidate id being linked

  // Load Unipile config, AI key status, and queue from localStorage on mount
  useEffect(() => {
    loadUnipileConfig();
    loadQueue();
    checkAiKey();
    fetchAssessmentTemplates();
  }, []);

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
        { id: 'tmpl-1', name: 'Senior Software Engineer Assessment', jobTitle: 'Senior Software Engineer', status: 'active' },
        { id: 'tmpl-2', name: 'Product Manager Assessment', jobTitle: 'Product Manager', status: 'active' },
        { id: 'tmpl-3', name: 'Data Scientist Assessment', jobTitle: 'Data Scientist', status: 'active' },
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

  const checkAiKey = () => {
    const key = localStorage.getItem('riley_anthropic_api_key');
    setHasAiKey(!!key);
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

  // Filter queue items by status
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
    if (selectedItems.size === pendingItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(pendingItems.map((item) => item.id)));
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

      const response = await fetch(`${API_BASE}/api/ai/generate-outreach`, {
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

  // Send all selected messages
  const sendSelected = async () => {
    const itemsToSend = pendingItems.filter((item) => selectedItems.has(item.id));
    for (const item of itemsToSend) {
      await sendMessage(item);
    }
    setSelectedItems(new Set());
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
        </div>
      </div>

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

      {/* Empty State */}
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

      {/* Queue List */}
      {pendingItems.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
            <input
              type="checkbox"
              checked={selectedItems.size === pendingItems.length && pendingItems.length > 0}
              onChange={selectAll}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="w-64">Candidate</span>
            <span className="flex-1">Message Type</span>
            <span className="w-24 text-center">Score</span>
            <span className="w-20 text-center">Added</span>
            <span className="w-48 text-center">Actions</span>
          </div>

          {/* Pending Items */}
          {pendingItems.map((item) => (
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
                                    {assessmentTemplates.filter(t => t.status === 'active').map((template) => (
                                      <option key={template.id} value={template.id}>
                                        {template.name}
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

      {/* Connection Accepted - Ready for Pitch */}
      {acceptedItems.length > 0 && (
        <div className="bg-white rounded-lg border border-emerald-200 overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
            <h3 className="font-medium text-emerald-800 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Connection Accepted ({acceptedItems.length})
              <span className="ml-2 px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full text-xs">
                Ready to Pitch
              </span>
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {acceptedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-sm font-medium">
                  {item.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.currentTitle} {item.currentCompany && `at ${item.currentCompany}`}</p>
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
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pitch Sent - Awaiting Response */}
      {pitchSentItems.length > 0 && (
        <div className="bg-white rounded-lg border border-indigo-200 overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
            <h3 className="font-medium text-indigo-800 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Pitch Sent ({pitchSentItems.length})
              <span className="ml-2 px-2 py-0.5 bg-indigo-200 text-indigo-800 rounded-full text-xs">
                Awaiting Response
              </span>
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {pitchSentItems.map((item) => (
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

      {/* Replied - Candidates who responded */}
      {repliedItems.length > 0 && (
        <div className="bg-white rounded-lg border border-cyan-200 overflow-hidden">
          <div className="px-4 py-3 bg-cyan-50 border-b border-cyan-200">
            <h3 className="font-medium text-cyan-800 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Replied ({repliedItems.length})
              <span className="ml-2 px-2 py-0.5 bg-cyan-200 text-cyan-800 rounded-full text-xs">
                In Conversation
              </span>
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {repliedItems.map((item) => (
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

      {/* Sent Items */}
      {sentItems.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-gray-200">
            <h3 className="font-medium text-green-800 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Awaiting Connection ({sentItems.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {sentItems.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-medium">
                  {item.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{messageTypeLabels[item.messageType].label}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors.sent}`}>
                  Sent
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Items */}
      {failedItems.length > 0 && (
        <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <h3 className="font-medium text-red-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Failed ({failedItems.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {failedItems.map((item) => (
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
    </div>
  );
}
