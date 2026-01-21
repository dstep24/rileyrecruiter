'use client';

import { useState } from 'react';
import {
  ClipboardList,
  CheckCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  XCircle,
  AlertCircle,
  Loader2,
  Send,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Types
interface AssessmentFlag {
  type: string;
  label: string;
  severity: 'info' | 'warning' | 'critical';
}

interface DimensionScore {
  dimension: string;
  score: number;
  note: string;
}

interface AssessmentAnswer {
  questionText: string;
  answerText: string;
}

interface AssessmentResult {
  response: {
    id: string;
    status: 'PENDING' | 'STARTED' | 'COMPLETED' | 'EXPIRED';
    aiScore?: number;
    aiSummary?: string;
    aiFlags?: string[];
    submittedAt?: string;
    createdAt: string;
  };
  template: {
    id: string;
    name: string;
  };
  answers: {
    question: {
      questionText: string;
    };
    answerText: string;
  }[];
}

interface AssessmentResultCardProps {
  conversationId: string;
  assessment?: AssessmentResult | null;
  onSendAssessment?: (templateId: string) => void;
  templates?: { id: string; name: string }[];
  compact?: boolean;
}

export function AssessmentResultCard({
  conversationId,
  assessment,
  onSendAssessment,
  templates = [],
  compact = false,
}: AssessmentResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sending, setSending] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const handleSendAssessment = async () => {
    if (!selectedTemplateId || !onSendAssessment) return;
    setSending(true);
    try {
      await onSendAssessment(selectedTemplateId);
      setShowTemplateSelector(false);
      setSelectedTemplateId('');
    } finally {
      setSending(false);
    }
  };

  // No assessment yet - show option to send one
  if (!assessment) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-600">
            <ClipboardList className="w-5 h-5" />
            <span className="text-sm font-medium">No assessment sent</span>
          </div>
          {templates.length > 0 && onSendAssessment && (
            <button
              onClick={() => setShowTemplateSelector(!showTemplateSelector)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Send className="w-4 h-4" />
              Send Assessment
            </button>
          )}
        </div>

        {showTemplateSelector && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <label className="block text-sm text-gray-600 mb-2">
              Select a template:
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Choose a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSendAssessment}
                disabled={!selectedTemplateId || sending}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Send'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const { response, template, answers } = assessment;

  // Status display
  const getStatusDisplay = () => {
    switch (response.status) {
      case 'PENDING':
        return {
          icon: <Clock className="w-4 h-4 text-yellow-500" />,
          label: 'Pending',
          color: 'bg-yellow-100 text-yellow-700',
        };
      case 'STARTED':
        return {
          icon: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
          label: 'In Progress',
          color: 'bg-blue-100 text-blue-700',
        };
      case 'COMPLETED':
        return {
          icon: <CheckCircle className="w-4 h-4 text-green-500" />,
          label: 'Completed',
          color: 'bg-green-100 text-green-700',
        };
      case 'EXPIRED':
        return {
          icon: <XCircle className="w-4 h-4 text-gray-500" />,
          label: 'Expired',
          color: 'bg-gray-100 text-gray-700',
        };
      default:
        return {
          icon: <AlertCircle className="w-4 h-4 text-gray-500" />,
          label: response.status,
          color: 'bg-gray-100 text-gray-700',
        };
    }
  };

  const status = getStatusDisplay();

  // Score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    if (score >= 40) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  // Flag icon
  const getFlagIcon = (severity: 'info' | 'warning' | 'critical') => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-3 h-3 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-3 h-3 text-yellow-500" />;
      default:
        return <CheckCircle className="w-3 h-3 text-green-500" />;
    }
  };

  // Parse flags from string array
  const parseFlags = (flagTypes: string[]): AssessmentFlag[] => {
    const flagMap: Record<string, { label: string; severity: 'info' | 'warning' | 'critical' }> = {
      sponsorship_needed: { label: 'Requires sponsorship', severity: 'warning' },
      sponsorship_uncertain: { label: 'Work auth unclear', severity: 'warning' },
      salary_high: { label: 'Salary above range', severity: 'warning' },
      salary_low: { label: 'Salary below range', severity: 'info' },
      availability_delayed: { label: 'Not available soon', severity: 'warning' },
      availability_immediate: { label: 'Available immediately', severity: 'info' },
      relocation_required: { label: 'Relocation needed', severity: 'warning' },
      remote_preferred: { label: 'Prefers remote', severity: 'info' },
      experience_gap: { label: 'Missing experience', severity: 'warning' },
      strong_interest: { label: 'Strong interest', severity: 'info' },
      scoring_error: { label: 'Scoring failed', severity: 'critical' },
    };

    return flagTypes.map((type) => ({
      type,
      label: flagMap[type]?.label || type.replace(/_/g, ' '),
      severity: flagMap[type]?.severity || 'info',
    }));
  };

  const flags = response.aiFlags ? parseFlags(response.aiFlags) : [];

  if (compact) {
    // Compact view for list display
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          response.status === 'COMPLETED' && response.aiScore
            ? getScoreColor(response.aiScore)
            : status.color
        }`}
      >
        <ClipboardList className="w-4 h-4" />
        <span className="text-sm font-medium">
          {response.status === 'COMPLETED' && response.aiScore
            ? `${response.aiScore}/100`
            : status.label}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              response.status === 'COMPLETED' && response.aiScore
                ? getScoreColor(response.aiScore)
                : 'bg-gray-100'
            }`}
          >
            {response.status === 'COMPLETED' && response.aiScore ? (
              <span className="font-bold text-lg">{response.aiScore}</span>
            ) : (
              status.icon
            )}
          </div>
          <div>
            <h4 className="font-medium text-gray-900">{template.name}</h4>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className={`px-2 py-0.5 rounded-full text-xs ${status.color}`}>
                {status.label}
              </span>
              {response.submittedAt && (
                <span>
                  Submitted {new Date(response.submittedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Expanded Content */}
      {expanded && response.status === 'COMPLETED' && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* AI Summary */}
          {response.aiSummary && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">AI Summary</h5>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                {response.aiSummary}
              </p>
            </div>
          )}

          {/* Flags */}
          {flags.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Flags</h5>
              <div className="flex flex-wrap gap-2">
                {flags.map((flag, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      flag.severity === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : flag.severity === 'warning'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {getFlagIcon(flag.severity)}
                    {flag.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Answers */}
          {answers.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Responses</h5>
              <div className="space-y-3">
                {answers.map((a, i) => (
                  <div key={i} className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm font-medium text-gray-700">
                      {a.question.questionText}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">{a.answerText}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AssessmentResultCard;
