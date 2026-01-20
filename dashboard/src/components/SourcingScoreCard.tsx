'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Briefcase,
  Scale,
  MapPin,
  Brain,
  Sparkles,
  Building2,
  Code2,
} from 'lucide-react';

// Types matching AISourcingScorer output (5-pillar approach)
export interface SourcingScore {
  candidateId: string;
  overallScore: number;
  recommendation: 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO';
  reasoning: string;
  pillars: {
    roleFit: PillarScore;
    scopeMatch: PillarScore;
    technicalFit: PillarScore;
    cultureFit: PillarScore; // Industry affinity + company culture match
    location: PillarScore;
  };
  aiPowered: boolean;
  companyEnriched?: boolean; // Whether company data was used for scoring
}

// Company info returned from research
export interface CompanyInfo {
  id: string;
  name: string;
  headcount: number | null;
  headcountRange: string;
  industry: string | null;
  location: string | null;
  linkedInUrl: string | null;
  followers: number | null;
  enrichedAt: Date;
}

interface PillarScore {
  score: number;
  note: string;
}

interface SourcingScoreCardProps {
  score: SourcingScore;
  candidateName: string;
  compact?: boolean;
  showDetails?: boolean;
}

// Recommendation styles
const recommendationStyles = {
  STRONG_YES: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
    icon: CheckCircle,
    label: 'Strong Match',
    description: 'Prioritize outreach',
  },
  YES: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: CheckCircle,
    label: 'Good Match',
    description: 'Worth reaching out',
  },
  MAYBE: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: AlertTriangle,
    label: 'Possible',
    description: 'Review manually',
  },
  NO: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: XCircle,
    label: 'Weak Match',
    description: 'Likely not a fit',
  },
};

// Pillar configuration
const pillarConfig = {
  roleFit: {
    icon: Briefcase,
    label: 'Role',
    weight: '25%',
    description: 'Are they doing similar work?',
  },
  scopeMatch: {
    icon: Scale,
    label: 'Scope',
    weight: '25%',
    description: 'Right level for this opportunity?',
  },
  technicalFit: {
    icon: Code2,
    label: 'Tech',
    weight: '20%',
    description: 'Tech stack & architecture alignment?',
  },
  cultureFit: {
    icon: Building2,
    label: 'Culture',
    weight: '15%',
    description: 'Industry & company culture fit?',
  },
  location: {
    icon: MapPin,
    label: 'Location',
    weight: '15%',
    description: 'Can they work here?',
  },
};

