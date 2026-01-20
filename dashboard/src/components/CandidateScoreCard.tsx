'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Briefcase,
  TrendingUp,
  Users,
  MapPin,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

// Types matching AICandidateScorer output
export interface CandidateScore {
  candidateId: string;
  overallScore: number;
  dimensions: {
    seniorityMatch: DimensionScore;
    technicalFit: DimensionScore;
    careerTrajectory: DimensionScore;
    leadershipEvidence: DimensionScore;
    locationMatch: DimensionScore;
  };
  recommendation: 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO' | 'STRONG_NO';
  highlights: string[];
  concerns: string[];
  suggestedApproach?: string;
  metadata?: {
    scoredAt: Date;
    modelUsed: string;
    latencyMs: number;
    tokensUsed: number;
  };
}

interface DimensionScore {
  score: number;
  weight: number;
  reasoning: string;
  evidence: string[];
}

interface CandidateScoreCardProps {
  score: CandidateScore;
  candidateName: string;
  compact?: boolean;
  showDetails?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

// Recommendation styles
const recommendationStyles = {
  STRONG_YES: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
    icon: CheckCircle,
    label: 'Strong Yes',
  },
  YES: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: CheckCircle,
    label: 'Yes',
  },
  MAYBE: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: AlertTriangle,
    label: 'Maybe',
  },
  NO: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: XCircle,
    label: 'No',
  },
  STRONG_NO: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
    icon: XCircle,
    label: 'Strong No',
  },
};

// Dimension icons
const dimensionIcons = {
  seniorityMatch: Briefcase,
  technicalFit: Sparkles,
  careerTrajectory: TrendingUp,
  leadershipEvidence: Users,
  locationMatch: MapPin,
};

// Dimension labels
const dimensionLabels = {
  seniorityMatch: 'Seniority',
  technicalFit: 'Technical',
  careerTrajectory: 'Trajectory',
  leadershipEvidence: 'Leadership',
  locationMatch: 'Location',
};

export function CandidateScoreCard({
  score,
  candidateName,
  compact = false,
  showDetails: initialShowDetails = false,
  onApprove,
  onReject,
}: CandidateScoreCardProps) {
  const [showDetails, setShowDetails] = useState(initialShowDetails);

  const recStyle = recommendationStyles[score.recommendation];
  const RecIcon = recStyle.icon;

  const getScoreColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    if (s >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreTextColor = (s: number) => {
    if (s >= 80) return 'text-green-700';
    if (s >= 60) return 'text-yellow-700';
    if (s >= 40) return 'text-orange-700';
    return 'text-red-700';
  };

  // Compact version - just score badge
  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border ${recStyle.bg} ${recStyle.border}`}
        title={`AI Score: ${score.overallScore}/100 - ${recStyle.label}`}
      >
        <RecIcon className={`h-3.5 w-3.5 ${recStyle.text}`} />
        <span className={`text-xs font-semibold ${recStyle.text}`}>
          {score.overallScore}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${recStyle.border} overflow-hidden`}>
      {/* Header */}
      <div className={`px-4 py-3 ${recStyle.bg} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <RecIcon className={`h-5 w-5 ${recStyle.text}`} />
            <span className={`font-semibold ${recStyle.text}`}>
              AI Score: {score.overallScore}/100
            </span>
          </div>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${recStyle.bg} ${recStyle.text} border ${recStyle.border}`}>
            {recStyle.label}
          </span>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`p-1 rounded hover:bg-white/50 transition-colors ${recStyle.text}`}
        >
          {showDetails ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Dimension Scores - Always Visible */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          {Object.entries(score.dimensions).map(([key, dim]) => {
            const Icon = dimensionIcons[key as keyof typeof dimensionIcons];
            const label = dimensionLabels[key as keyof typeof dimensionLabels];
            return (
              <div
                key={key}
                className="flex items-center gap-1.5 text-xs"
                title={`${label}: ${dim.score}/100 (${Math.round(dim.weight * 100)}% weight)\n${dim.reasoning}`}
              >
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                <div className="flex items-center gap-1">
                  <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getScoreColor(dim.score)} rounded-full`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${getScoreTextColor(dim.score)}`}>
                    {dim.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Highlights & Concerns - Collapsed by default */}
      {showDetails && (
        <div className="px-4 py-3 bg-gray-50 space-y-3">
          {/* Highlights */}
          {score.highlights.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
                Why Pursue
              </h4>
              <ul className="space-y-1">
                {score.highlights.map((h, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-green-500 mt-0.5">•</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Concerns */}
          {score.concerns.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                <ThumbsDown className="h-3.5 w-3.5 text-amber-600" />
                Areas to Explore
              </h4>
              <ul className="space-y-1">
                {score.concerns.map((c, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Approach */}
          {score.suggestedApproach && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                How to Pitch
              </h4>
              <p className="text-xs text-gray-600 italic">
                &ldquo;{score.suggestedApproach}&rdquo;
              </p>
            </div>
          )}

          {/* Detailed Dimension Scores */}
          <div className="pt-2 border-t border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Score Breakdown</h4>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(score.dimensions).map(([key, dim]) => {
                const label = dimensionLabels[key as keyof typeof dimensionLabels];
                return (
                  <div key={key} className="text-xs">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-gray-600">
                        {label} ({Math.round(dim.weight * 100)}%)
                      </span>
                      <span className={`font-medium ${getScoreTextColor(dim.score)}`}>
                        {dim.score}/100
                      </span>
                    </div>
                    <p className="text-gray-500 text-[10px]">{dim.reasoning}</p>
                    {dim.evidence.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dim.evidence.slice(0, 3).map((e, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]"
                          >
                            {e.length > 40 ? e.slice(0, 40) + '...' : e}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metadata */}
          {score.metadata && (
            <div className="pt-2 border-t border-gray-200 text-[10px] text-gray-400">
              Scored at {new Date(score.metadata.scoredAt).toLocaleString()} •{' '}
              {score.metadata.latencyMs}ms • {score.metadata.tokensUsed} tokens
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {(onApprove || onReject) && (
        <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center justify-end gap-2">
          {onReject && (
            <button
              onClick={onReject}
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              Reject
            </button>
          )}
          {onApprove && (
            <button
              onClick={onApprove}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
            >
              Approve
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Summary card for batch scoring results
export interface BatchScoringSummary {
  totalCandidates: number;
  qualified: number;
  borderline: number;
  unqualified: number;
  avgScore: number;
  processingTimeMs: number;
  totalTokensUsed: number;
}

export function BatchScoringSummaryCard({ summary }: { summary: BatchScoringSummary }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-purple-600" />
        AI Scoring Summary
      </h3>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{summary.qualified}</div>
          <div className="text-xs text-green-700">Qualified (≥70)</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">{summary.borderline}</div>
          <div className="text-xs text-yellow-700">Borderline (50-69)</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{summary.unqualified}</div>
          <div className="text-xs text-red-700">Unqualified (&lt;50)</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Avg Score: <strong>{summary.avgScore}</strong>/100</span>
        <span>{summary.processingTimeMs}ms • {summary.totalTokensUsed} tokens</span>
      </div>
    </div>
  );
}

export default CandidateScoreCard;