export function SourcingScoreCard({
  score,
  candidateName,
  compact = false,
  showDetails: initialShowDetails = false,
}: SourcingScoreCardProps) {
  const [showDetails, setShowDetails] = useState(initialShowDetails);

  const recStyle = recommendationStyles[score.recommendation];
  const RecIcon = recStyle.icon;

  const getScoreColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-blue-500';
    if (s >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreDots = (s: number) => {
    const filled = Math.round(s / 25); // 0-4 dots
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i <= filled ? getScoreColor(s) : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    );
  };

  // Compact version - minimal badge with score and pillars
  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${recStyle.bg} ${recStyle.border}`}
        title={`Score: ${score.overallScore} - ${recStyle.label}\n${score.reasoning}`}
      >
        {/* Score Badge */}
        <div className="flex items-center gap-1">
          <span className={`text-sm font-bold ${recStyle.text}`}>
            {score.overallScore}
          </span>
          <span className={`text-[10px] font-medium ${recStyle.text} opacity-75`}>
            {recStyle.label}
          </span>
        </div>

        {/* Mini Pillar Indicators */}
        <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
          {Object.entries(score.pillars).map(([key, pillar]) => {
            const config = pillarConfig[key as keyof typeof pillarConfig];
            const Icon = config.icon;
            return (
              <div
                key={key}
                className="flex items-center gap-0.5"
                title={`${config.label}: ${pillar.score} - ${pillar.note}`}
              >
                <Icon className={`h-3 w-3 ${pillar.score >= 60 ? 'text-green-600' : pillar.score >= 40 ? 'text-yellow-600' : 'text-red-500'}`} />
              </div>
            );
          })}
        </div>

        {/* AI Badge */}
        {score.aiPowered && (
          <span title="AI-powered scoring">
            <Brain className="h-3 w-3 text-purple-500" />
          </span>
        )}

        {/* Company Enriched Badge */}
        {score.companyEnriched && (
          <span title="Company data enriched">
            <Building2 className="h-3 w-3 text-blue-500" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${recStyle.border} overflow-hidden`}>
      {/* Header with Score */}
      <div className={`px-4 py-3 ${recStyle.bg} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${recStyle.text}`}>
              {score.overallScore}
            </span>
            <div className="flex flex-col">
              <span className={`text-sm font-semibold ${recStyle.text}`}>
                {recStyle.label}
              </span>
              <span className={`text-[10px] ${recStyle.text} opacity-75`}>
                {recStyle.description}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {score.aiPowered && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
              <Brain className="h-3 w-3" />
              AI
            </span>
          )}
          {score.companyEnriched && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium" title="Company data enriched">
              <Building2 className="h-3 w-3" />
              Enriched
            </span>
          )}
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
      </div>

      {/* 5-Pillar Summary - Always Visible */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(score.pillars).map(([key, pillar]) => {
            const config = pillarConfig[key as keyof typeof pillarConfig];
            const Icon = config.icon;
            const isGood = pillar.score >= 60;
            const isOk = pillar.score >= 40 && pillar.score < 60;

            return (
              <div
                key={key}
                className={`p-2 rounded-lg ${
                  isGood ? 'bg-green-50' : isOk ? 'bg-yellow-50' : 'bg-red-50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon
                    className={`h-3.5 w-3.5 ${
                      isGood ? 'text-green-600' : isOk ? 'text-yellow-600' : 'text-red-500'
                    }`}
                  />
                  <span className="text-xs font-medium text-gray-700">
                    {config.label}
                  </span>
                  <span className="text-[10px] text-gray-400">{config.weight}</span>
                </div>
                <div className="flex items-center justify-between">
                  {getScoreDots(pillar.score)}
                  <span
                    className={`text-xs font-semibold ${
                      isGood ? 'text-green-700' : isOk ? 'text-yellow-700' : 'text-red-700'
                    }`}
                  >
                    {pillar.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Reasoning - Always visible */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <p className="text-xs text-gray-600 italic flex items-start gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
          {score.reasoning}
        </p>
      </div>

      {/* Detailed Pillar Breakdown - Collapsed by default */}
      {showDetails && (
        <div className="px-4 py-3 bg-white space-y-3">
          <h4 className="text-xs font-semibold text-gray-700">Pillar Breakdown</h4>

          {Object.entries(score.pillars).map(([key, pillar]) => {
            const config = pillarConfig[key as keyof typeof pillarConfig];
            const Icon = config.icon;

            return (
              <div key={key} className="border-l-2 border-gray-200 pl-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-medium text-gray-700">
                      {config.label}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      ({config.weight})
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      pillar.score >= 60 ? 'text-green-700' : pillar.score >= 40 ? 'text-yellow-700' : 'text-red-700'
                    }`}
                  >
                    {pillar.score}/100
                  </span>
                </div>
                <p className="text-[11px] text-gray-600">{pillar.note}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {config.description}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Summary card for batch sourcing results
export interface BatchSourcingSummary {
  totalCandidates: number;
  strongYes: number;
  yes: number;
  maybe: number;
  no: number;
  avgScore: number;
  processingTimeMs: number;
}

export function BatchSourcingSummaryCard({ summary, aiPowered }: { summary: BatchSourcingSummary; aiPowered: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        {aiPowered ? (
          <>
            <Brain className="h-5 w-5 text-purple-600" />
            AI Sourcing Score
          </>
        ) : (
          <>
            <Scale className="h-5 w-5 text-blue-600" />
            Sourcing Score (Heuristic)
          </>
        )}
      </h3>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center p-2 bg-green-50 rounded-lg">
          <div className="text-xl font-bold text-green-600">{summary.strongYes}</div>
          <div className="text-[10px] text-green-700">Strong (80+)</div>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <div className="text-xl font-bold text-blue-600">{summary.yes}</div>
          <div className="text-[10px] text-blue-700">Good (60-79)</div>
        </div>
        <div className="text-center p-2 bg-yellow-50 rounded-lg">
          <div className="text-xl font-bold text-yellow-600">{summary.maybe}</div>
          <div className="text-[10px] text-yellow-700">Maybe (40-59)</div>
        </div>
        <div className="text-center p-2 bg-red-50 rounded-lg">
          <div className="text-xl font-bold text-red-600">{summary.no}</div>
          <div className="text-[10px] text-red-700">Weak (&lt;40)</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Avg Score: <strong className="text-gray-700">{summary.avgScore}</strong>/100
        </span>
        <span>{summary.processingTimeMs}ms</span>
      </div>
    </div>
  );
}

export default SourcingScoreCard;
