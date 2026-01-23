'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  Search,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Building,
  Building2,
  MapPin,
  ExternalLink,
  Loader2,
  Sparkles,
  AlertCircle,
  Linkedin,
  Brain,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Copy,
  Check,
  MessageSquareText,
  Globe,
  Briefcase,
  Github,
  Mail,
  Star,
  GitFork,
  Code,
} from 'lucide-react';
import { CandidateScoreCard, BatchScoringSummaryCard, type CandidateScore } from '../../components/CandidateScoreCard';
import { SourcingScoreCard, BatchSourcingSummaryCard, type SourcingScore } from '../../components/SourcingScoreCard';
import { BooleanQueryEditor } from '../../components/BooleanQueryEditor';
import { useRileyContext } from '../../components/providers/RileyContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Unipile config from localStorage
interface UnipileConfig {
  apiKey: string;
  dsn: string;
  port: string;
  accountId: string;
}

// GitHub config from localStorage
interface GitHubConfig {
  token: string;
  username: string;
  name?: string;
  connectedAt: string;
}

// GitHub candidate from search
interface GitHubCandidate {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  linkedinUrl: string | null; // Extracted from bio or blog field
  email: string | null;
  emailSource: 'profile' | 'commits' | null;
  emailConfidence: 'high' | 'medium' | 'low';
  followers: number;
  publicRepos: number;
  topLanguages: string[];
  totalStars: number;
  avatarUrl: string;
  htmlUrl: string;
  hireable: boolean | null;
  createdAt: string;
  // Extracted from repo names and descriptions for keyword matching
  repoKeywords: string;
}

// GitHub-specific 4-pillar scoring for candidate match quality
interface GitHubCandidateScore {
  overall: number; // 0-100 weighted average
  technicalFit: {
    score: number; // 0-100
    reasons: string[]; // e.g., "Go (required language)", "45 public repos"
  };
  senioritySignals: {
    score: number;
    reasons: string[]; // e.g., "1,200 followers (senior-level)", "Account age: 8 years"
  };
  keywordMatch: {
    score: number;
    matchedKeywords: string[]; // Keywords found in bio/company
    totalKeywords: number; // Total keywords searched
  };
  contactQuality: {
    score: number;
    reasons: string[]; // e.g., "Email available (high confidence)", "Marked as hireable"
  };
}

// Search source type
type SearchSource = 'linkedin' | 'github';

// Unipile search result types
interface UnipileSearchProfile {
  id?: string;
  provider_id?: string;
  member_urn?: string;  // LinkedIn URN (alternative identifier field)
  urn?: string;         // Another URN format
  entity_urn?: string;  // Entity URN format
  social_id?: string;   // Social ID
  public_identifier?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;     // About section (from full profile fetch)
  location?: string;
  profile_url?: string;
  profile_picture_url?: string;
  network_distance?: string;
  current_positions?: Array<{
    company?: string;
    role?: string;
    tenure_at_role?: { years?: number };
  }>;
  // Full profile data (populated when enriched)
  experiences?: Array<{
    title: string;
    company_name: string;
    start_date?: string;
    end_date?: string;
    is_current?: boolean;
    description?: string;
  }>;
  skills?: string[];
}

interface JobRequisition {
  id: string;
  title: string;
  description: string;
  location?: string;
  status: string;
}

interface ParsedCriteria {
  titles: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  experienceYears: { min: number; max: number };
  locations: string[];
  booleanQuery: string;
  searchKeywords: string;
  confidence: number;
}

// AI-generated search strategy with rich insights
interface AISearchStrategy {
  seniorityLevel: string;
  levelRationale: string;
  primaryTitles: string[];
  titleVariants: string[];
  excludeTitles: string[];
  minYearsExperience: number;
  minYearsAtLevel: number;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  skillWeights: Record<string, number>;
  leadershipIndicators: string[];
  achievementPatterns: string[];
  redFlags: string[];
  searchQueries: Array<{
    query: string;
    api: string;
    priority: number;
    rationale: string;
    expectedYield: string;
  }>;
  reasoning: string;
  confidence: number;
}

interface CandidateExperience {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
}

interface SourcedCandidate {
  id: string;
  providerId?: string; // LinkedIn provider ID for messaging
  name: string;
  headline?: string;
  summary?: string; // About section
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  profileUrl: string;
  profilePictureUrl?: string;
  relevanceScore: number;
  fitScore?: number;
  status: 'new' | 'queued' | 'contacted' | 'rejected';
  aiScore?: CandidateScore; // AI-powered qualification score (old 5-dimension)
  sourcingScore?: SourcingScore; // New 3-pillar sourcing score
  // Full profile data (populated when profiles are enriched)
  experiences?: CandidateExperience[];
  skills?: string[];
  isProfileEnriched?: boolean; // Flag to track if full profile was fetched
}

// Queue item for messaging
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
  status: 'pending' | 'approved' | 'sent' | 'rejected';
  messageType: 'connection_request' | 'inmail' | 'message';
  messageDraft?: string;
  createdAt: string;
  searchCriteria?: {
    jobTitle: string;
    skills: string[];
  };
  // Job requisition linkage for assessments
  jobRequisitionId?: string;
  assessmentTemplateId?: string;
  assessmentUrl?: string;
}

interface SearchRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  totalFound: number;
  candidates: SourcedCandidate[];
  criteria?: ParsedCriteria;
  error?: string;
  aiScoringSummary?: {
    totalCandidates: number;
    qualified: number;
    borderline: number;
    unqualified: number;
    avgScore: number;
    processingTimeMs: number;
    totalTokensUsed: number;
  };
  // New 3-pillar sourcing summary
  sourcingScoreSummary?: {
    totalCandidates: number;
    strongYes: number;
    yes: number;
    maybe: number;
    no: number;
    avgScore: number;
    processingTimeMs: number;
  };
  sourcingAiPowered?: boolean;
}

// Storage key for persisting sourcing state
const SOURCING_STORAGE_KEY = 'riley_sourcing_state';

interface PersistedSourcingState {
  customJD: {
    title: string;
    description: string;
    skills: string;
    location: string;
  };
  parsedCriteria: ParsedCriteria | null;
  searchStrategy: AISearchStrategy | null;
  searchRun: SearchRun | null;
  filterByScore: 'all' | 'qualified' | 'borderline' | 'unqualified';
  aiScoringEnabled: boolean;
  maxResults: number;
}

export default function SourcingPage() {
  // Riley context for activity logging
  const { addSearch, setCandidatesInPipeline, logActivity } = useRileyContext();

  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [selectedReq, setSelectedReq] = useState<string>('');
  const [customJD, setCustomJD] = useState({
    title: '',
    description: '',
    skills: '',
    location: '',
    companyName: '', // Company name for internal tracking (NOT shown to candidates in assessments)
    isFullyRemote: false, // If true, skip location filtering in search
    isContractRole: false, // If true, prioritize candidates with contract/freelance experience
    usOnlySearch: true, // Default to US only - we don't recruit internationally unless specified
    intakeNotes: '', // Notes from hiring manager conversation - takes precedence over JD
    excludeCompanies: '', // Companies to exclude (e.g., "Google, Facebook, Amazon")
    targetIndustries: '', // Target industries for cultural fit (e.g., "fintech, insurance, banking")
  });
  const [parsedCriteria, setParsedCriteria] = useState<ParsedCriteria | null>(null);
  const [searchStrategy, setSearchStrategy] = useState<AISearchStrategy | null>(null);
  const [searchRun, setSearchRun] = useState<SearchRun | null>(null);
  const searchRunRef = useRef<SearchRun | null>(null);
  const [maxResults, setMaxResults] = useState(50);
  const [isParsing, setIsParsing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAutoParsingSkills, setIsAutoParsingSkills] = useState(false);
  const [skillsAutoPopulated, setSkillsAutoPopulated] = useState(false);
  const [locationChoices, setLocationChoices] = useState<string[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [unipileConfig, setUnipileConfig] = useState<UnipileConfig | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchApiUsed, setSearchApiUsed] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [isAiScoring, setIsAiScoring] = useState(false);
  const [isEnrichingProfiles, setIsEnrichingProfiles] = useState(false);
  const [aiScoringEnabled, setAiScoringEnabled] = useState(true);
  const [showScoreDetails, setShowScoreDetails] = useState<Set<string>>(new Set());
  const [filterByScore, setFilterByScore] = useState<'all' | 'qualified' | 'borderline' | 'unqualified'>('all');
  const [isHydrated, setIsHydrated] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState<{
    keywords: string;
    location: string | null;
    locationId: string | number | null;
    api: string;
    fullBody: Record<string, unknown>;
    confirmedParams?: Record<string, unknown>; // What Unipile actually used
  } | null>(null);
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [copiedUrls, setCopiedUrls] = useState(false);
  const [editableBooleanQuery, setEditableBooleanQuery] = useState('');
  const [isBooleanQueryValid, setIsBooleanQueryValid] = useState(true);

  // Search Source State (LinkedIn vs GitHub)
  const [searchSource, setSearchSource] = useState<SearchSource>('linkedin');
  const [githubConfig, setGithubConfig] = useState<GitHubConfig | null>(null);
  const [githubSearchParams, setGithubSearchParams] = useState({
    language: '',
    location: '',
    keywords: '',
    minFollowers: '',
    minRepos: '',
  });
  const [githubCandidates, setGithubCandidates] = useState<GitHubCandidate[]>([]);
  const [isSearchingGithub, setIsSearchingGithub] = useState(false);
  const [githubSearchError, setGithubSearchError] = useState<string | null>(null);
  const [extractingEmails, setExtractingEmails] = useState<Set<string>>(new Set());
  const [isGeneratingGithubKeywords, setIsGeneratingGithubKeywords] = useState(false);
  const [githubKeywordSource, setGithubKeywordSource] = useState<'basic' | 'ai'>('basic');
  const [expandedGithubCandidates, setExpandedGithubCandidates] = useState<Set<string>>(new Set());
  const [githubCandidateScores, setGithubCandidateScores] = useState<Map<string, GitHubCandidateScore>>(new Map());
  const [filterLinkedInOnly, setFilterLinkedInOnly] = useState(false);

  // Company Research State
  const [autoResearchEnabled, setAutoResearchEnabled] = useState(false);
  const [researchingCompanies, setResearchingCompanies] = useState<Set<string>>(new Set());
  const [companyData, setCompanyData] = useState<Map<string, {
    id: string;
    name: string;
    headcount: number | null;
    headcountRange: string;
    industry: string | null;
    location: string | null;
  }>>(new Map());

  // Keep searchRunRef in sync with searchRun state (for use in callbacks)
  useEffect(() => {
    searchRunRef.current = searchRun;
  }, [searchRun]);

  // Load persisted state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOURCING_STORAGE_KEY);
      if (saved) {
        const parsed: PersistedSourcingState = JSON.parse(saved);
        if (parsed.customJD) setCustomJD({
          title: parsed.customJD.title || '',
          description: parsed.customJD.description || '',
          skills: parsed.customJD.skills || '',
          location: parsed.customJD.location || '',
          companyName: (parsed.customJD as { companyName?: string }).companyName || '',
          isFullyRemote: (parsed.customJD as { isFullyRemote?: boolean }).isFullyRemote || false,
          isContractRole: (parsed.customJD as { isContractRole?: boolean }).isContractRole || false,
          usOnlySearch: (parsed.customJD as { usOnlySearch?: boolean }).usOnlySearch !== false, // Default to true
          intakeNotes: (parsed.customJD as { intakeNotes?: string }).intakeNotes || '',
          excludeCompanies: (parsed.customJD as { excludeCompanies?: string }).excludeCompanies || '',
          targetIndustries: (parsed.customJD as { targetIndustries?: string }).targetIndustries || '',
        });
        if (parsed.parsedCriteria) setParsedCriteria(parsed.parsedCriteria);
        if (parsed.searchStrategy) setSearchStrategy(parsed.searchStrategy);
        if (parsed.searchRun) setSearchRun(parsed.searchRun);
        if (parsed.filterByScore) setFilterByScore(parsed.filterByScore);
        if (typeof parsed.aiScoringEnabled === 'boolean') setAiScoringEnabled(parsed.aiScoringEnabled);
        if (parsed.maxResults) setMaxResults(parsed.maxResults);
      }
    } catch {
      // Ignore parse errors
    }
    setIsHydrated(true);
  }, []);

  // Persist state to localStorage whenever key values change
  useEffect(() => {
    // Don't save until we've loaded the initial state
    if (!isHydrated) return;

    const stateToSave: PersistedSourcingState = {
      customJD,
      parsedCriteria,
      searchStrategy,
      searchRun,
      filterByScore,
      aiScoringEnabled,
      maxResults,
    };

    try {
      localStorage.setItem(SOURCING_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }, [isHydrated, customJD, parsedCriteria, searchStrategy, searchRun, filterByScore, aiScoringEnabled, maxResults]);

  // Load Unipile config from localStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('riley_unipile_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.apiKey && parsed.accountId && parsed.dsn) {
          setUnipileConfig(parsed);
          setDemoMode(false);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Load GitHub config from localStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('riley_github_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.token) {
          setGithubConfig(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Auto-populate GitHub search params from parsed JD criteria
  // Use a ref to track which JD we've already populated for
  const lastPopulatedJDRef = useRef<string>('');

  // Generate AI-powered GitHub keywords
  const generateAIGithubKeywords = async () => {
    if (!customJD.title) return;

    setIsGeneratingGithubKeywords(true);
    try {
      const response = await fetch(`${API_BASE}/api/sourcing/github/generate-keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: customJD.title,
          jobDescription: customJD.description,
          requiredSkills: parsedCriteria?.requiredSkills || customJD.skills.split(',').map(s => s.trim()).filter(Boolean),
          preferredSkills: parsedCriteria?.preferredSkills,
          intakeNotes: customJD.intakeNotes,
          existingSearchStrategy: searchStrategy ? {
            mustHaveSkills: searchStrategy.mustHaveSkills,
            niceToHaveSkills: searchStrategy.niceToHaveSkills,
            seniorityLevel: searchStrategy.seniorityLevel,
          } : undefined,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[GitHub AI Keywords] Generated:', result);

        // Combine primary and secondary keywords (primary first)
        const allKeywords = [
          ...result.primaryKeywords,
          ...result.secondaryKeywords,
        ].slice(0, 10); // Limit to 10 keywords

        // Get location from JD
        let location = '';
        if (!customJD.isFullyRemote) {
          const rawLocation = parsedCriteria?.locations?.[0] || customJD.location || '';
          if (rawLocation && !rawLocation.toLowerCase().match(/^(remote|hybrid|anywhere|global|worldwide)/)) {
            location = rawLocation;
          }
        }

        // Set minimum followers/repos based on seniority
        let minFollowers = '';
        let minRepos = '';
        if (searchStrategy?.seniorityLevel) {
          const level = searchStrategy.seniorityLevel.toLowerCase();
          if (level.includes('senior') || level.includes('staff') || level.includes('principal')) {
            minFollowers = '50';
            minRepos = '10';
          } else if (level.includes('mid') || level.includes('ii') || level.includes('iii')) {
            minFollowers = '20';
            minRepos = '5';
          }
        }

        setGithubSearchParams({
          language: result.suggestedLanguage || '',
          location: location,
          keywords: allKeywords.join(' '),
          minFollowers: minFollowers,
          minRepos: minRepos,
        });
        setGithubKeywordSource('ai');
      } else {
        console.error('[GitHub AI Keywords] Failed to generate, falling back to basic');
        // Fall back to basic keyword generation
        generateBasicGithubKeywords();
      }
    } catch (error) {
      console.error('[GitHub AI Keywords] Error:', error);
      // Fall back to basic keyword generation
      generateBasicGithubKeywords();
    } finally {
      setIsGeneratingGithubKeywords(false);
    }
  };

  // Basic keyword generation (fallback when AI is unavailable)
  const generateBasicGithubKeywords = () => {
    // Detect if this is an infrastructure/platform role
    const detectInfraRole = (title: string, skills: string[]): boolean => {
      const allText = `${title} ${skills.join(' ')}`.toLowerCase();
      const infraPatterns = [
        /\bplatform\s+engineer/,
        /\bdevops/,
        /\bsre\b/,
        /\bsite\s+reliability/,
        /\binfrastructure\s+engineer/,
        /\bcloud\s+engineer/,
        /\bcloud\s+architect/,
        /\bsystems?\s+engineer/,
        /\bdevsecops/,
        /\bterraform/,
        /\bbicep/,
        /\bazure\s+platform/,
        /\baws\s+platform/,
        /\bgcp\s+platform/,
        /\blanding\s+zones?/,
      ];
      return infraPatterns.some(pattern => pattern.test(allText));
    };

    const allSkillsRaw = [
      ...(searchStrategy?.mustHaveSkills || []),
      ...(parsedCriteria?.requiredSkills || []),
    ];
    const isInfraRole = detectInfraRole(customJD.title || '', allSkillsRaw);

    // Map common programming skills to GitHub languages
    // For infra roles, terraform -> hcl, not python
    const languageMap: Record<string, string> = {
      // Core languages
      'typescript': 'typescript',
      'javascript': 'javascript',
      'python': 'python',
      'java': 'java',
      'go': 'go',
      'golang': 'go',
      'rust': 'rust',
      'c++': 'cpp',
      'c#': 'csharp',
      'ruby': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kotlin': 'kotlin',
      'scala': 'scala',
      // Frontend frameworks
      'react': 'typescript',
      'reactjs': 'typescript',
      'react.js': 'typescript',
      'node': 'javascript',
      'nodejs': 'javascript',
      'node.js': 'javascript',
      'vue': 'javascript',
      'vuejs': 'javascript',
      'angular': 'typescript',
      // Backend frameworks
      'django': 'python',
      'flask': 'python',
      'fastapi': 'python',
      'rails': 'ruby',
      'spring': 'java',
      'springboot': 'java',
      '.net': 'csharp',
      'dotnet': 'csharp',
      // DevOps/Infrastructure - different mapping for infra roles
      'terraform': isInfraRole ? 'hcl' : 'python',
      'bicep': 'bicep',
      'ansible': 'python',
      'kubernetes': 'go',
      'k8s': 'go',
      'docker': isInfraRole ? 'shell' : 'python',
      'aws': isInfraRole ? 'shell' : 'python',
      'azure': isInfraRole ? 'powershell' : 'python',
      'gcp': isInfraRole ? 'shell' : 'python',
      'devops': isInfraRole ? 'shell' : 'python',
      'sre': 'go',
      'platform engineer': isInfraRole ? 'hcl' : 'go',
      'infrastructure': isInfraRole ? 'hcl' : 'python',
      'pulumi': 'typescript',
      'cloudformation': 'python',
      'bash': 'shell',
      'shell': 'shell',
      'powershell': 'powershell',
      'ci/cd': 'shell',
      'jenkins': 'python',
      'azure devops': 'shell',
      'arm templates': 'json',
      'landing zones': 'hcl',
    };

    // Find the most prevalent programming language from the full JD context
    // Combine all text sources: skills, description, title
    const allSkills = [
      ...(searchStrategy?.mustHaveSkills || []),
      ...(parsedCriteria?.requiredSkills || []),
      ...(parsedCriteria?.preferredSkills || []),
    ].map(s => s.toLowerCase().trim());

    // Build full text to search for language mentions
    const fullText = [
      customJD.title || '',
      customJD.description || '',
      ...allSkills,
    ].join(' ').toLowerCase();

    // Count occurrences of each language/framework in the full text
    const languageCounts: Record<string, number> = {};
    for (const [term, lang] of Object.entries(languageMap)) {
      // Use word boundary regex to avoid partial matches
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = fullText.match(regex);
      if (matches) {
        // Boost weight for infra languages when in infra role
        const weight = isInfraRole && ['hcl', 'shell', 'powershell', 'bicep'].includes(lang) ? 2 : 1;
        languageCounts[lang] = (languageCounts[lang] || 0) + (matches.length * weight);
      }
    }

    // Also check skills list for exact matches (higher weight)
    for (const skill of allSkills) {
      const mapped = languageMap[skill];
      if (mapped) {
        languageCounts[mapped] = (languageCounts[mapped] || 0) + 3; // Weight skills higher
      }
    }

    // Find the most prevalent language (default to hcl for infra, python otherwise)
    let detectedLanguage = isInfraRole ? 'hcl' : '';
    let maxCount = 0;
    for (const [lang, count] of Object.entries(languageCounts)) {
      if (count > maxCount) {
        maxCount = count;
        detectedLanguage = lang;
      }
    }

    // If no language detected, try to infer from job title keywords
    if (!detectedLanguage && customJD.title) {
      const titleLower = customJD.title.toLowerCase();
      // Title mappings - infra-aware
      const titleMappings: Record<string, string> = {
        'platform engineer': isInfraRole ? 'hcl' : 'go',
        'devops': isInfraRole ? 'shell' : 'python',
        'sre': 'go',
        'site reliability': 'go',
        'infrastructure': isInfraRole ? 'hcl' : 'python',
        'cloud engineer': isInfraRole ? 'hcl' : 'python',
        'cloud architect': isInfraRole ? 'hcl' : 'python',
        'azure': isInfraRole ? 'powershell' : 'python',
        'aws': isInfraRole ? 'shell' : 'python',
        'data engineer': 'python',
        'ml engineer': 'python',
        'machine learning': 'python',
        'backend': 'go',
        'frontend': 'typescript',
        'fullstack': 'typescript',
        'full stack': 'typescript',
        'mobile': 'kotlin',
        'ios': 'swift',
        'android': 'kotlin',
      };
      for (const [keyword, lang] of Object.entries(titleMappings)) {
        if (titleLower.includes(keyword)) {
          detectedLanguage = lang;
          break;
        }
      }
    }

    console.log('[GitHub Basic Keywords] Language detection:', { isInfraRole, languageCounts, detectedLanguage });

    // Build keywords - for basic mode, use skills + infra-specific keywords if applicable
    let technicalSkills = (searchStrategy?.mustHaveSkills || parsedCriteria?.requiredSkills || [])
      .filter(s => {
        const lower = s.toLowerCase().trim();
        return !languageMap[lower] &&
               s.length < 20 &&
               !['software', 'engineering', 'development', 'programming', 'senior', 'junior', 'engineer', 'developer'].includes(lower);
      })
      .slice(0, isInfraRole ? 5 : 2); // More keywords for infra roles since they're harder to find

    // For infra roles, add common infra keywords if not already present
    if (isInfraRole) {
      const infraKeywords = ['terraform', 'kubernetes', 'azure', 'aws', 'devops', 'infrastructure', 'iac', 'ci/cd'];
      for (const kw of infraKeywords) {
        if (!technicalSkills.map(s => s.toLowerCase()).includes(kw) && technicalSkills.length < 8) {
          technicalSkills.push(kw);
        }
      }
    }

    // Get location from JD
    let location = '';
    if (!customJD.isFullyRemote) {
      const rawLocation = parsedCriteria?.locations?.[0] || customJD.location || '';
      if (rawLocation && !rawLocation.toLowerCase().match(/^(remote|hybrid|anywhere|global|worldwide)/)) {
        location = rawLocation;
      }
    }

    // Set minimum followers/repos based on seniority
    let minFollowers = '';
    let minRepos = '';
    if (searchStrategy?.seniorityLevel) {
      const level = searchStrategy.seniorityLevel.toLowerCase();
      if (level.includes('senior') || level.includes('staff') || level.includes('principal')) {
        minFollowers = '50';
        minRepos = '10';
      } else if (level.includes('mid') || level.includes('ii') || level.includes('iii')) {
        minFollowers = '20';
        minRepos = '5';
      }
    }

    setGithubSearchParams({
      language: detectedLanguage,
      location: location,
      keywords: technicalSkills.join(' '),
      minFollowers: minFollowers,
      minRepos: minRepos,
    });
    setGithubKeywordSource('basic');
  };

  // Score a GitHub candidate against search criteria using 4 pillars
  const scoreGitHubCandidate = (
    candidate: GitHubCandidate,
    searchKeywords: string[],
    requiredLanguage?: string
  ): GitHubCandidateScore => {
    // 1. TECHNICAL FIT (30%) - Languages, repos, stars
    const technicalReasons: string[] = [];
    let technicalScore = 0;

    // Language match
    if (requiredLanguage && candidate.topLanguages.length > 0) {
      const langLower = requiredLanguage.toLowerCase();
      const hasLanguage = candidate.topLanguages.some(l => l.toLowerCase() === langLower);
      if (hasLanguage) {
        technicalScore += 40;
        technicalReasons.push(`${requiredLanguage} (required language)`);
      } else {
        technicalReasons.push(`Missing ${requiredLanguage} in top languages`);
      }
    } else if (candidate.topLanguages.length > 0) {
      technicalScore += 20; // Has some languages
      technicalReasons.push(`Languages: ${candidate.topLanguages.slice(0, 3).join(', ')}`);
    }

    // Repo count
    if (candidate.publicRepos >= 50) {
      technicalScore += 30;
      technicalReasons.push(`${candidate.publicRepos} public repos (prolific)`);
    } else if (candidate.publicRepos >= 20) {
      technicalScore += 20;
      technicalReasons.push(`${candidate.publicRepos} public repos (active)`);
    } else if (candidate.publicRepos >= 5) {
      technicalScore += 10;
      technicalReasons.push(`${candidate.publicRepos} public repos`);
    }

    // Total stars
    if (candidate.totalStars >= 500) {
      technicalScore += 30;
      technicalReasons.push(`${candidate.totalStars.toLocaleString()} total stars (high quality)`);
    } else if (candidate.totalStars >= 100) {
      technicalScore += 20;
      technicalReasons.push(`${candidate.totalStars.toLocaleString()} total stars (good quality)`);
    } else if (candidate.totalStars >= 10) {
      technicalScore += 10;
      technicalReasons.push(`${candidate.totalStars.toLocaleString()} total stars`);
    }

    // 2. SENIORITY SIGNALS (25%) - Followers, account age, stars
    const seniorityReasons: string[] = [];
    let seniorityScore = 0;

    // Followers
    if (candidate.followers >= 1000) {
      seniorityScore += 40;
      seniorityReasons.push(`${candidate.followers.toLocaleString()} followers (senior-level indicator)`);
    } else if (candidate.followers >= 200) {
      seniorityScore += 30;
      seniorityReasons.push(`${candidate.followers.toLocaleString()} followers (mid-level indicator)`);
    } else if (candidate.followers >= 50) {
      seniorityScore += 20;
      seniorityReasons.push(`${candidate.followers.toLocaleString()} followers`);
    } else if (candidate.followers >= 10) {
      seniorityScore += 10;
      seniorityReasons.push(`${candidate.followers} followers`);
    }

    // Account age
    const accountAge = new Date().getFullYear() - new Date(candidate.createdAt).getFullYear();
    if (accountAge >= 8) {
      seniorityScore += 30;
      seniorityReasons.push(`Account age: ${accountAge} years (veteran)`);
    } else if (accountAge >= 5) {
      seniorityScore += 25;
      seniorityReasons.push(`Account age: ${accountAge} years (experienced)`);
    } else if (accountAge >= 3) {
      seniorityScore += 15;
      seniorityReasons.push(`Account age: ${accountAge} years`);
    } else {
      seniorityReasons.push(`Account age: ${accountAge} year(s) (newer account)`);
    }

    // Star accumulation as seniority signal
    if (candidate.totalStars >= 100 && candidate.publicRepos >= 10) {
      seniorityScore += 30;
      seniorityReasons.push('Consistent contribution history');
    }

    // 3. KEYWORD MATCH (25%) - Search bio, company, languages, and repo names/descriptions
    const matchedKeywords: string[] = [];
    const searchText = `${candidate.bio || ''} ${candidate.company || ''} ${candidate.name || ''} ${candidate.topLanguages.join(' ')} ${candidate.repoKeywords || ''}`.toLowerCase();

    for (const keyword of searchKeywords) {
      if (keyword && searchText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    const keywordScore = searchKeywords.length > 0
      ? Math.round((matchedKeywords.length / searchKeywords.length) * 100)
      : 50; // Default if no keywords

    // 4. CONTACT QUALITY (20%) - Email, hireable status, portfolio
    const contactReasons: string[] = [];
    let contactScore = 0;

    // Email
    if (candidate.email) {
      if (candidate.emailConfidence === 'high') {
        contactScore += 50;
        contactReasons.push('Email available (high confidence)');
      } else if (candidate.emailConfidence === 'medium') {
        contactScore += 35;
        contactReasons.push('Email available (medium confidence)');
      } else {
        contactScore += 20;
        contactReasons.push('Email available (low confidence)');
      }
    } else {
      contactReasons.push('No email available');
    }

    // Hireable
    if (candidate.hireable === true) {
      contactScore += 30;
      contactReasons.push('Marked as hireable');
    }

    // LinkedIn profile
    if (candidate.linkedinUrl) {
      contactScore += 25;
      contactReasons.push('LinkedIn profile available');
    } else {
      contactReasons.push('No LinkedIn profile found');
    }

    // Portfolio/blog
    if (candidate.blog && !candidate.blog.includes('linkedin.com')) {
      contactScore += 15;
      contactReasons.push('Has portfolio/blog URL');
    }

    // Calculate overall weighted score
    const overall = Math.round(
      technicalScore * 0.30 +
      seniorityScore * 0.25 +
      keywordScore * 0.25 +
      contactScore * 0.20
    );

    return {
      overall,
      technicalFit: { score: Math.min(100, technicalScore), reasons: technicalReasons },
      senioritySignals: { score: Math.min(100, seniorityScore), reasons: seniorityReasons },
      keywordMatch: { score: keywordScore, matchedKeywords, totalKeywords: searchKeywords.length },
      contactQuality: { score: Math.min(100, contactScore), reasons: contactReasons },
    };
  };

  // Auto-populate GitHub search params when JD is parsed - use AI if available
  useEffect(() => {
    if (!parsedCriteria && !searchStrategy) return;

    // Determine the effective location (accounting for remote roles)
    const effectiveLocation = customJD.isFullyRemote ? '' : (parsedCriteria?.locations?.[0] || customJD.location || '');

    // Create a key to identify this JD (so we don't re-populate for the same JD)
    // Include location in the key so location changes trigger re-population
    const jdKey = `${customJD.title}-${parsedCriteria?.titles?.[0] || ''}-${parsedCriteria?.requiredSkills?.join(',') || ''}-${effectiveLocation}-${customJD.isFullyRemote}`;

    // If we've already populated for this JD, don't do it again
    if (lastPopulatedJDRef.current === jdKey) return;
    lastPopulatedJDRef.current = jdKey;

    console.log('[GitHub Auto-populate] Populating from JD:', {
      title: customJD.title,
      parsedTitles: parsedCriteria?.titles,
      requiredSkills: parsedCriteria?.requiredSkills,
      mustHaveSkills: searchStrategy?.mustHaveSkills,
      location: effectiveLocation,
      isFullyRemote: customJD.isFullyRemote,
    });

    // Try AI keyword generation first, fall back to basic
    generateAIGithubKeywords();
  }, [parsedCriteria, searchStrategy, customJD.title, customJD.location, customJD.isFullyRemote]);

  // GitHub search function - calls GitHub API directly from frontend
  const searchGitHub = async () => {
    if (!githubConfig) {
      setGithubSearchError('GitHub is not connected. Please connect in Settings first.');
      return;
    }

    setIsSearchingGithub(true);
    setGithubSearchError(null);
    setGithubCandidates([]);

    try {
      // Build GitHub search query
      // Note: GitHub user search API is limited - it only searches username, email, and full name
      // It does NOT search bios. Language searches users with repos in that language.
      const queryParts: string[] = [];
      queryParts.push('type:user');

      if (githubSearchParams.language) {
        queryParts.push(`language:${githubSearchParams.language}`);
      }
      if (githubSearchParams.location) {
        // Skip "Remote" and similar non-geographic locations
        const loc = githubSearchParams.location.toLowerCase();
        if (!loc.match(/^(remote|hybrid|anywhere|global|worldwide)/)) {
          queryParts.push(`location:"${githubSearchParams.location}"`);
        }
      }
      // Note: We don't add keywords to the query since GitHub user search doesn't search bios
      // Keywords will be used for filtering results after fetching profiles
      if (githubSearchParams.minFollowers) {
        queryParts.push(`followers:>=${githubSearchParams.minFollowers}`);
      }
      if (githubSearchParams.minRepos) {
        queryParts.push(`repos:>=${githubSearchParams.minRepos}`);
      }

      const query = queryParts.join(' ');
      console.log('[GitHub Search] Query:', query);
      console.log('[GitHub Search] Keywords for filtering:', githubSearchParams.keywords || 'none');

      // Search users via GitHub API
      const searchResponse = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=30&sort=followers&order=desc`,
        {
          headers: {
            'Authorization': `Bearer ${githubConfig.token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!searchResponse.ok) {
        const errorData = await searchResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `GitHub API error: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      console.log('[GitHub Search] Found', searchData.total_count, 'users, fetching', searchData.items?.length || 0, 'profiles');

      // Fetch detailed profiles for each user (with rate limiting)
      const enrichedCandidates: GitHubCandidate[] = [];

      for (const user of searchData.items || []) {
        try {
          // Get detailed profile
          const profileResponse = await fetch(
            `https://api.github.com/users/${user.login}`,
            {
              headers: {
                'Authorization': `Bearer ${githubConfig.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            }
          );

          if (!profileResponse.ok) continue;

          const profile = await profileResponse.json();

          // Get repos to calculate stars and languages
          const reposResponse = await fetch(
            `https://api.github.com/users/${user.login}/repos?per_page=100&sort=pushed`,
            {
              headers: {
                'Authorization': `Bearer ${githubConfig.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            }
          );

          let totalStars = 0;
          const languageCounts: Record<string, number> = {};
          const repoTexts: string[] = [];

          if (reposResponse.ok) {
            const repos = await reposResponse.json();
            for (const repo of repos) {
              totalStars += repo.stargazers_count || 0;
              if (repo.language) {
                languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
              }
              // Extract repo name and description for keyword matching
              // Repo names often contain tech keywords like "terraform-aws-vpc", "k8s-operator"
              if (repo.name) {
                // Convert repo-name-format to space-separated words
                repoTexts.push(repo.name.replace(/[-_]/g, ' '));
              }
              if (repo.description) {
                repoTexts.push(repo.description);
              }
              // Also capture topics if available (very keyword-rich)
              if (repo.topics && Array.isArray(repo.topics)) {
                repoTexts.push(repo.topics.join(' '));
              }
            }
          }

          // Get top languages
          const topLanguages = Object.entries(languageCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([lang]) => lang);

          // Combine all repo text for keyword matching
          const repoKeywords = repoTexts.join(' ');

          // Fetch social accounts to find LinkedIn (GitHub's dedicated social accounts API)
          let linkedinUrl: string | null = null;
          try {
            const socialResponse = await fetch(
              `https://api.github.com/users/${user.login}/social_accounts`,
              {
                headers: {
                  'Authorization': `Bearer ${githubConfig.token}`,
                  'Accept': 'application/vnd.github+json',
                  'X-GitHub-Api-Version': '2022-11-28',
                },
              }
            );
            if (socialResponse.ok) {
              const socialAccounts = await socialResponse.json();
              const linkedinAccount = socialAccounts.find(
                (account: { provider: string; url: string }) =>
                  account.provider === 'linkedin' || account.url.includes('linkedin.com')
              );
              if (linkedinAccount) {
                linkedinUrl = linkedinAccount.url;
              }
            }
          } catch (socialErr) {
            console.warn(`[GitHub Search] Failed to fetch social accounts for ${user.login}:`, socialErr);
          }

          // Fall back to parsing bio/blog if not found in social accounts
          if (!linkedinUrl) {
            const extractLinkedInUrl = (bio: string | null, blog: string | null): string | null => {
              const textToSearch = `${bio || ''} ${blog || ''}`;
              const linkedinPatterns = [
                /https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)\/?/i,
                /https?:\/\/(?:www\.)?linkedin\.com\/pub\/([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)\/?/i,
                /(?:^|\s)(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)\/?/i,
              ];
              for (const pattern of linkedinPatterns) {
                const match = textToSearch.match(pattern);
                if (match) {
                  const username = match[1];
                  if (username && !username.includes('/')) {
                    return `https://www.linkedin.com/in/${username}`;
                  }
                  return match[0].trim().startsWith('http') ? match[0].trim() : `https://${match[0].trim()}`;
                }
              }
              return null;
            };
            linkedinUrl = extractLinkedInUrl(profile.bio, profile.blog);
          }

          enrichedCandidates.push({
            id: String(profile.id),
            username: profile.login,
            name: profile.name,
            bio: profile.bio,
            location: profile.location,
            company: profile.company,
            blog: profile.blog,
            linkedinUrl,
            email: profile.email,
            emailSource: profile.email ? 'profile' : null,
            emailConfidence: profile.email ? 'high' : 'low',
            followers: profile.followers || 0,
            publicRepos: profile.public_repos || 0,
            topLanguages,
            totalStars,
            avatarUrl: profile.avatar_url,
            htmlUrl: profile.html_url,
            hireable: profile.hireable,
            createdAt: profile.created_at,
            repoKeywords,
          });

          // Small delay between API calls to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.warn(`[GitHub Search] Failed to fetch profile for ${user.login}:`, err);
        }
      }

      // Score and sort by keyword relevance (instead of filtering out non-matches)
      // This way we still show all developers but prioritize those with relevant keywords
      let scoredCandidates = enrichedCandidates;
      if (githubSearchParams.keywords) {
        const keywords = githubSearchParams.keywords.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        if (keywords.length > 0) {
          // Calculate keyword match score for each candidate
          scoredCandidates = enrichedCandidates.map(candidate => {
            const searchText = [
              candidate.bio || '',
              candidate.company || '',
              candidate.topLanguages.join(' '),
              candidate.name || '',
              candidate.username || '',
              candidate.repoKeywords || '', // Include repo names and descriptions
            ].join(' ').toLowerCase();

            // Count how many keywords match
            const matchCount = keywords.filter(keyword => searchText.includes(keyword)).length;
            const matchScore = matchCount / keywords.length; // 0 to 1

            return { ...candidate, keywordMatchScore: matchScore };
          });

          // Sort by keyword match score (highest first), then by followers
          scoredCandidates.sort((a, b) => {
            const scoreA = (a as { keywordMatchScore?: number }).keywordMatchScore || 0;
            const scoreB = (b as { keywordMatchScore?: number }).keywordMatchScore || 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            return (b.followers || 0) - (a.followers || 0);
          });

          const matchedCount = scoredCandidates.filter(c => (c as { keywordMatchScore?: number }).keywordMatchScore && (c as { keywordMatchScore?: number }).keywordMatchScore! > 0).length;
          console.log('[GitHub Search] Keyword relevance scoring:', keywords, '- matched', matchedCount, 'of', enrichedCandidates.length, 'candidates');
        }
      }

      setGithubCandidates(scoredCandidates);
      console.log('[GitHub Search] Enriched', scoredCandidates.length, 'candidates (sorted by keyword relevance)');

      // Log to Riley activity
      logActivity('GitHub Search', `Searched GitHub for "${query}" - found ${scoredCandidates.length} developers (${scoredCandidates.filter(c => c.email).length} with emails)`);

    } catch (error) {
      console.error('[GitHub Search] Error:', error);
      setGithubSearchError(error instanceof Error ? error.message : 'Failed to search GitHub');
    } finally {
      setIsSearchingGithub(false);
    }
  };

  // Extract email for a GitHub user from their commit history
  const extractEmailForCandidate = async (username: string) => {
    if (!githubConfig) return;

    setExtractingEmails(prev => new Set(prev).add(username));

    try {
      // Get user's repos
      const reposResponse = await fetch(
        `https://api.github.com/users/${username}/repos?per_page=10&sort=pushed`,
        {
          headers: {
            'Authorization': `Bearer ${githubConfig.token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!reposResponse.ok) {
        throw new Error('Failed to fetch repos');
      }

      const repos = await reposResponse.json();
      const emailCounts: Record<string, number> = {};

      // Check commits in each repo
      for (const repo of repos.slice(0, 5)) {
        try {
          const commitsResponse = await fetch(
            `https://api.github.com/repos/${repo.full_name}/commits?author=${username}&per_page=50`,
            {
              headers: {
                'Authorization': `Bearer ${githubConfig.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            }
          );

          if (commitsResponse.ok) {
            const commits = await commitsResponse.json();
            for (const commit of commits) {
              const email = commit.commit?.author?.email;
              if (email && !isNoreplyEmail(email)) {
                emailCounts[email] = (emailCounts[email] || 0) + 1;
              }
            }
          }

          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch {
          // Continue with other repos
        }
      }

      // Find the most used email
      const sortedEmails = Object.entries(emailCounts)
        .sort((a, b) => b[1] - a[1]);

      if (sortedEmails.length > 0) {
        const [email, count] = sortedEmails[0];
        const confidence = count > 10 ? 'medium' : 'low';

        // Update the candidate with the extracted email
        setGithubCandidates(prev =>
          prev.map(c =>
            c.username === username
              ? { ...c, email, emailSource: 'commits' as const, emailConfidence: confidence }
              : c
          )
        );

        console.log(`[GitHub Email] Extracted email for ${username}: ${email} (${count} commits, ${confidence} confidence)`);
      } else {
        console.log(`[GitHub Email] No email found for ${username}`);
      }

    } catch (error) {
      console.error(`[GitHub Email] Error extracting email for ${username}:`, error);
    } finally {
      setExtractingEmails(prev => {
        const next = new Set(prev);
        next.delete(username);
        return next;
      });
    }
  };

  // Helper to check if email is a noreply address
  const isNoreplyEmail = (email: string): boolean => {
    const lower = email.toLowerCase();
    return (
      lower.includes('noreply') ||
      lower.includes('no-reply') ||
      lower.endsWith('@users.noreply.github.com') ||
      lower.endsWith('@github.com') ||
      lower.includes('invalid') ||
      lower.includes('example.com')
    );
  };

  // Sync editableBooleanQuery when parsedCriteria changes
  useEffect(() => {
    if (parsedCriteria?.booleanQuery) {
      setEditableBooleanQuery(parsedCriteria.booleanQuery);
      setIsBooleanQueryValid(true);
    }
  }, [parsedCriteria?.booleanQuery]);

  // Track previous JD values to detect changes
  const prevJDRef = useRef({ title: '', description: '' });

  // Clear parsed criteria and search strategy when job description changes
  useEffect(() => {
    const prevTitle = prevJDRef.current.title;
    const prevDescription = prevJDRef.current.description;
    const currentTitle = customJD.title;
    const currentDescription = customJD.description;

    // Only clear if we had previous values (not initial load) and they changed significantly
    const titleChanged = prevTitle && currentTitle !== prevTitle;
    const descriptionChanged = prevDescription && currentDescription !== prevDescription;

    if (titleChanged || descriptionChanged) {
      // Clear the search strategy and parsed criteria when JD changes
      setParsedCriteria(null);
      setSearchStrategy(null);
      setEditableBooleanQuery('');
      setIsBooleanQueryValid(true);
    }

    // Update the ref with current values
    prevJDRef.current = { title: currentTitle, description: currentDescription };
  }, [customJD.title, customJD.description]);

  // Add candidates to the messaging queue
  const addToQueue = async (candidates: SourcedCandidate[]) => {
    setAddingToQueue(true);
    try {
      // Get existing queue from localStorage
      const existingQueue = JSON.parse(localStorage.getItem('riley_messaging_queue') || '[]') as QueuedCandidate[];

      // Generate assessment template - either from job requisition or custom JD context
      let assessmentTemplateId: string | undefined;
      let assessmentInfo: { templateId: string; isNew: boolean } | undefined;

      if (selectedReq) {
        // Use existing job requisition
        try {
          console.log('[Sourcing] Generating assessment for job requisition:', selectedReq);
          const assessmentRes = await fetch(`${API_BASE}/api/assessments/generate-from-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobRequisitionId: selectedReq }),
          });
          const assessmentData = await assessmentRes.json();
          if (assessmentData.success && assessmentData.templateId) {
            assessmentTemplateId = assessmentData.templateId;
            assessmentInfo = { templateId: assessmentData.templateId, isNew: assessmentData.isNew };
            console.log('[Sourcing] Assessment template ready:', assessmentTemplateId, assessmentInfo.isNew ? '(newly generated)' : '(existing)');
          }
        } catch (err) {
          console.warn('[Sourcing] Failed to generate assessment from job req, continuing without:', err);
        }
      } else if (customJD.title && customJD.description) {
        // Use custom JD context (no DB record)
        try {
          console.log('[Sourcing] Generating assessment from custom JD context:', customJD.title);
          const assessmentRes = await fetch(`${API_BASE}/api/assessments/generate-from-context`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: customJD.title,
              description: customJD.description,
              requirements: parsedCriteria?.requiredSkills || customJD.skills?.split(',').map(s => s.trim()).filter(Boolean) || [],
              preferredSkills: parsedCriteria?.preferredSkills || [],
              location: customJD.location || undefined,
              locationType: customJD.isFullyRemote ? 'REMOTE' : 'UNSPECIFIED',
              companyName: customJD.companyName || undefined,  // Company name for internal tracking
            }),
          });
          const assessmentData = await assessmentRes.json();
          if (assessmentData.success && assessmentData.templateId) {
            assessmentTemplateId = assessmentData.templateId;
            assessmentInfo = { templateId: assessmentData.templateId, isNew: true };
            console.log('[Sourcing] Assessment template generated from context:', assessmentTemplateId);
          }
        } catch (err) {
          console.warn('[Sourcing] Failed to generate assessment from context, continuing without:', err);
        }
      }

      // Generate AI outreach messages for each candidate
      // Get Anthropic API key from localStorage
      const anthropicApiKey = localStorage.getItem('riley_anthropic_api_key');
      const roleInfo = {
        title: parsedCriteria?.titles?.[0] || customJD.title || 'Software Engineer',
        company: customJD.intakeNotes?.match(/company[:\s]+([^\n,]+)/i)?.[1]?.trim() || 'Our Client',
        highlights: [
          customJD.description?.slice(0, 100) || 'Great opportunity',
          ...(parsedCriteria?.preferredSkills?.slice(0, 2) || []),
        ].filter(Boolean),
        location: customJD.location || undefined,
      };

      // Generate AI messages in parallel batches
      const generateAIMessage = async (candidate: SourcedCandidate): Promise<string | undefined> => {
        if (!anthropicApiKey) return undefined;

        try {
          const response = await fetch(`${API_BASE}/api/demo/ai/generate-outreach`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Anthropic-Api-Key': anthropicApiKey,
            },
            body: JSON.stringify({
              candidate: {
                id: candidate.id,
                name: candidate.name,
                headline: candidate.headline,
                currentTitle: candidate.currentTitle,
                currentCompany: candidate.currentCompany,
                location: candidate.location,
                skills: candidate.sourcingScore?.pillars?.roleFit?.note?.split(',').map(s => s.trim()) ||
                        parsedCriteria?.requiredSkills || [],
              },
              role: roleInfo,
              channel: 'linkedin_connection',
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.outreach?.message) {
              console.log(`[Sourcing] AI outreach generated for ${candidate.name}`);
              return data.outreach.message;
            }
          }
        } catch (err) {
          console.warn(`[Sourcing] Failed to generate AI outreach for ${candidate.name}:`, err);
        }
        return undefined;
      };

      // Generate messages for all candidates in parallel (batches of 3)
      const aiMessages = new Map<string, string>();
      if (anthropicApiKey) {
        console.log('[Sourcing] Generating AI outreach messages for', candidates.length, 'candidates...');
        const batchSize = 3;
        for (let i = 0; i < candidates.length; i += batchSize) {
          const batch = candidates.slice(i, i + batchSize);
          const results = await Promise.all(batch.map(async (c) => {
            const message = await generateAIMessage(c);
            return { id: c.id, message };
          }));
          results.forEach(({ id, message }) => {
            if (message) aiMessages.set(id, message);
          });
        }
        console.log('[Sourcing] Generated', aiMessages.size, 'AI outreach messages');
      }

      // Create queue items for each candidate
      const newQueueItems: QueuedCandidate[] = candidates.map(candidate => ({
        id: `queue-${Date.now()}-${candidate.id}`,
        candidateId: candidate.id,
        providerId: candidate.providerId,
        name: candidate.name,
        headline: candidate.headline,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
        location: candidate.location,
        profileUrl: candidate.profileUrl,
        profilePictureUrl: candidate.profilePictureUrl,
        relevanceScore: candidate.relevanceScore,
        status: 'pending',
        messageType: 'connection_request', // Default to connection request
        messageDraft: aiMessages.get(candidate.id), // Use AI-generated message if available
        createdAt: new Date().toISOString(),
        searchCriteria: parsedCriteria ? {
          jobTitle: parsedCriteria.titles[0] || customJD.title,
          skills: parsedCriteria.requiredSkills,
        } : undefined,
        // Include job requisition and assessment for linking
        jobRequisitionId: selectedReq || undefined,
        assessmentTemplateId,
      }));

      // Add to queue (avoid duplicates by providerId or candidateId)
      const existingProviderIds = new Set(existingQueue.map(q => q.providerId).filter(Boolean));
      const existingCandidateIds = new Set(existingQueue.map(q => q.candidateId));
      const uniqueNewItems = newQueueItems.filter(item => {
        // If item has a providerId, check if it already exists
        if (item.providerId) {
          return !existingProviderIds.has(item.providerId);
        }
        // If no providerId, check by candidateId to avoid duplicates
        return !existingCandidateIds.has(item.candidateId);
      });

      const updatedQueue = [...existingQueue, ...uniqueNewItems];
      localStorage.setItem('riley_messaging_queue', JSON.stringify(updatedQueue));

      // Update candidate status in search results
      setSearchRun(prev => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map(c =>
            candidates.some(sc => sc.id === c.id)
              ? { ...c, status: 'queued' as const }
              : c
          ),
        };
      });

      // Clear selection
      setSelectedCandidates(new Set());

      // Check for candidates without provider IDs
      const withoutProviderId = uniqueNewItems.filter(item => !item.providerId);

      // Build success message
      let successMessage = `Added ${uniqueNewItems.length} candidate(s) to messaging queue.`;

      // Add AI outreach info
      if (aiMessages.size > 0) {
        successMessage += `\n\n✅ AI-generated personalized outreach messages created for ${aiMessages.size} candidate(s).`;
      } else if (anthropicApiKey) {
        successMessage += '\n\n⚠️ Could not generate AI outreach messages. Default templates will be used.';
      } else {
        successMessage += '\n\nℹ️ Add your Anthropic API key in Settings to enable AI-powered outreach messages.';
      }

      // Add assessment info if generated
      if (assessmentInfo) {
        successMessage += assessmentInfo.isNew
          ? '\n\n✅ AI-generated pre-screening assessment created for this role.'
          : '\n\n✅ Pre-screening assessment linked (existing template).';
      }

      // Show success message with warning if needed
      if (withoutProviderId.length > 0) {
        alert(`${successMessage}\n\n⚠️ Warning: ${withoutProviderId.length} candidate(s) are missing LinkedIn IDs and cannot be messaged. This may happen with demo/mock data. Re-source these candidates with LinkedIn connected to get their IDs.`);
      } else {
        alert(`${successMessage}\n\nGo to Approval Queue to review and send messages.`);
      }
    } catch (error) {
      console.error('Failed to add to queue:', error);
      setSearchError('Failed to add candidates to queue');
    } finally {
      setAddingToQueue(false);
    }
  };

  const toggleCandidateSelection = (candidateId: string) => {
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  const selectAllCandidates = () => {
    if (!searchRun?.candidates) return;
    const newCandidates = searchRun.candidates.filter(c => c.status === 'new');
    if (selectedCandidates.size === newCandidates.length) {
      setSelectedCandidates(new Set());
    } else {
      setSelectedCandidates(new Set(newCandidates.map(c => c.id)));
    }
  };

  // AI Scoring function - uses new 4-pillar sourcing scorer
  const runAiScoring = async (candidatesArg?: SourcedCandidate[]) => {
    // Always use latest candidates from ref to ensure we have enriched data
    const candidates = searchRunRef.current?.candidates || candidatesArg || [];

    if (!parsedCriteria || candidates.length === 0) return;

    // Get the Anthropic API key from localStorage
    const apiKey = localStorage.getItem('riley_anthropic_api_key');

    // Log enrichment status for debugging
    const enrichedCount = candidates.filter(c => c.isProfileEnriched).length;
    const withSummary = candidates.filter(c => c.summary).length;
    const withExperiences = candidates.filter(c => c.experiences && c.experiences.length > 0).length;
    console.log(`[AI Scoring] Scoring ${candidates.length} candidates: ${enrichedCount} enriched, ${withSummary} with summary, ${withExperiences} with experiences`);

    setIsAiScoring(true);
    try {
      // Use new 4-pillar sourcing score endpoint (Role, Scope, Technical, Location)
      const candidatePayload = candidates.map(c => ({
        id: c.id,
        name: c.name,
        currentTitle: c.currentTitle || c.headline?.split(' at ')[0],
        currentCompany: c.currentCompany || c.headline?.split(' at ')[1]?.split(' |')[0],
        headline: c.headline,
        location: c.location,
        // Include full profile data if available (About section, work history, skills)
        summary: c.summary,
        experiences: c.experiences?.map(exp => ({
          title: exp.title,
          company: exp.company,
          startDate: exp.startDate,
          endDate: exp.endDate,
          isCurrent: exp.isCurrent,
          description: exp.description,
        })),
        skills: c.skills,
      }));

      // Log all candidates' profile data for debugging
      console.log(`[AI Scoring] === DETAILED CANDIDATE DATA ===`);
      candidatePayload.forEach((c, i) => {
        console.log(`[AI Scoring] Candidate ${i + 1}: ${c.name}`, {
          hasSummary: !!c.summary,
          summaryLength: c.summary?.length || 0,
          experienceCount: c.experiences?.length || 0,
          firstExpTitle: c.experiences?.[0]?.title || 'N/A',
          firstExpDesc: c.experiences?.[0]?.description?.slice(0, 50) || 'N/A',
          skillCount: c.skills?.length || 0,
        });
      });
      console.log(`[AI Scoring] === END DETAILED DATA ===`);
      console.log(`[AI Scoring] Sending request to ${API_BASE}/api/demo/ai/sourcing-score with ${candidatePayload.length} candidates`);
      console.log(`[AI Scoring] API key present: ${!!apiKey}`);

      // Add timeout to prevent infinite hanging (3 minutes should be enough for ~25 candidates)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.error('[AI Scoring] Request timed out after 3 minutes');
      }, 180000);

      try {
        const response = await fetch(`${API_BASE}/api/demo/ai/sourcing-score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-Anthropic-Api-Key': apiKey } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({
          candidates: candidatePayload,
          role: {
            title: parsedCriteria.titles[0] || customJD.title,
            location: customJD.isFullyRemote ? 'Fully Remote' : (parsedCriteria.locations[0] || customJD.location || 'Remote'),
            companySize: searchStrategy?.seniorityLevel ? `${searchStrategy.seniorityLevel} level role` : undefined,
            levelContext: searchStrategy?.levelRationale,
            // Technical requirements for the new Technical Fit pillar
            technical: {
              mustHave: searchStrategy?.mustHaveSkills || parsedCriteria.requiredSkills,
              niceToHave: searchStrategy?.niceToHaveSkills || parsedCriteria.preferredSkills,
              // Infer architecture/scale from search strategy if available
              architecture: searchStrategy?.leadershipIndicators?.filter(i =>
                i.toLowerCase().includes('architect') ||
                i.toLowerCase().includes('scale') ||
                i.toLowerCase().includes('distributed') ||
                i.toLowerCase().includes('microservice')
              ),
            },
            // Culture fit criteria
            excludeCompanies: customJD.excludeCompanies?.split(',').map(c => c.trim()).filter(Boolean) || undefined,
            targetIndustries: customJD.targetIndustries?.split(',').map(i => i.trim()).filter(Boolean) || undefined,
            // Contract role prioritization
            isContractRole: customJD.isContractRole,
          },
          // Intake notes from HM that take precedence over JD
          intakeNotes: customJD.intakeNotes?.trim() || undefined,
          isFullyRemote: customJD.isFullyRemote,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Build score map and updated candidates
        const scoreMap = new Map<string, SourcingScore>(
          data.scores.map((s: SourcingScore) => [s.candidateId, s])
        );

        // Update state
        setSearchRun(prev => {
          if (!prev) return null;
          const updatedCandidates = prev.candidates.map(c => {
            const sourcingScore = scoreMap.get(c.id);
            return {
              ...c,
              sourcingScore,
              // Update relevance score based on sourcing score
              relevanceScore: sourcingScore?.overallScore ?? c.relevanceScore,
            };
          });

          return {
            ...prev,
            candidates: updatedCandidates,
            sourcingScoreSummary: data.summary,
            sourcingAiPowered: data.aiPowered,
          };
        });

        // Update Riley context with scored candidates for chat awareness (outside state callback)
        const currentRun = searchRunRef.current;
        if (currentRun) {
          const updatedCandidates = currentRun.candidates.map(c => {
            const sourcingScore = scoreMap.get(c.id);
            return { ...c, sourcingScore };
          });

          setCandidatesInPipeline(
            updatedCandidates.map(c => ({
              name: c.name,
              title: c.currentTitle || c.headline?.split(' at ')[0] || 'Unknown',
              company: c.currentCompany || c.headline?.split(' at ')[1]?.split(' |')[0] || 'Unknown',
              score: c.sourcingScore?.overallScore ?? c.relevanceScore ?? 0,
              recommendation: c.sourcingScore?.recommendation || 'unscored',
              stage: c.status || 'new',
            }))
          );

          // Log activity
          const qualifiedCount = updatedCandidates.filter(c => (c.sourcingScore?.overallScore ?? 0) >= 70).length;
          logActivity('AI Scoring', `Scored ${updatedCandidates.length} candidates - ${qualifiedCount} qualified (70+)`);
        }
      }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[AI Scoring] Request was aborted (timeout)');
      } else {
        console.error('AI sourcing scoring failed:', error);
      }
    } finally {
      setIsAiScoring(false);
    }
  };

  // Enrich a single candidate by fetching their full LinkedIn profile
  const enrichProfile = async (candidateId: string) => {
    const currentSearchRun = searchRunRef.current;
    const candidate = currentSearchRun?.candidates.find(c => c.id === candidateId);

    if (!candidate || !candidate.providerId || !unipileConfig) {
      console.error('[Enrich] Cannot enrich profile - missing candidate, providerId, or unipileConfig');
      return;
    }

    console.log(`[Enrich] Fetching full profile for ${candidate.name} (${candidate.providerId})`);
    console.log(`[Enrich] API_BASE: ${API_BASE}`);
    console.log(`[Enrich] Full URL: ${API_BASE}/api/demo/profile/enrich`);
    console.log(`[Enrich] unipileConfig present:`, !!unipileConfig);

    try {
      console.log(`[Enrich] Sending fetch request...`);
      const response = await fetch(`${API_BASE}/api/demo/profile/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerId: candidate.providerId,
          unipileConfig,
        }),
      });
      console.log(`[Enrich] Got response, status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`[Enrich] Got profile data for ${candidate.name}:`, data);
        console.log(`[Enrich] Raw experiences from API:`, data.profile?.experiences);
        console.log(`[Enrich] Raw skills from API:`, data.profile?.skills);
        console.log(`[Enrich] Summary length:`, data.profile?.summary?.length || 0);

        // Map experiences from Unipile format to our format
        const mappedExperiences = data.profile?.experiences?.map((exp: { title: string; company_name: string; start_date?: string; end_date?: string; is_current?: boolean; description?: string }) => ({
          title: exp.title,
          company: exp.company_name,
          startDate: exp.start_date,
          endDate: exp.end_date,
          isCurrent: exp.is_current,
          description: exp.description,
        }));

        console.log(`[Enrich] Mapped ${mappedExperiences?.length || 0} experiences for ${candidate.name}`);
        if (mappedExperiences?.length > 0) {
          console.log(`[Enrich] First experience:`, mappedExperiences[0]);
        }

        // Update the candidate with enriched profile data
        setSearchRun(prev => {
          if (!prev) return null;
          return {
            ...prev,
            candidates: prev.candidates.map(c =>
              c.id === candidateId
                ? {
                    ...c,
                    summary: data.profile?.summary || c.summary,
                    experiences: mappedExperiences || c.experiences,
                    skills: data.profile?.skills || c.skills,
                    isProfileEnriched: true,
                  }
                : c
            ),
          };
        });
      }
    } catch (error) {
      console.error('[Enrich] Error fetching profile:', error);
    }
  };

  // Enrich all candidates' profiles and then re-run AI scoring
  const enrichAllProfiles = async (candidates: SourcedCandidate[], autoRescore: boolean = true) => {
    console.log('[EnrichAll] Function called with', candidates.length, 'candidates, autoRescore:', autoRescore);

    if (!unipileConfig) {
      console.error('[EnrichAll] No unipileConfig available');
      return;
    }
    console.log('[EnrichAll] unipileConfig is present');

    // Only enrich candidates that haven't been enriched yet and have a providerId
    const toEnrich = candidates.filter(c => !c.isProfileEnriched && c.providerId);
    console.log(`[EnrichAll] Filtering candidates: ${toEnrich.length} to enrich out of ${candidates.length} total`);
    console.log(`[EnrichAll] Candidates without providerId:`, candidates.filter(c => !c.providerId).length);
    console.log(`[EnrichAll] Already enriched:`, candidates.filter(c => c.isProfileEnriched).length);

    if (toEnrich.length === 0) {
      console.log('[Enrich] All profiles already enriched');
      // Still re-score if requested (in case data wasn't used before)
      if (autoRescore) {
        console.log('[Enrich] Re-scoring with existing enriched data');
        await runAiScoring();
      }
      return;
    }

    setIsEnrichingProfiles(true);

    try {
      // Process in batches of 5 to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < toEnrich.length; i += batchSize) {
        const batch = toEnrich.slice(i, i + batchSize);
        await Promise.all(batch.map(c => enrichProfile(c.id)));

        // Small delay between batches
        if (i + batchSize < toEnrich.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // After enrichment, automatically re-run AI scoring with the enriched data
      if (autoRescore) {
        console.log('[Enrich] Enrichment complete, re-scoring with full profile data');
        // Longer delay to ensure React state has fully updated
        await new Promise(resolve => setTimeout(resolve, 500));
        // runAiScoring now reads from searchRunRef.current internally
        await runAiScoring();
      }
    } finally {
      setIsEnrichingProfiles(false);
    }
  };

  // Research company for a single candidate
  // NOTE: We use searchRunRef.current to get the latest state and avoid stale closure issues
  const researchCompany = async (candidateId: string) => {
    // Look up the candidate from the ref (always has latest state)
    const currentSearchRun = searchRunRef.current;
    const candidate = currentSearchRun?.candidates.find(c => c.id === candidateId);

    console.log(`[Research] Looking for candidate ${candidateId} in searchRun with ${currentSearchRun?.candidates?.length || 0} candidates`);

    if (!candidate) {
      console.error('[Research] Candidate not found in search results:', candidateId, 'Available IDs:', currentSearchRun?.candidates?.map(c => c.id));
      alert('Candidate not found. Please try again.');
      return;
    }

    // Extract company name from currentCompany or parse from headline with multiple strategies
    let companyName = candidate.currentCompany;
    if (!companyName && candidate.headline) {
      // Try "Title at Company" pattern
      const atMatch = candidate.headline.match(/\s+at\s+([^|•–-]+)/i);
      if (atMatch) {
        companyName = atMatch[1].trim();
      }
      // Try "Title @ Company" pattern
      if (!companyName) {
        const atSymbolMatch = candidate.headline.match(/\s+@\s+([^|•–-]+)/i);
        if (atSymbolMatch) {
          companyName = atSymbolMatch[1].trim();
        }
      }
      // Try "Title, Company" pattern
      if (!companyName) {
        const commaMatch = candidate.headline.match(/,\s+([^|•–,]+?)(?:\s*[|•–]|$)/i);
        if (commaMatch) {
          companyName = commaMatch[1].trim();
        }
      }
    }

    console.log(`[Research] Starting research for candidate ${candidate.id}, company: "${companyName}", headline: "${candidate.headline}"`);

    if (!unipileConfig) {
      console.error('[Research] No unipileConfig available');
      alert('LinkedIn is not connected. Please connect in Settings first.');
      return;
    }

    if (!companyName) {
      console.error('[Research] Could not extract company name from candidate:', candidate);
      alert('Could not determine company name for this candidate.');
      return;
    }

    // Mark as researching
    setResearchingCompanies(prev => {
      const next = new Set(prev);
      next.add(candidate.id);
      return next;
    });

    try {
      console.log(`[Research] Calling API for company: "${companyName}"`);
      const response = await fetch(`${API_BASE}/api/demo/company/research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName,
          unipileConfig,
        }),
      });

      const data = await response.json();
      console.log('[Research] API response:', data);

      if (!response.ok) {
        console.error('[Research] API error:', data);
        alert(`Company research failed: ${data.error || 'Unknown error'}`);
        return;
      }

      // API returns { success, companyName, info, source, durationMs }
      const companyInfo = data.info;

      if (data.success && companyInfo) {
        console.log('[Research] Company data received:', companyInfo);

        // Store company data
        setCompanyData(prev => {
          const next = new Map(prev);
          next.set(companyName.toLowerCase(), companyInfo);
          return next;
        });

        // Re-score this candidate with company context
        const apiKey = localStorage.getItem('riley_anthropic_api_key');
        console.log('[Research] Re-scoring candidate with enriched data...');

        const scoreResponse = await fetch(`${API_BASE}/api/demo/ai/sourcing-score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-Anthropic-Api-Key': apiKey } : {}),
          },
          body: JSON.stringify({
            candidates: [{
              id: candidate.id,
              name: candidate.name,
              currentTitle: candidate.currentTitle || candidate.headline?.split(' at ')[0],
              currentCompany: companyName,
              headline: candidate.headline,
              location: candidate.location,
              companyContext: {
                headcount: companyInfo.headcount,
                headcountRange: companyInfo.headcountRange,
                industry: companyInfo.industry,
              },
            }],
            role: {
              title: parsedCriteria?.titles[0] || customJD.title,
              location: customJD.isFullyRemote ? 'Fully Remote' : (parsedCriteria?.locations[0] || customJD.location || 'Remote'),
              companySize: searchStrategy?.seniorityLevel ? `${searchStrategy.seniorityLevel} level role` : undefined,
              levelContext: searchStrategy?.levelRationale,
              // Technical requirements for the new Technical Fit pillar
              technical: {
                mustHave: searchStrategy?.mustHaveSkills || parsedCriteria?.requiredSkills,
                niceToHave: searchStrategy?.niceToHaveSkills || parsedCriteria?.preferredSkills,
                architecture: searchStrategy?.leadershipIndicators?.filter(i =>
                  i.toLowerCase().includes('architect') ||
                  i.toLowerCase().includes('scale') ||
                  i.toLowerCase().includes('distributed') ||
                  i.toLowerCase().includes('microservice')
                ),
              },
              // Culture fit criteria
              excludeCompanies: customJD.excludeCompanies?.split(',').map(c => c.trim()).filter(Boolean) || undefined,
              targetIndustries: customJD.targetIndustries?.split(',').map(i => i.trim()).filter(Boolean) || undefined,
              // Contract role prioritization
              isContractRole: customJD.isContractRole,
            },
            // Intake notes from HM that take precedence over JD
            intakeNotes: customJD.intakeNotes?.trim() || undefined,
            isFullyRemote: customJD.isFullyRemote,
          }),
        });

        const scoreData = await scoreResponse.json();
        console.log('[Research] Score response:', scoreData);

        if (scoreResponse.ok && scoreData.scores?.[0]) {
          const newScore = scoreData.scores[0];
          console.log('[Research] New score for candidate:', newScore);

          // Update candidate with new enriched score
          setSearchRun(prev => {
            if (!prev) return null;
            return {
              ...prev,
              candidates: prev.candidates.map(c =>
                c.id === candidate.id
                  ? {
                      ...c,
                      sourcingScore: newScore,
                      relevanceScore: newScore.overallScore,
                    }
                  : c
              ),
            };
          });

          console.log(`[Research] Successfully updated candidate ${candidate.id} with enriched score`);
        } else {
          console.error('[Research] Scoring failed:', scoreData);
        }
      } else {
        console.warn('[Research] No company data in response:', data);
        alert(`Could not find company "${companyName}" on LinkedIn.`);
      }
    } catch (error) {
      console.error('[Research] Company research failed:', error);
      alert(`Research failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setResearchingCompanies(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  // Toggle score details visibility
  const toggleScoreDetails = (candidateId: string) => {
    setShowScoreDetails(prev => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  // Filter candidates by sourcing score (new 3-pillar system)
  const getFilteredCandidates = (): SourcedCandidate[] => {
    if (!searchRun?.candidates) return [];

    if (filterByScore === 'all') return searchRun.candidates;

    return searchRun.candidates.filter(c => {
      // Use new sourcingScore, fallback to aiScore for backwards compatibility
      const scoreObj = c.sourcingScore || c.aiScore;
      if (!scoreObj) return false; // Exclude unscored when filtering

      const score = scoreObj.overallScore;
      switch (filterByScore) {
        case 'qualified': return score >= 70;
        case 'borderline': return score >= 50 && score < 70;
        case 'unqualified': return score < 50;
        default: return true;
      }
    });
  };

  // Check if search results are from demo/cached data (no provider IDs)
  const hasDemoResults = searchRun?.candidates?.some(c => !c.providerId) ?? false;
  const candidatesWithoutProviderId = searchRun?.candidates?.filter(c => !c.providerId).length ?? 0;

  // Clear search results
  const clearSearchResults = () => {
    setSearchRun(null);
    setSearchApiUsed(null);
    setApiWarning(null);
    setSearchError(null);
    setSelectedCandidates(new Set());
  };

  // Fetch requisitions on mount
  useEffect(() => {
    fetchRequisitions();
  }, []);

  const fetchRequisitions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/demo/requisitions`);
      if (response.ok) {
        const data = await response.json();
        setRequisitions(data);
        setDemoMode(true);
      }
    } catch {
      // Use mock data
      setRequisitions([
        {
          id: 'req-1',
          title: 'Senior Software Engineer',
          description: 'Looking for an experienced software engineer to join our platform team...',
          location: 'San Francisco, CA',
          status: 'OPEN',
        },
        {
          id: 'req-2',
          title: 'Product Manager',
          description: 'Seeking a product manager to lead our growth initiatives...',
          location: 'Remote',
          status: 'OPEN',
        },
        {
          id: 'req-3',
          title: 'Data Scientist',
          description: 'Join our ML team to build predictive models...',
          location: 'New York, NY',
          status: 'OPEN',
        },
      ]);
      setDemoMode(true);
    }
  };

  // Auto-parse job title, location, and skills when description is pasted
  const autoParseFromDescription = useCallback(async (description: string) => {
    // Only auto-parse if description is substantial (>100 chars)
    if (description.length < 100) {
      return;
    }

    setIsAutoParsingSkills(true);
    setSkillsAutoPopulated(false);

    // Extract job title if title field is empty
    if (!customJD.title.trim()) {
      const extractedTitle = extractJobTitleFromText(description);
      if (extractedTitle) {
        setCustomJD(prev => ({ ...prev, title: extractedTitle }));
      }
    }

    // Extract location if location field is empty
    if (!customJD.location.trim()) {
      const extractedLocations = extractAllLocationsFromText(description);
      if (extractedLocations.length === 1) {
        // Single location found, auto-fill
        setCustomJD(prev => ({ ...prev, location: extractedLocations[0] }));
      } else if (extractedLocations.length > 1) {
        // Multiple locations found, show modal to let user choose
        setLocationChoices(extractedLocations);
        setShowLocationModal(true);
      }
    }

    // Extract skills if skills field is empty
    if (!customJD.skills.trim()) {
      const extractedSkills = extractKeywordsFromText(description);
      if (extractedSkills.length > 0) {
        setCustomJD(prev => ({ ...prev, skills: extractedSkills.join(', ') }));
        setSkillsAutoPopulated(true);
        setTimeout(() => setSkillsAutoPopulated(false), 3000);
      }
    }

    setIsAutoParsingSkills(false);
  }, [customJD.title, customJD.location, customJD.skills]);

  // Extract job title from description text
  const extractJobTitleFromText = (text: string): string | null => {
    // Common job title patterns to look for
    const titlePatterns = [
      // Explicit title mentions
      /(?:job\s+title|position|role|title)[\s:]+["']?([A-Z][A-Za-z\s,]+(?:Engineer|Developer|Manager|Director|Lead|Architect|Scientist|Designer|Analyst|VP|Head|Chief|CTO|CEO|CFO|COO|Officer)[A-Za-z\s]*)["']?/i,
      // "We are looking for a [Title]"
      /(?:looking for|hiring|seeking|need)\s+(?:a|an)\s+([A-Z][A-Za-z\s]+(?:Engineer|Developer|Manager|Director|Lead|Architect|Scientist|Designer|Analyst))/i,
      // "Join as [Title]" or "Join our team as [Title]"
      /join\s+(?:us\s+)?(?:as\s+)?(?:a|an)\s+([A-Z][A-Za-z\s]+(?:Engineer|Developer|Manager|Director|Lead|Architect|Scientist|Designer|Analyst))/i,
      // Standalone title at start of text (often first line is title)
      /^["']?([A-Z][A-Za-z\s,]+(?:Engineer|Developer|Manager|Director|Lead|Architect|Scientist|Designer|Analyst|VP|Head|Chief)[A-Za-z\s]*)["']?(?:\s*[-–—]|\s*\n|$)/m,
    ];

    // Common job titles to match against (highest priority first)
    const commonTitles = [
      // C-Level & VP
      'Chief Technology Officer', 'CTO', 'Chief Engineering Officer',
      'VP of Engineering', 'VP Engineering', 'Vice President of Engineering',
      'VP of Product', 'VP Product', 'Chief Product Officer', 'CPO',

      // Directors
      'Director of Engineering', 'Engineering Director', 'Director of Software Engineering',
      'Director of Product', 'Product Director', 'Director of Data Science',
      'Director of Platform', 'Director of Infrastructure',

      // Managers & Leads
      'Engineering Manager', 'Software Engineering Manager', 'Senior Engineering Manager',
      'Technical Program Manager', 'Program Manager', 'Product Manager', 'Senior Product Manager',
      'Tech Lead', 'Technical Lead', 'Team Lead',

      // Senior ICs
      'Staff Engineer', 'Staff Software Engineer', 'Principal Engineer', 'Principal Software Engineer',
      'Distinguished Engineer', 'Senior Staff Engineer',
      'Senior Software Engineer', 'Senior Engineer', 'Senior Developer',
      'Senior Full Stack Engineer', 'Senior Backend Engineer', 'Senior Frontend Engineer',
      'Senior Data Engineer', 'Senior ML Engineer', 'Senior DevOps Engineer',

      // Mid-level
      'Software Engineer', 'Software Developer', 'Full Stack Engineer', 'Full Stack Developer',
      'Backend Engineer', 'Backend Developer', 'Frontend Engineer', 'Frontend Developer',
      'Data Engineer', 'ML Engineer', 'Machine Learning Engineer', 'DevOps Engineer',
      'Site Reliability Engineer', 'SRE', 'Platform Engineer', 'Infrastructure Engineer',
      'Data Scientist', 'Product Designer', 'UX Designer', 'Solutions Architect',
    ];

    // First, try pattern matching
    for (const pattern of titlePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const title = match[1].trim().replace(/[,.]$/, '').trim();
        // Validate it's a reasonable length
        if (title.length >= 5 && title.length <= 60) {
          return title;
        }
      }
    }

    // Then, look for known titles in the text (case-insensitive, first 500 chars more likely to have title)
    const firstPart = text.substring(0, 500).toLowerCase();
    for (const title of commonTitles) {
      if (firstPart.includes(title.toLowerCase())) {
        return title;
      }
    }

    return null;
  };

  // Major US metro areas and their formal names
  const majorCities = [
    'San Francisco, CA', 'San Francisco', 'SF Bay Area', 'Bay Area',
    'New York, NY', 'New York City', 'NYC', 'Manhattan',
    'Seattle, WA', 'Seattle',
    'Los Angeles, CA', 'Los Angeles', 'LA',
    'Austin, TX', 'Austin',
    'Boston, MA', 'Boston',
    'Denver, CO', 'Denver',
    'Chicago, IL', 'Chicago',
    'Atlanta, GA', 'Atlanta',
    'Miami, FL', 'Miami',
    'Phoenix, AZ', 'Phoenix', 'Scottsdale, AZ', 'Scottsdale',
    'San Diego, CA', 'San Diego',
    'Portland, OR', 'Portland',
    'Palo Alto, CA', 'Palo Alto',
    'Mountain View, CA', 'Mountain View',
    'Sunnyvale, CA', 'Sunnyvale',
    'San Jose, CA', 'San Jose',
    'Menlo Park, CA', 'Menlo Park',
    // International
    'London, UK', 'London',
    'Toronto, Canada', 'Toronto',
    'Vancouver, Canada', 'Vancouver',
    'Berlin, Germany', 'Berlin',
    'Dublin, Ireland', 'Dublin',
    'Singapore',
    'Sydney, Australia', 'Sydney',
    'Bangalore, India', 'Bangalore', 'Bengaluru',
  ];

  // Extract ALL locations from description text (for modal selection)
  const extractAllLocationsFromText = (text: string): string[] => {
    const foundLocations: string[] = [];
    const textLower = text.toLowerCase();

    // Location patterns
    const locationPatterns = [
      // "Location: City, State" or "Location: City"
      /(?:location|based in|based at|office|headquarters|hq)[\s:]+([A-Z][A-Za-z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?)/gi,
      /(?:location|based in|based at|office|headquarters|hq)[\s:]+([A-Z][A-Za-z\s]+,\s*[A-Za-z\s]+)/gi,
      // "City, State" pattern with known US states
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC))\b/g,
      // "City, Country" for international
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:United States|USA|UK|United Kingdom|Canada|Australia|Germany|France|India|Singapore|Ireland|Netherlands))\b/gi,
    ];

    // Check for remote patterns
    if (/\b(Remote|Fully Remote|100% Remote|Work from Home|WFH|Remote-first)\b/i.test(text)) {
      foundLocations.push('Remote');
    }
    if (/\bHybrid\b/i.test(text)) {
      foundLocations.push('Hybrid');
    }

    // Try pattern matching (find all matches)
    for (const pattern of locationPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const location = match[1].trim().replace(/[,.]$/, '').trim();
          if (location.length >= 2 && location.length <= 50) {
            // Normalize to full form if possible
            const fullForm = majorCities.find(c =>
              c.toLowerCase() === location.toLowerCase() && c.includes(',')
            );
            const normalized = fullForm || location;
            if (!foundLocations.includes(normalized)) {
              foundLocations.push(normalized);
            }
          }
        }
      }
    }

    // Also look for known cities in the text
    for (const city of majorCities) {
      if (textLower.includes(city.toLowerCase())) {
        // Get the most formal version
        const fullForm = majorCities.find(c =>
          c.toLowerCase() === city.toLowerCase() && c.includes(',')
        );
        const normalized = fullForm || city;
        if (!foundLocations.includes(normalized)) {
          foundLocations.push(normalized);
        }
      }
    }

    // Dedupe by normalizing similar locations (e.g., "San Francisco" and "San Francisco, CA")
    const deduped: string[] = [];
    for (const loc of foundLocations) {
      const locLower = loc.toLowerCase();
      // Check if a more specific version already exists
      const hasMoreSpecific = deduped.some(d =>
        d.toLowerCase().startsWith(locLower) || locLower.startsWith(d.toLowerCase().split(',')[0])
      );
      if (!hasMoreSpecific) {
        // Remove less specific versions
        const filtered = deduped.filter(d =>
          !d.toLowerCase().startsWith(locLower.split(',')[0]) || d.includes(',')
        );
        filtered.push(loc);
        deduped.length = 0;
        deduped.push(...filtered);
      } else if (loc.includes(',') && !deduped.some(d => d.includes(',') && d.toLowerCase().startsWith(locLower.split(',')[0]))) {
        // This is a more specific version, replace the less specific one
        const idx = deduped.findIndex(d => locLower.startsWith(d.toLowerCase()));
        if (idx >= 0) {
          deduped[idx] = loc;
        }
      }
    }

    return deduped;
  };

  // Extract single location from description text (returns first found)
  const extractLocationFromText = (text: string): string | null => {
    const locations = extractAllLocationsFromText(text);
    return locations.length > 0 ? locations[0] : null;
  };

  // Simple keyword extraction fallback
  const extractKeywordsFromText = (text: string): string[] => {
    // Comprehensive list of tech skills, frameworks, and concepts
    const commonTechSkills = [
      // Programming Languages
      'Python', 'JavaScript', 'TypeScript', 'Java', 'Go', 'Golang', 'Rust', 'C++', 'C#',
      '.NET', 'Ruby', 'Rails', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Elixir', 'Clojure',

      // Frontend
      'React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'React Native', 'Flutter',

      // Backend & APIs
      'Node.js', 'Django', 'FastAPI', 'Spring', 'Spring Boot', 'Express', 'NestJS',
      'REST', 'RESTful', 'GraphQL', 'gRPC', 'API', 'API-first', 'Microservices',

      // Cloud & Infrastructure
      'AWS', 'GCP', 'Azure', 'Cloud', 'Cloud-native', 'Serverless', 'Lambda',
      'Docker', 'Kubernetes', 'K8s', 'Terraform', 'Ansible', 'Pulumi',
      'Linux', 'Unix', 'Infrastructure',

      // Data & Databases
      'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
      'Cassandra', 'DynamoDB', 'Snowflake', 'BigQuery', 'Data Engineering',
      'ETL', 'Data Pipeline', 'Data Warehouse',

      // Streaming & Messaging
      'Kafka', 'RabbitMQ', 'SQS', 'Event-driven', 'Event Streaming', 'Pub/Sub',

      // DevOps & SRE
      'CI/CD', 'DevOps', 'SRE', 'Site Reliability', 'Observability', 'Monitoring',
      'Prometheus', 'Grafana', 'Datadog', 'New Relic', 'PagerDuty',
      'Jenkins', 'GitHub Actions', 'GitLab CI', 'ArgoCD',

      // AI/ML
      'AI', 'Machine Learning', 'ML', 'Deep Learning', 'NLP', 'LLM',
      'TensorFlow', 'PyTorch', 'Data Science', 'Computer Vision',

      // Big Data
      'Spark', 'Hadoop', 'Flink', 'Airflow', 'dbt',

      // Architecture & Design
      'Microservices', 'Distributed Systems', 'System Design', 'Architecture',
      'Event-driven', 'Domain-driven', 'DDD', 'CQRS', 'Event Sourcing',
      'Scalability', 'High Availability', 'Fault Tolerance',

      // Security & Compliance
      'Security', 'Cybersecurity', 'InfoSec', 'OAuth', 'SAML', 'SSO',
      'Encryption', 'Compliance', 'SOC2', 'GDPR', 'HIPAA', 'PCI',

      // Methodologies & Practices
      'Agile', 'Scrum', 'Kanban', 'SDLC', 'TDD', 'BDD',
      'Code Review', 'Pair Programming', 'Trunk-based Development',

      // Leadership & Management (for senior roles)
      'Engineering Manager', 'Tech Lead', 'Staff Engineer', 'Principal',
      'Director', 'VP Engineering', 'CTO', 'People Leadership',
      'Team Building', 'Mentoring', 'Coaching',

      // Product & Business
      'SaaS', 'B2B', 'B2C', 'Product Development', 'Product Management',
      'Stakeholder Management', 'Cross-functional',

      // Version Control & Collaboration
      'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence',

      // Testing
      'Unit Testing', 'Integration Testing', 'E2E Testing', 'Automated Testing',
      'Test Automation', 'Selenium', 'Cypress', 'Jest', 'Pytest',

      // Mobile
      'iOS', 'Android', 'Mobile Development', 'React Native', 'Flutter',
    ];

    const found: string[] = [];
    const lowerText = text.toLowerCase();

    for (const skill of commonTechSkills) {
      // Use word boundary matching to avoid partial matches
      const skillLower = skill.toLowerCase();
      // Check for the skill with word boundaries (handles hyphenated terms too)
      const regex = new RegExp(`\\b${skillLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        // Avoid duplicates (case-insensitive)
        if (!found.some(f => f.toLowerCase() === skillLower)) {
          found.push(skill);
        }
      }
    }

    return found.slice(0, 15); // Return max 15 skills
  };

  // Handle paste event on description field
  const handleDescriptionPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    // Let the paste happen naturally, then auto-parse
    setTimeout(() => {
      const newDescription = customJD.description + pastedText;
      autoParseFromDescription(newDescription);
    }, 0);
  };

  const parseJobDescription = async () => {
    setIsParsing(true);
    setSearchError(null);

    const userSkills = customJD.skills.split(',').map((s) => s.trim()).filter(Boolean);
    const userLocation = customJD.location?.trim();
    const userTitle = customJD.title?.trim() || 'Software Engineer';
    const intakeNotes = customJD.intakeNotes?.trim();
    const isFullyRemote = customJD.isFullyRemote;

    try {
      // Get the Anthropic API key from localStorage
      const apiKey = localStorage.getItem('riley_anthropic_api_key');

      // Call AI endpoint to generate intelligent search strategy
      const response = await fetch(`${API_BASE}/api/demo/ai/generate-search-strategy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Anthropic-Api-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          title: userTitle,
          description: customJD.description,
          skills: userSkills.length > 0 ? userSkills : undefined,
          location: isFullyRemote ? undefined : userLocation, // Skip location for fully remote
          isFullyRemote,
          intakeNotes: intakeNotes || undefined, // Notes from HM that override JD
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Set parsed criteria from AI response
        setParsedCriteria(data.parsedCriteria);

        // Set the rich search strategy
        setSearchStrategy(data.strategy);

        console.log('[Sourcing] AI search strategy generated:', data.aiPowered ? 'AI-powered' : 'Mock', data.strategy);
      } else {
        throw new Error('Failed to generate search strategy');
      }
    } catch (error) {
      console.error('[Sourcing] AI parsing error, using fallback:', error);

      // Fallback to basic parsing
      const criteria: ParsedCriteria = {
        titles: [userTitle],
        requiredSkills: userSkills.length > 0 ? userSkills : ['Software Engineering'],
        preferredSkills: [],
        experienceYears: { min: 3, max: 10 },
        locations: userLocation ? [userLocation] : [],
        booleanQuery: `"${userTitle}" AND (${userSkills.slice(0, 5).join(' OR ') || 'Software'})`,
        searchKeywords: `${userTitle} ${userSkills.slice(0, 5).join(' ')}`,
        confidence: 0.7,
      };
      setParsedCriteria(criteria);
      setSearchStrategy(null);
    } finally {
      setIsParsing(false);
    }
  };

  const startSearch = async () => {
    if (!parsedCriteria) {
      setSearchError('Please parse a job description first');
      return;
    }

    if (!unipileConfig) {
      setSearchError('LinkedIn is not connected. Please connect in Settings first.');
      return;
    }

    await searchUnipile();
  };

  // Real Unipile LinkedIn search
  const searchUnipile = async () => {
    if (!unipileConfig || !parsedCriteria) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchApiUsed(null);
    setApiWarning(null);
    setLastSearchQuery(null);

    const runId = `unipile-${Date.now()}`;
    setSearchRun({
      id: runId,
      status: 'running',
      progress: 10,
      totalFound: 0,
      candidates: [],
    });

    try {
      const apiUrl = `https://${unipileConfig.dsn}.unipile.com:${unipileConfig.port}/api/v1/linkedin/search?account_id=${unipileConfig.accountId}`;

      // Build keywords for LinkedIn search
      // PRIORITY: Always use the Boolean query from the editor (editableBooleanQuery)
      // This ensures the actual Boolean syntax is sent to LinkedIn, not simplified keywords
      //
      // API Length Limits (empirically determined):
      // - Classic API: ~60 characters (VERY strict - LinkedIn Classic rejects even 93 chars!)
      // - Sales Navigator: ~500 characters
      // - Recruiter: ~1000 characters
      const API_KEYWORD_LIMITS: Record<string, number> = {
        classic: 60,  // Reduced from 100 - Classic API is extremely restrictive
        sales_navigator: 500,
        recruiter: 1000,
      };

      const truncateQuery = (query: string, maxLength: number): string => {
        if (query.length <= maxLength) {
          return query;
        }

        // For very short limits (Classic API), create a simplified query
        if (maxLength <= 60) {
          // Extract the most important term - usually the job title
          // Try to find a quoted phrase first
          const quotedMatch = query.match(/"([^"]+)"/);
          if (quotedMatch && quotedMatch[1]) {
            const title = `"${quotedMatch[1]}"`;
            if (title.length <= maxLength) {
              console.log(`[Sourcing] Classic API: Using just title "${quotedMatch[1]}" (${title.length} chars)`);
              return title;
            }
          }

          // Fall back to first term before AND/OR
          const firstTerm = query.split(/\s+(?:AND|OR)\s+/)[0]?.trim();
          if (firstTerm && firstTerm.length <= maxLength) {
            // Balance parentheses
            let balanced = firstTerm;
            const openCount = (balanced.match(/\(/g) || []).length;
            const closeCount = (balanced.match(/\)/g) || []).length;
            if (openCount > closeCount) {
              balanced += ')'.repeat(openCount - closeCount);
            }
            console.log(`[Sourcing] Classic API: Using first term (${balanced.length} chars):`, balanced);
            return balanced;
          }

          // Last resort: just use the first 55 chars + balance parens
          let simple = query.substring(0, 55).replace(/\s+\S*$/, '').trim();
          const openCount = (simple.match(/\(/g) || []).length;
          const closeCount = (simple.match(/\)/g) || []).length;
          if (openCount > closeCount) {
            simple += ')'.repeat(openCount - closeCount);
          }
          console.log(`[Sourcing] Classic API: Truncated to ${simple.length} chars`);
          return simple;
        }

        // For longer limits, try to truncate at a word boundary while keeping valid Boolean syntax
        let truncated = query.substring(0, maxLength);

        // Try to truncate at an OR boundary to keep the query valid
        const lastOr = truncated.lastIndexOf(' OR ');
        const lastAnd = truncated.lastIndexOf(' AND ');
        const lastNot = truncated.lastIndexOf(' NOT ');

        // Find the best truncation point (the rightmost operator boundary that's > 50% of the limit)
        const minBoundary = maxLength * 0.5;
        const bestBoundary = Math.max(
          lastOr > minBoundary ? lastOr : 0,
          lastAnd > minBoundary ? lastAnd : 0,
          lastNot > minBoundary ? lastNot : 0
        );

        if (bestBoundary > minBoundary) {
          truncated = truncated.substring(0, bestBoundary);
        } else {
          truncated = truncated.replace(/\s+\S*$/, '').trim();
        }

        // Balance parentheses if needed
        const openCount = (truncated.match(/\(/g) || []).length;
        const closeCount = (truncated.match(/\)/g) || []).length;
        if (openCount > closeCount) {
          truncated += ')'.repeat(openCount - closeCount);
        }

        console.log(`[Sourcing] Truncated query to ${truncated.length} chars (limit: ${maxLength})`);
        return truncated;
      };

      const buildKeywords = (api: 'classic' | 'sales_navigator' | 'recruiter'): string => {
        // Priority 1: If user edited the query in the editor, use that
        if (editableBooleanQuery?.trim() && editableBooleanQuery !== parsedCriteria.booleanQuery) {
          console.log(`[Sourcing] Using USER-EDITED Boolean query (${editableBooleanQuery.length} chars):`, editableBooleanQuery);
          if (api === 'classic') {
            return truncateQuery(editableBooleanQuery.trim(), API_KEYWORD_LIMITS.classic);
          }
          return editableBooleanQuery.trim();
        }

        // Priority 2: Use the API-specific query from searchStrategy.searchQueries
        // These are the "Recommended API Booleans" shown in the UI
        const apiQuery = searchStrategy?.searchQueries?.find(sq => sq.api === api)?.query;
        if (apiQuery?.trim()) {
          const trimmedQuery = apiQuery.trim();
          const apiLimit = API_KEYWORD_LIMITS[api] || 100;

          // Apply truncation if query exceeds API limit
          if (trimmedQuery.length > apiLimit) {
            const truncated = truncateQuery(trimmedQuery, apiLimit);
            console.log(`[Sourcing] Using RECOMMENDED query for ${api.toUpperCase()} API, truncated from ${trimmedQuery.length} to ${truncated.length} chars (limit: ${apiLimit}):`, truncated);
            return truncated;
          }
          console.log(`[Sourcing] Using RECOMMENDED query for ${api.toUpperCase()} API (${trimmedQuery.length} chars, limit: ${apiLimit}):`, trimmedQuery);
          return trimmedQuery;
        }

        // Priority 3: Fall back to parsedCriteria.booleanQuery (generic query)
        const booleanQuery = parsedCriteria.booleanQuery?.trim();
        if (booleanQuery) {
          console.log(`[Sourcing] Using FALLBACK Boolean query from parsedCriteria (${booleanQuery.length} chars):`, booleanQuery);
          if (api === 'classic') {
            return truncateQuery(booleanQuery, API_KEYWORD_LIMITS.classic);
          }
          return booleanQuery;
        }

        // Fallback: Build simple keywords if no Boolean query available (shouldn't happen normally)
        console.log('[Sourcing] WARNING: No Boolean query available, falling back to simple keywords');
        const keywordParts: string[] = [];

        if (api === 'classic') {
          // CLASSIC API: Keep it short to avoid LinkedIn limits
          // Use only the first/primary title (most important)
          if (parsedCriteria.titles.length > 0) {
            keywordParts.push(parsedCriteria.titles[0]);
          }

          // Add only 2-3 key skills to keep query short
          if (parsedCriteria.requiredSkills.length > 0) {
            keywordParts.push(parsedCriteria.requiredSkills.slice(0, 3).join(' '));
          }

          // Truncate to stay under LinkedIn's limit
          let keywords = keywordParts.join(' ');
          if (keywords.length > 150) {
            keywords = keywords.substring(0, 150).trim();
          }
          return keywords;
        } else {
          // RECRUITER/SALES NAVIGATOR: Use full detailed query
          // Add all titles
          if (parsedCriteria.titles.length > 0) {
            keywordParts.push(parsedCriteria.titles.join(' OR '));
          }

          // Add all required skills
          if (parsedCriteria.requiredSkills.length > 0) {
            keywordParts.push(parsedCriteria.requiredSkills.join(' '));
          }

          // Add preferred skills
          if (parsedCriteria.preferredSkills && parsedCriteria.preferredSkills.length > 0) {
            keywordParts.push(parsedCriteria.preferredSkills.slice(0, 5).join(' '));
          }

          return keywordParts.join(' ');
        }
      };

      console.log('[Sourcing] Building keywords for search...');

      // First, check which API types are available for this account
      // This prevents wasting time trying APIs that will fail
      console.log('[Sourcing] Checking account API capabilities...');
      setSearchRun((prev) => prev ? { ...prev, progress: 12 } : null);

      let availableApis: Array<'recruiter' | 'sales_navigator' | 'classic'> = [];

      // Test each API with a minimal query to see which are available
      const testApis = async () => {
        const apiTypes: Array<'recruiter' | 'sales_navigator' | 'classic'> = ['recruiter', 'sales_navigator', 'classic'];
        const available: Array<'recruiter' | 'sales_navigator' | 'classic'> = [];

        for (const apiType of apiTypes) {
          try {
            const testBody = {
              api: apiType,
              category: 'people',
              keywords: 'test',
              limit: 1,
            };

            const testResponse = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': unipileConfig.apiKey,
              },
              body: JSON.stringify(testBody),
            });

            if (testResponse.ok) {
              const data = await testResponse.json();
              if (data.object === 'LinkedinSearch') {
                console.log(`[Sourcing] ✓ Account has ${apiType} access`);
                available.push(apiType);
              }
            } else {
              console.log(`[Sourcing] ✗ Account does NOT have ${apiType} access`);
            }
          } catch {
            console.log(`[Sourcing] ✗ ${apiType} API check failed`);
          }
        }

        return available;
      };

      availableApis = await testApis();

      if (availableApis.length === 0) {
        throw new Error('No LinkedIn API access available. Please check your Unipile account configuration.');
      }

      console.log(`[Sourcing] Available APIs: ${availableApis.join(', ')}`);

      // Only try APIs that are actually available
      const apisToTry = availableApis;
      const unavailableApis: string[] = [];

      let response: Response | null = null;
      let successApi = '';
      let successSearchBody: Record<string, unknown> | null = null;

      // Get location from parsed criteria or custom JD
      const searchLocation = parsedCriteria.locations?.[0] || customJD.location;

      // LinkedIn geo ID for United States
      const US_GEO_ID = '103644278';

      // Look up location ID if location is specified
      // Location IDs can be numeric (preferred) or strings depending on Unipile's response
      let locationIds: (string | number)[] = [];
      let resolvedLocationName: string | null = null;

      // If US Only is enabled (default), always apply US geo filter
      if (customJD.usOnlySearch) {
        locationIds = [US_GEO_ID];
        resolvedLocationName = 'United States';
        console.log(`[Sourcing] ✓ US Only search enabled - using US geo ID: ${US_GEO_ID}`);
      }

      // If a specific location is also provided, look it up and use it instead (more specific)
      if (searchLocation) {
        setSearchRun((prev) => prev ? { ...prev, progress: 15 } : null);
        console.log(`[Sourcing] Looking up location ID for: "${searchLocation}"`);

        // Try multiple location search formats to improve hit rate
        // LinkedIn's location database can be picky about formatting
        const locationVariants = [
          searchLocation,                                    // Original: "Scottsdale, AZ"
          searchLocation.split(',')[0].trim(),               // City only: "Scottsdale"
          searchLocation.replace(/,\s*/g, ' '),              // No comma: "Scottsdale AZ"
          searchLocation.replace(/,\s*([A-Z]{2})$/i, ''),    // Remove state code: "Scottsdale"
        ].filter((v, i, arr) => v && arr.indexOf(v) === i);  // Remove duplicates and empty

        console.log(`[Sourcing] Will try location variants:`, locationVariants);

        try {
        for (const locationVariant of locationVariants) {
          const locationLookupUrl = `https://${unipileConfig.dsn}.unipile.com:${unipileConfig.port}/api/v1/linkedin/search/parameters?account_id=${unipileConfig.accountId}&type=LOCATION&keywords=${encodeURIComponent(locationVariant)}&limit=5`;
          console.log(`[Sourcing] Trying location lookup: "${locationVariant}"`);

          const locationResponse = await fetch(locationLookupUrl, {
            method: 'GET',
            headers: {
              'X-API-KEY': unipileConfig.apiKey,
            },
          });

          if (locationResponse.ok) {
            const locationData = await locationResponse.json();
            console.log(`[Sourcing] Location lookup response for "${locationVariant}":`, JSON.stringify(locationData, null, 2));

            // Get the first matching location ID
            if (locationData.items && locationData.items.length > 0) {
              // Log all options for debugging
              console.log('[Sourcing] Available locations:');
              locationData.items.forEach((item: Record<string, unknown>, idx: number) => {
                console.log(`  ${idx + 1}. FULL ITEM:`, JSON.stringify(item));
              });

              // Based on Unipile docs, location parameter response has "id" field
              // Example: { "object": "LinkedinSearchParameter", "title": "...", "id": "102277331" }
              const firstItem = locationData.items[0];

              // Try different possible ID fields from the response
              const rawId = firstItem.id || firstItem.urn || firstItem.entity_urn;
              console.log(`[Sourcing] Raw location ID: type=${typeof rawId}, value="${rawId}"`);

              if (rawId) {
                // Extract numeric ID from various formats
                let extractedId: string | number = rawId;

                // Handle URN format: "urn:li:geo:102277331"
                if (typeof rawId === 'string' && rawId.includes('urn:li:geo:')) {
                  extractedId = rawId.replace('urn:li:geo:', '');
                  console.log(`[Sourcing] Extracted from URN: ${extractedId}`);
                }

                // Convert to number (Unipile expects numeric IDs in the location array)
                const numericId = parseInt(String(extractedId), 10);
                if (!isNaN(numericId)) {
                  locationIds = [numericId];
                  console.log(`[Sourcing] ✓ Using NUMERIC location ID: ${numericId}`);
                } else {
                  // If we can't parse as number, use as-is but log warning
                  locationIds = [extractedId];
                  console.warn(`[Sourcing] ⚠ Could not parse location ID as number, using: ${extractedId}`);
                }

                resolvedLocationName = firstItem.name || firstItem.title || locationVariant;
                console.log(`[Sourcing] ✓ Resolved location: "${resolvedLocationName}" with ID: ${locationIds[0]}`);
                break; // Found a match, stop trying variants
              } else {
                console.warn(`[Sourcing] ⚠ Location item found but no ID field:`, JSON.stringify(firstItem));
              }
            } else {
              console.log(`[Sourcing] No results for "${locationVariant}", trying next variant...`);
            }
          } else {
            const errorText = await locationResponse.text();
            console.warn(`[Sourcing] ⚠ Location lookup failed for "${locationVariant}": ${locationResponse.status} - ${errorText}`);
          }
        }

        // Check if we found a specific city, or if we're falling back to US-only
        if (locationIds.length === 1 && locationIds[0] === US_GEO_ID && customJD.usOnlySearch) {
          console.log(`[Sourcing] ⚠ Could not resolve specific city "${searchLocation}" - using US-wide search instead`);
        } else if (locationIds.length === 0) {
          console.warn(`[Sourcing] ⚠ Could not resolve location ID for "${searchLocation}" after trying all variants`);
        }
        } catch (err) {
          console.warn('[Sourcing] Location lookup error:', err);
          // If lookup fails but US Only is enabled, we still have the US ID
          if (customJD.usOnlySearch && (locationIds.length === 0 || (locationIds.length === 1 && locationIds[0] !== US_GEO_ID))) {
            locationIds = [US_GEO_ID];
            resolvedLocationName = 'United States';
            console.log(`[Sourcing] Falling back to US-wide search due to lookup error`);
          }
        }
      } else if (!customJD.usOnlySearch) {
        console.log('[Sourcing] No location specified and US Only disabled - searching worldwide');
      } else {
        console.log('[Sourcing] No specific location - using US-only filter');
      }

      for (const api of apisToTry) {
        // Build keywords - truncate only for Classic API
        const keywords = buildKeywords(api);
        console.log(`[Sourcing] Keywords for ${api} API (${keywords.length} chars):`, keywords);

        const searchBody: Record<string, unknown> = {
          api,
          category: 'people',
          limit: Math.min(maxResults, 100), // Request up to maxResults (Unipile max is typically 100)
        };

        if (keywords) {
          searchBody.keywords = keywords;
        }

        // Add location filter using the looked-up ID
        // CRITICAL: Unipile expects location as an array of STRING IDs (not numbers!)
        // Schema: "items": {"type": "string", "pattern": "^\\d+$"}
        // Format: "location": ["100855814"] (strings that contain digits)
        if (locationIds.length > 0) {
          // Convert all IDs to strings (Unipile schema requires strings)
          const stringLocationIds = locationIds.map(id => String(id)).filter(id => /^\d+$/.test(id));

          if (stringLocationIds.length > 0) {
            searchBody.location = stringLocationIds;
            console.log(`[Sourcing] ✓ Location filter applied: ${JSON.stringify(stringLocationIds)} (as strings)`);
          } else {
            console.warn(`[Sourcing] ⚠ Could not convert location IDs to valid strings: ${JSON.stringify(locationIds)}`);
          }
        }

        // For recruiter API, add advanced role filter
        if (api === 'recruiter' && parsedCriteria.titles.length > 0) {
          searchBody.role = [{
            keywords: parsedCriteria.titles.join(' OR '),
            priority: 'MUST_HAVE',
            scope: 'CURRENT_OR_PAST',
          }];
        }

        console.log(`[Sourcing] ========================================`);
        console.log(`[Sourcing] Trying ${api} API`);
        console.log(`[Sourcing] Location IDs being sent: ${JSON.stringify(searchBody.location)} (type: ${typeof searchBody.location})`);
        console.log(`[Sourcing] FULL REQUEST BODY:`, JSON.stringify(searchBody, null, 2));
        console.log(`[Sourcing] ========================================`);
        setSearchRun((prev) => prev ? { ...prev, progress: 20 + apisToTry.indexOf(api) * 10 } : null);

        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': unipileConfig.apiKey,
          },
          body: JSON.stringify(searchBody),
        });

        if (response.ok) {
          console.log(`[Sourcing] Success with ${api} API`);
          successApi = api;
          successSearchBody = searchBody; // Store for pagination

          // Capture the search query that was used
          setLastSearchQuery({
            keywords,
            location: resolvedLocationName || searchLocation || null,
            locationId: locationIds[0] || null,
            api,
            fullBody: searchBody,
          });

          break;
        }

        // Check if it's a subscription/availability error - try next API
        const errorText = await response.text();

        // Handle different error types that indicate the API isn't available or query needs adjustment:
        // - 403 with feature_not_subscribed: LinkedIn subscription not available
        // - 400 with invalid_parameters and api schema mismatch: API type not supported
        // - 400 with content_too_large: Query is too long for this API
        const isSubscriptionError = response.status === 403 && errorText.includes('feature_not_subscribed');
        const isApiTypeError = response.status === 400 && errorText.includes('invalid_parameters') &&
          (api === 'recruiter' || api === 'sales_navigator') &&
          !errorText.includes(`"api":{"const":"${api}"`);
        const isContentTooLargeError = response.status === 400 && errorText.includes('content_too_large');

        if (isSubscriptionError || isApiTypeError || isContentTooLargeError) {
          const reason = isSubscriptionError ? 'no subscription' :
            isApiTypeError ? 'API type not supported' :
            `query too large (${keywords.length} chars)`;
          console.log(`[Sourcing] ${api} API not available (${reason}), trying next...`);
          console.log(`[Sourcing] Error details: ${errorText.substring(0, 200)}`);
          unavailableApis.push(api);
          continue;
        }

        // Log the full error for debugging
        console.error(`[Sourcing] ${api} API error (${response.status}):`, errorText.substring(0, 500));

        // Other error - throw immediately
        throw new Error(`Unipile API error: ${response.status} - ${errorText}`);
      }

      if (!response || !response.ok) {
        // Log what was tried
        console.error(`[Sourcing] All APIs failed. Unavailable APIs:`, unavailableApis);
        throw new Error(`No LinkedIn search API available. Tried: ${apisToTry.join(', ')}. Check console for error details.`);
      }

      // Set which API was used and any warnings about unavailable APIs
      setSearchApiUsed(successApi);
      if (unavailableApis.length > 0) {
        const apiNames = unavailableApis.map(a =>
          a === 'recruiter' ? 'LinkedIn Recruiter' :
          a === 'sales_navigator' ? 'Sales Navigator' : 'Classic'
        );
        setApiWarning(`${apiNames.join(' and ')} not available (no subscription). Using ${
          successApi === 'recruiter' ? 'LinkedIn Recruiter' :
          successApi === 'sales_navigator' ? 'Sales Navigator' : 'Classic LinkedIn'
        } instead.`);
      }

      setSearchRun((prev) => prev ? { ...prev, progress: 70 } : null);

      // Fetch all pages up to maxResults
      let allItems: UnipileSearchProfile[] = [];
      let pageNum = 1;
      const maxPages = Math.ceil(maxResults / 25); // Unipile typically returns ~10-25 per page

      // Initial fetch is already done, parse first response
      let data = await response.json();
      console.log('[Sourcing] Unipile search response (page 1):', data);
      console.log(`[Sourcing] Items returned: ${data.items?.length || 0}`);
      console.log(`[Sourcing] Paging info:`, data.paging);
      console.log(`[Sourcing] Cursor:`, data.cursor ? `present (${data.cursor.substring(0, 20)}...)` : 'none - NO PAGINATION AVAILABLE');
      console.log(`[Sourcing] API used: ${successApi}`);

      if (data.items) {
        allItems = [...data.items];
      }

      // Check if pagination is available
      const initialCount = data.items?.length || 0;
      const wantedMore = initialCount < maxResults;
      const noCursor = !data.cursor;

      if (wantedMore && noCursor) {
        console.warn(`[Sourcing] ⚠ Wanted ${maxResults} results but only got ${initialCount}. No cursor returned - ${successApi} API may not support pagination or reached end of results.`);
        if (successApi === 'classic') {
          console.warn('[Sourcing] ⚠ Classic LinkedIn API often limits results to ~10-25. Upgrade to Sales Navigator or Recruiter for more results.');
        }
      }

      // Fetch additional pages if cursor is available and we need more results
      while (
        data.cursor &&
        allItems.length < maxResults &&
        pageNum < maxPages &&
        successSearchBody
      ) {
        pageNum++;
        console.log(`[Sourcing] Fetching page ${pageNum} (have ${allItems.length}/${maxResults} results)...`);

        const nextPageBody = {
          ...JSON.parse(JSON.stringify(successSearchBody)), // Clone the original body
          cursor: data.cursor,
        };

        const nextResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': unipileConfig.apiKey,
          },
          body: JSON.stringify(nextPageBody),
        });

        if (!nextResponse.ok) {
          console.warn(`[Sourcing] Page ${pageNum} fetch failed:`, await nextResponse.text());
          break;
        }

        data = await nextResponse.json();
        console.log(`[Sourcing] Page ${pageNum} response:`, data.items?.length || 0, 'items');

        if (data.items && data.items.length > 0) {
          allItems = [...allItems, ...data.items];
        } else {
          // No more items, stop pagination
          break;
        }

        // Update progress
        const progressPct = 70 + Math.min(25, (allItems.length / maxResults) * 25);
        setSearchRun((prev) => prev ? { ...prev, progress: progressPct } : null);
      }

      console.log(`[Sourcing] ✓ Total items fetched across ${pageNum} page(s): ${allItems.length}`);

      // Show warning if using Classic API with limited results
      if (successApi === 'classic' && allItems.length < maxResults && allItems.length <= 25) {
        setApiWarning(`Classic LinkedIn API returned ${allItems.length} results (max ~10-25). For more results, upgrade to Sales Navigator or LinkedIn Recruiter.`);
      }

      // Replace data.items with allItems for the rest of the processing
      data.items = allItems;

      // Log the config that was actually used (Unipile returns this)
      if (data.config?.params) {
        console.log('[Sourcing] ✓ Unipile confirmed search params:', JSON.stringify(data.config.params, null, 2));
        // Check if location was actually applied
        if (data.config.params.location) {
          console.log(`[Sourcing] ✓ Location filter confirmed in response: ${JSON.stringify(data.config.params.location)}`);
        } else {
          console.warn('[Sourcing] ⚠ Location filter NOT in response config - API may have ignored it');
        }

        // Update lastSearchQuery with confirmed params
        setLastSearchQuery(prev => prev ? {
          ...prev,
          confirmedParams: data.config.params
        } : null);
      }

      // Log first profile to debug field names - print EVERYTHING to find the right ID
      if (data.items?.[0]) {
        const firstProfile = data.items[0];
        console.log('[Sourcing] === FULL FIRST PROFILE ===');
        console.log(JSON.stringify(firstProfile, null, 2));
        console.log('[Sourcing] All keys:', Object.keys(firstProfile));
        // Check specific fields that might contain the LinkedIn ID
        console.log('[Sourcing] provider_id:', firstProfile.provider_id);
        console.log('[Sourcing] id:', firstProfile.id);
        console.log('[Sourcing] member_urn:', firstProfile.member_urn);
        console.log('[Sourcing] public_identifier:', firstProfile.public_identifier);
        console.log('[Sourcing] profile_url:', firstProfile.profile_url);
        console.log('[Sourcing] urn:', firstProfile.urn);
        console.log('[Sourcing] social_id:', firstProfile.social_id);
        console.log('[Sourcing] entity_urn:', firstProfile.entity_urn);
        console.log('[Sourcing] === END PROFILE DEBUG ===');
      }

      // Convert Unipile profiles to our candidate format
      const candidates: SourcedCandidate[] = (data.items || []).map((profile: UnipileSearchProfile, index: number) => {
        const name = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown';
        const currentPosition = profile.current_positions?.[0];

        // Try multiple fields for provider ID - Unipile may return it in different fields
        // depending on the API type (classic vs sales_navigator vs recruiter)
        // The LinkedIn provider ID for messaging looks like: ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E
        // IMPORTANT: The `id` field contains the correct format (ACo...), NOT member_urn (urn:li:member:...)
        let providerId = profile.provider_id || profile.id || profile.urn || profile.entity_urn || profile.social_id;

        // If no direct provider_id found, try to extract from profile_url or public_identifier
        // LinkedIn internal URLs sometimes contain the provider ID
        if (!providerId && profile.profile_url) {
          // Try to extract ACoAAA... or similar pattern from URL
          const acoMatch = profile.profile_url.match(/\/(ACo[A-Za-z0-9_-]+)/);
          if (acoMatch) {
            providerId = acoMatch[1];
          }
        }

        // As last resort, use public_identifier (the vanity URL slug)
        // Note: This may not work for messaging, but better than nothing
        if (!providerId) {
          providerId = profile.public_identifier || profile.id;
        }

        console.log(`[Sourcing] Candidate ${name}: providerId=${providerId}, public_identifier=${profile.public_identifier}`);

        // Extract company name with multiple fallback strategies
        let currentCompany = currentPosition?.company;
        if (!currentCompany && profile.headline) {
          // Try "Title at Company" pattern
          const atMatch = profile.headline.match(/\s+at\s+([^|•–-]+)/i);
          if (atMatch) {
            currentCompany = atMatch[1].trim();
          }
          // Try "Title @ Company" pattern
          if (!currentCompany) {
            const atSymbolMatch = profile.headline.match(/\s+@\s+([^|•–-]+)/i);
            if (atSymbolMatch) {
              currentCompany = atSymbolMatch[1].trim();
            }
          }
          // Try "Title, Company" pattern (less reliable but common)
          if (!currentCompany) {
            const commaMatch = profile.headline.match(/,\s+([^|•–,]+?)(?:\s*[|•–]|$)/i);
            if (commaMatch) {
              currentCompany = commaMatch[1].trim();
            }
          }
        }

        return {
          id: `cand-${index}-${profile.public_identifier || profile.id || Date.now()}`, // Unique internal ID
          providerId, // Important for messaging API - the ACo... format ID
          name,
          headline: profile.headline,
          currentTitle: currentPosition?.role,
          currentCompany,
          location: profile.location,
          profileUrl: profile.profile_url || `https://linkedin.com/in/${profile.public_identifier || 'unknown'}`,
          profilePictureUrl: profile.profile_picture_url,
          relevanceScore: Math.max(50, 100 - index * 3), // Rough score based on ranking
          status: 'new' as const,
        };
      });

      const displayedCandidates = candidates.slice(0, maxResults);
      setSearchRun({
        id: runId,
        status: 'completed',
        progress: 100,
        totalFound: displayedCandidates.length, // Show actual returned count
        candidates: displayedCandidates,
        criteria: parsedCriteria,
      });

      // Log search to Riley context for activity awareness
      const searchQueryForLog = parsedCriteria?.titles?.[0] || editableBooleanQuery || 'LinkedIn search';
      addSearch(searchQueryForLog, displayedCandidates.length);

      // Automatically run AI scoring if enabled
      if (aiScoringEnabled && displayedCandidates.length > 0) {
        // Use setTimeout to allow state and ref to update
        setTimeout(() => runAiScoring(), 200);
      }
    } catch (error) {
      console.error('[Sourcing] Unipile search error:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setSearchRun({
        id: runId,
        status: 'failed',
        progress: 0,
        totalFound: 0,
        candidates: [],
        error: error instanceof Error ? error.message : 'Search failed',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 text-green-800';
    if (score >= 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  // Clear all search configuration and results
  const clearSearch = () => {
    // Reset all state to initial values
    setCustomJD({
      title: '',
      description: '',
      skills: '',
      location: '',
      companyName: '',
      isFullyRemote: false,
      isContractRole: false,
      usOnlySearch: true, // Default to US only
      intakeNotes: '',
      excludeCompanies: '',
      targetIndustries: '',
    });
    setParsedCriteria(null);
    setSearchStrategy(null);
    setSearchRun(null);
    setEditableBooleanQuery('');
    setIsBooleanQueryValid(true);
    setLastSearchQuery(null);
    setSearchError(null);
    setApiWarning(null);
    setSelectedCandidates(new Set());
    setSkillsAutoPopulated(false);
    setCompanyData(new Map());
    setFilterByScore('all');

    // Clear from localStorage
    try {
      localStorage.removeItem(SOURCING_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidate Sourcing</h1>
          <p className="text-gray-600">Search for candidates on LinkedIn or GitHub</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Clear Search Button */}
          {(customJD.title || customJD.description || parsedCriteria || searchRun || githubCandidates.length > 0) && (
            <button
              onClick={() => {
                clearSearch();
                setGithubCandidates([]);
                setGithubSearchError(null);
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              title="Clear all search configuration and results"
            >
              <Trash2 className="h-4 w-4" />
              Clear Search
            </button>
          )}
          {/* Connection Status Badges */}
          {searchSource === 'linkedin' && (
            unipileConfig ? (
              <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                <Linkedin className="h-3 w-3" />
                LinkedIn Connected
              </span>
            ) : (
              <a
                href="/settings"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200 transition-colors"
              >
                <WifiOff className="h-3 w-3" />
                Connect LinkedIn in Settings
              </a>
            )
          )}
          {searchSource === 'github' && (
            githubConfig ? (
              <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-800 text-white rounded-full">
                <Github className="h-3 w-3" />
                GitHub Connected ({githubConfig.username})
              </span>
            ) : (
              <a
                href="/settings"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200 transition-colors"
              >
                <WifiOff className="h-3 w-3" />
                Connect GitHub in Settings
              </a>
            )
          )}
        </div>
      </div>

      {/* Source Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setSearchSource('linkedin')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            searchSource === 'linkedin'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Linkedin className="h-4 w-4" />
          LinkedIn
        </button>
        <button
          onClick={() => setSearchSource('github')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            searchSource === 'github'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Github className="h-4 w-4" />
          GitHub
        </button>
      </div>

      {/* API Warning Alert */}
      {apiWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-yellow-800">LinkedIn API Fallback</h3>
            <p className="text-sm text-yellow-700 mt-1">{apiWarning}</p>
            <button
              onClick={() => setApiWarning(null)}
              className="text-sm text-yellow-600 hover:text-yellow-800 mt-2 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Search Error Alert (LinkedIn) */}
      {searchSource === 'linkedin' && searchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">Search Failed</h3>
            <p className="text-sm text-red-700 mt-1">{searchError}</p>
            <button
              onClick={() => setSearchError(null)}
              className="text-sm text-red-600 hover:text-red-800 mt-2 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* GitHub Search Error Alert */}
      {searchSource === 'github' && githubSearchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">GitHub Search Failed</h3>
            <p className="text-sm text-red-700 mt-1">{githubSearchError}</p>
            <button
              onClick={() => setGithubSearchError(null)}
              className="text-sm text-red-600 hover:text-red-800 mt-2 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* GITHUB SOURCING UI */}
      {/* ============================================================ */}
      {searchSource === 'github' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - GitHub Search Configuration */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Github className="h-5 w-5" />
                GitHub Search
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Programming Language
                  </label>
                  <select
                    value={githubSearchParams.language}
                    onChange={(e) => setGithubSearchParams({ ...githubSearchParams, language: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  >
                    <option value="">Any Language</option>
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="go">Go</option>
                    <option value="rust">Rust</option>
                    <option value="java">Java</option>
                    <option value="kotlin">Kotlin</option>
                    <option value="swift">Swift</option>
                    <option value="ruby">Ruby</option>
                    <option value="php">PHP</option>
                    <option value="c++">C++</option>
                    <option value="c#">C#</option>
                    <option value="scala">Scala</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={githubSearchParams.location}
                    onChange={(e) => setGithubSearchParams({ ...githubSearchParams, location: e.target.value })}
                    placeholder="e.g., San Francisco, New York, Remote"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Keywords (bio search)
                    </label>
                    <div className="flex items-center gap-2">
                      {githubKeywordSource === 'ai' && (
                        <span className="text-xs text-purple-600 flex items-center gap-1">
                          <Brain className="h-3 w-3" />
                          AI Generated
                        </span>
                      )}
                      <button
                        onClick={generateAIGithubKeywords}
                        disabled={isGeneratingGithubKeywords || !customJD.title}
                        className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        title="Generate keywords using Riley's AI"
                      >
                        {isGeneratingGithubKeywords ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3" />
                            AI Generate
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={githubSearchParams.keywords}
                    onChange={(e) => {
                      setGithubSearchParams({ ...githubSearchParams, keywords: e.target.value });
                      setGithubKeywordSource('basic'); // Mark as manually edited
                    }}
                    placeholder="e.g., kubernetes helm argocd istio terraform"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {githubKeywordSource === 'ai'
                      ? 'AI-selected keywords optimized for developer bios'
                      : 'Enter terms developers put in their GitHub bios'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Followers
                    </label>
                    <input
                      type="number"
                      value={githubSearchParams.minFollowers}
                      onChange={(e) => setGithubSearchParams({ ...githubSearchParams, minFollowers: e.target.value })}
                      placeholder="e.g., 50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Repos
                    </label>
                    <input
                      type="number"
                      value={githubSearchParams.minRepos}
                      onChange={(e) => setGithubSearchParams({ ...githubSearchParams, minRepos: e.target.value })}
                      placeholder="e.g., 10"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                    />
                  </div>
                </div>

                <button
                  onClick={searchGitHub}
                  disabled={isSearchingGithub || !githubConfig}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSearchingGithub ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching GitHub...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Search GitHub
                    </>
                  )}
                </button>

                {!githubConfig && (
                  <p className="text-sm text-yellow-600 text-center">
                    Connect GitHub in Settings to search
                  </p>
                )}
              </div>
            </div>

            {/* GitHub Search Tips */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                GitHub Sourcing Tips
              </h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Language filter finds users with repos in that language</li>
                <li>• ~30-40% of profiles have public emails</li>
                <li>• ~70% have emails extractable from commits</li>
                <li>• High follower count often indicates seniority</li>
                <li>• Check hireable status for open candidates</li>
              </ul>
            </div>
          </div>

          {/* Right Panel - GitHub Results */}
          <div className="lg:col-span-2 space-y-4">
            {githubCandidates.length > 0 ? (
              <>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">
                      {filterLinkedInOnly
                        ? `${githubCandidates.filter(c => c.linkedinUrl).length} Developers with LinkedIn`
                        : `${githubCandidates.length} Developers Found`
                      }
                    </h2>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterLinkedInOnly}
                          onChange={(e) => setFilterLinkedInOnly(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Linkedin className="h-4 w-4 text-blue-600" />
                        Only with LinkedIn ({githubCandidates.filter(c => c.linkedinUrl).length})
                      </label>
                      <span className="text-sm text-gray-500">
                        {githubCandidates.filter(c => c.email).length} with emails
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {githubCandidates
                      .filter(candidate => !filterLinkedInOnly || candidate.linkedinUrl)
                      .map((candidate) => {
                      // Calculate score for this candidate - parse keywords (space or comma separated)
                      const allKeywords = githubSearchParams.keywords
                        ? githubSearchParams.keywords.split(/[,\s]+/).map(k => k.trim()).filter(k => k.length > 0)
                        : [];
                      const score = githubCandidateScores.get(candidate.username) ||
                        scoreGitHubCandidate(candidate, allKeywords, githubSearchParams.language);
                      const isExpanded = expandedGithubCandidates.has(candidate.username);

                      return (
                        <div
                          key={candidate.id}
                          className="border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-4">
                              <img
                                src={candidate.avatarUrl}
                                alt={candidate.name || candidate.username}
                                className="w-12 h-12 rounded-full"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <a
                                    href={candidate.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-gray-900 hover:text-blue-600 flex items-center gap-1"
                                  >
                                    {candidate.name || candidate.username}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <span className="text-sm text-gray-500">@{candidate.username}</span>
                                  {candidate.hireable && (
                                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                      Hireable
                                    </span>
                                  )}
                                  {/* Overall Match Score Badge */}
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                    score.overall >= 70 ? 'bg-green-100 text-green-800' :
                                    score.overall >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {score.overall}/100 match
                                  </span>
                                  {/* Chevron Toggle */}
                                  <button
                                    onClick={() => {
                                      setExpandedGithubCandidates(prev => {
                                        const next = new Set(prev);
                                        if (next.has(candidate.username)) {
                                          next.delete(candidate.username);
                                        } else {
                                          next.add(candidate.username);
                                          // Cache the score when expanded
                                          if (!githubCandidateScores.has(candidate.username)) {
                                            setGithubCandidateScores(prev => new Map(prev).set(candidate.username, score));
                                          }
                                        }
                                        return next;
                                      });
                                    }}
                                    className="ml-auto p-1 hover:bg-gray-100 rounded transition-colors"
                                    title={isExpanded ? 'Collapse details' : 'Expand details'}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4 text-gray-500" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-gray-500" />
                                    )}
                                  </button>
                                </div>
                                {candidate.bio && (
                                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{candidate.bio}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                                  {candidate.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {candidate.location}
                                    </span>
                                  )}
                                  {candidate.company && (
                                    <span className="flex items-center gap-1">
                                      <Building className="h-3 w-3" />
                                      {candidate.company}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {candidate.followers} followers
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <GitFork className="h-3 w-3" />
                                    {candidate.publicRepos} repos
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Star className="h-3 w-3" />
                                    {candidate.totalStars} stars
                                  </span>
                                </div>
                                {candidate.topLanguages.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {candidate.topLanguages.slice(0, 5).map((lang) => (
                                      <span
                                        key={lang}
                                        className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded"
                                      >
                                        {lang}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                {candidate.email ? (
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                                      candidate.emailConfidence === 'high' ? 'bg-green-100 text-green-800' :
                                      candidate.emailConfidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {candidate.emailConfidence} confidence
                                    </span>
                                    <a
                                      href={`mailto:${candidate.email}`}
                                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                    >
                                      <Mail className="h-3 w-3" />
                                      {candidate.email}
                                    </a>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => extractEmailForCandidate(candidate.username)}
                                    disabled={extractingEmails.has(candidate.username)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
                                  >
                                    {extractingEmails.has(candidate.username) ? (
                                      <>
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Extracting...
                                      </>
                                    ) : (
                                      <>
                                        <Mail className="h-3 w-3" />
                                        Extract Email
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Expandable Score Details Section */}
                          {isExpanded && (
                            <div className="border-t border-gray-200 bg-gray-50 p-4">
                              {/* LinkedIn Profile Link - shown prominently if available */}
                              {candidate.linkedinUrl && (
                                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <Linkedin className="h-5 w-5 text-blue-600" />
                                    <a
                                      href={candidate.linkedinUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                      View LinkedIn Profile
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                </div>
                              )}

                              <div className="text-sm font-medium text-gray-700 mb-3">
                                Match Breakdown
                              </div>
                              <div className="space-y-3">
                                {/* Technical Fit */}
                                <div>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">Technical Fit</span>
                                    <span className="text-gray-500">{score.technicalFit.score}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        score.technicalFit.score >= 70 ? 'bg-green-500' :
                                        score.technicalFit.score >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                                      }`}
                                      style={{ width: `${score.technicalFit.score}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    {score.technicalFit.reasons.map((reason, i) => (
                                      <div key={i} className="flex items-start gap-1">
                                        {reason.startsWith('Missing') ? (
                                          <XCircle className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                                        ) : (
                                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                        )}
                                        <span>{reason}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Seniority Signals */}
                                <div>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">Seniority Signals</span>
                                    <span className="text-gray-500">{score.senioritySignals.score}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        score.senioritySignals.score >= 70 ? 'bg-green-500' :
                                        score.senioritySignals.score >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                                      }`}
                                      style={{ width: `${score.senioritySignals.score}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    {score.senioritySignals.reasons.map((reason, i) => (
                                      <div key={i} className="flex items-start gap-1">
                                        {reason.includes('newer') ? (
                                          <AlertCircle className="h-3 w-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                                        ) : (
                                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                        )}
                                        <span>{reason}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Keyword Match */}
                                <div>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">Keyword Match</span>
                                    <span className="text-gray-500">
                                      {score.keywordMatch.matchedKeywords.length}/{score.keywordMatch.totalKeywords} ({score.keywordMatch.score}%)
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        score.keywordMatch.score >= 70 ? 'bg-green-500' :
                                        score.keywordMatch.score >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                                      }`}
                                      style={{ width: `${score.keywordMatch.score}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    {score.keywordMatch.matchedKeywords.length > 0 ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {score.keywordMatch.matchedKeywords.map((kw, i) => (
                                          <span key={i} className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                                            ✓ {kw}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">No keyword matches found in bio/company</span>
                                    )}
                                  </div>
                                </div>

                                {/* Contact Quality */}
                                <div>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">Contact Quality</span>
                                    <span className="text-gray-500">{score.contactQuality.score}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${
                                        score.contactQuality.score >= 70 ? 'bg-green-500' :
                                        score.contactQuality.score >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                                      }`}
                                      style={{ width: `${score.contactQuality.score}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    {score.contactQuality.reasons.map((reason, i) => (
                                      <div key={i} className="flex items-start gap-1">
                                        {reason.startsWith('No ') ? (
                                          <XCircle className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                                        ) : (
                                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                        )}
                                        <span>{reason}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <Github className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="font-medium text-gray-900 mb-2">No GitHub Results Yet</h3>
                <p className="text-sm text-gray-500">
                  Configure your search parameters and click "Search GitHub" to find developers
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* LINKEDIN SOURCING UI */}
      {/* ============================================================ */}
      {searchSource === 'linkedin' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Search Configuration */}
        <div className="lg:col-span-1 space-y-4">
          {/* Job Description Input */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title
                </label>
                <input
                  type="text"
                  value={customJD.title}
                  onChange={(e) => setCustomJD({ ...customJD, title: e.target.value })}
                  placeholder="e.g., Senior Software Engineer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name (Internal Only)
                </label>
                <input
                  type="text"
                  value={customJD.companyName}
                  onChange={(e) => setCustomJD({ ...customJD, companyName: e.target.value })}
                  placeholder="e.g., Acme Corp (not visible to candidates)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  For internal tracking only - candidates will NOT see this in assessments.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                  {isAutoParsingSkills && (
                    <span className="ml-2 text-xs text-blue-600 font-normal inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing for skills...
                    </span>
                  )}
                </label>
                <textarea
                  value={customJD.description}
                  onChange={(e) => setCustomJD({ ...customJD, description: e.target.value })}
                  onPaste={handleDescriptionPaste}
                  placeholder="Paste job description here to auto-extract skills..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Required Skills (comma-separated)
                  {skillsAutoPopulated && (
                    <span className="ml-2 text-xs text-green-600 font-normal inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Auto-populated from JD
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={customJD.skills}
                  onChange={(e) => {
                    setCustomJD({ ...customJD, skills: e.target.value });
                    setSkillsAutoPopulated(false); // Clear indicator when user manually edits
                  }}
                  placeholder="e.g., Python, React, AWS"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    skillsAutoPopulated ? 'border-green-400 bg-green-50' : 'border-gray-300'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Location
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="Restrict search to United States only (default - uncheck for international)">
                      <input
                        type="checkbox"
                        checked={customJD.usOnlySearch}
                        onChange={(e) => setCustomJD({ ...customJD, usOnlySearch: e.target.checked })}
                        className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                      />
                      <MapPin className="h-3.5 w-3.5 text-red-600" />
                      <span className="text-gray-600">US Only</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customJD.isFullyRemote}
                        onChange={(e) => setCustomJD({ ...customJD, isFullyRemote: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <Globe className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-gray-600">Fully Remote</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer" title="Prioritize candidates with contract/freelance experience in scoring">
                      <input
                        type="checkbox"
                        checked={customJD.isContractRole}
                        onChange={(e) => setCustomJD({ ...customJD, isContractRole: e.target.checked })}
                        className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                      />
                      <Briefcase className="h-3.5 w-3.5 text-orange-600" />
                      <span className="text-gray-600">Contract Role</span>
                    </label>
                  </div>
                </div>
                <input
                  type="text"
                  value={customJD.location}
                  onChange={(e) => setCustomJD({ ...customJD, location: e.target.value })}
                  placeholder={customJD.isFullyRemote ? "Location not required for remote roles" : (customJD.usOnlySearch ? "e.g., San Francisco, CA (US search)" : "e.g., London, UK")}
                  disabled={customJD.isFullyRemote}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    customJD.isFullyRemote ? 'bg-gray-50 text-gray-400' : ''
                  }`}
                />
              </div>

              {/* Job Intake Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="flex items-center gap-1.5">
                    <MessageSquareText className="h-4 w-4 text-amber-600" />
                    Intake Notes
                    <span className="text-xs font-normal text-amber-600">(from HM call - overrides JD)</span>
                  </span>
                </label>
                <textarea
                  value={customJD.intakeNotes}
                  onChange={(e) => setCustomJD({ ...customJD, intakeNotes: e.target.value })}
                  placeholder="Notes from hiring manager conversation that clarify or override the JD. e.g., 'Actually looking for someone more senior than the JD suggests, ideally with startup experience. Must be strong in system design.'"
                  rows={3}
                  className="w-full px-3 py-2 border border-amber-200 bg-amber-50/50 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  These notes take precedence over the job description when there&apos;s a conflict.
                </p>
              </div>

              {/* Company/Culture Fit Section */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-indigo-600" />
                  Company &amp; Culture Fit
                </h3>

                {/* Target Industries */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Industries
                    <span className="text-xs font-normal text-gray-500 ml-1">(prioritize candidates from these)</span>
                  </label>
                  <input
                    type="text"
                    value={customJD.targetIndustries}
                    onChange={(e) => setCustomJD({ ...customJD, targetIndustries: e.target.value })}
                    placeholder="e.g., fintech, insurance, banking, healthcare"
                    className="w-full px-3 py-2 border border-indigo-200 bg-indigo-50/30 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    AI will boost candidates with experience in similar industries.
                  </p>
                </div>

                {/* Exclude Companies */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Exclude Companies
                    <span className="text-xs font-normal text-gray-500 ml-1">(deprioritize candidates from these)</span>
                  </label>
                  <input
                    type="text"
                    value={customJD.excludeCompanies}
                    onChange={(e) => setCustomJD({ ...customJD, excludeCompanies: e.target.value })}
                    placeholder="e.g., Google, Amazon, Meta, Netflix, Airbnb"
                    className="w-full px-3 py-2 border border-red-200 bg-red-50/30 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    For legacy/enterprise roles, exclude big tech where comp/culture won&apos;t match.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Results
                </label>
                <select
                  value={maxResults}
                  onChange={(e) => setMaxResults(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>

              <button
                onClick={parseJobDescription}
                disabled={isParsing || !customJD.title}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isParsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isParsing ? 'Parsing...' : 'Parse with AI'}
              </button>
            </div>
          </div>

          {/* AI Search Strategy Preview */}
          {parsedCriteria && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-600" />
                  AI Search Strategy
                </h3>
                {searchStrategy && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                    {searchStrategy.seniorityLevel}
                  </span>
                )}
              </div>

              <div className="space-y-3 text-sm">
                {/* Seniority & Experience */}
                {searchStrategy && (
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <p className="text-xs text-purple-800 font-medium">
                      {searchStrategy.levelRationale}
                    </p>
                    <p className="text-xs text-purple-700 mt-1">
                      Min {searchStrategy.minYearsExperience}+ years total, {searchStrategy.minYearsAtLevel}+ at level
                    </p>
                  </div>
                )}

                {/* Primary Titles */}
                <div>
                  <span className="text-gray-500 text-xs font-medium">Primary Titles:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(searchStrategy?.primaryTitles || parsedCriteria.titles.slice(0, 2)).map((t, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Title Variants */}
                {searchStrategy?.titleVariants && searchStrategy.titleVariants.length > 0 && (
                  <div>
                    <span className="text-gray-500 text-xs font-medium">Also search:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchStrategy.titleVariants.slice(0, 5).map((t, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                        >
                          {t}
                        </span>
                      ))}
                      {searchStrategy.titleVariants.length > 5 && (
                        <span className="px-2 py-0.5 text-gray-500 text-xs">
                          +{searchStrategy.titleVariants.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Exclude Titles */}
                {searchStrategy?.excludeTitles && searchStrategy.excludeTitles.length > 0 && (
                  <div>
                    <span className="text-gray-500 text-xs font-medium">Exclude:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchStrategy.excludeTitles.slice(0, 4).map((t, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs line-through"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required Skills */}
                <div>
                  <span className="text-gray-500 text-xs font-medium">Must-have Skills:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(searchStrategy?.mustHaveSkills || parsedCriteria.requiredSkills).map((s, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Nice-to-have Skills */}
                {searchStrategy?.niceToHaveSkills && searchStrategy.niceToHaveSkills.length > 0 && (
                  <div>
                    <span className="text-gray-500 text-xs font-medium">Nice-to-have:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchStrategy.niceToHaveSkills.slice(0, 5).map((s, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leadership Signals */}
                {searchStrategy?.leadershipIndicators && searchStrategy.leadershipIndicators.length > 0 && (
                  <div>
                    <span className="text-gray-500 text-xs font-medium">Look for:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchStrategy.leadershipIndicators.slice(0, 4).map((s, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-yellow-50 text-yellow-800 rounded text-xs"
                        >
                          &quot;{s}&quot;
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Red Flags */}
                {searchStrategy?.redFlags && searchStrategy.redFlags.length > 0 && (
                  <div>
                    <span className="text-gray-500 text-xs font-medium">Red flags:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchStrategy.redFlags.slice(0, 4).map((s, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs flex items-center gap-1"
                        >
                          <AlertCircle className="h-3 w-3" />
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* LinkedIn Search Queries */}
                {searchStrategy?.searchQueries && searchStrategy.searchQueries.length > 0 && (
                  <div className="border-t border-gray-100 pt-3 mt-3">
                    <span className="text-gray-500 text-xs font-medium flex items-center gap-1 mb-2">
                      <Search className="h-3 w-3" />
                      Recommended Search Queries:
                    </span>
                    <div className="space-y-2">
                      {searchStrategy.searchQueries.slice(0, 3).map((sq, i) => (
                        <div
                          key={i}
                          className="p-2 bg-blue-50 rounded-lg border border-blue-200"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-blue-800">
                              {sq.api.toUpperCase()} API
                            </span>
                            <span className="text-xs text-gray-500">
                              Priority {sq.priority} • {sq.expectedYield}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-blue-900 break-all">
                            {sq.query}
                          </p>
                          {sq.rationale && (
                            <p className="text-xs text-gray-600 mt-1 italic">
                              {sq.rationale}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Reasoning */}
                {searchStrategy?.reasoning && (
                  <div className="p-2 bg-gray-50 rounded-lg border-l-2 border-purple-400">
                    <p className="text-xs text-gray-700 italic">
                      {searchStrategy.reasoning}
                    </p>
                  </div>
                )}

                {/* Confidence */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <span className="text-gray-500 text-xs">Confidence:</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full">
                    <div
                      className={`h-2 rounded-full ${
                        parsedCriteria.confidence >= 0.8 ? 'bg-green-500' :
                        parsedCriteria.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${parsedCriteria.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600">
                    {Math.round(parsedCriteria.confidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Boolean Query Editor */}
              <div className="mt-4">
                <BooleanQueryEditor
                  initialQuery={parsedCriteria.booleanQuery || ''}
                  onQueryChange={(query) => setEditableBooleanQuery(query)}
                  onValidationChange={(isValid) => setIsBooleanQueryValid(isValid)}
                  apiType="classic"
                  compact={true}
                  titleVariants={searchStrategy?.primaryTitles || parsedCriteria.titles}
                  skills={parsedCriteria.requiredSkills}
                  excludeTerms={searchStrategy?.excludeTitles}
                />
              </div>

              <button
                onClick={startSearch}
                disabled={isSearching || !unipileConfig || !isBooleanQueryValid}
                className={`w-full mt-4 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  unipileConfig ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Linkedin className="h-4 w-4" />
                )}
                {isSearching
                  ? 'Searching LinkedIn...'
                  : unipileConfig
                  ? 'Search LinkedIn'
                  : 'LinkedIn Not Connected'}
              </button>
              {!unipileConfig && (
                <p className="text-xs text-amber-600 mt-2 text-center font-medium">
                  <a href="/settings" className="text-blue-600 hover:underline">
                    Connect LinkedIn in Settings
                  </a>{' '}
                  to search for candidates
                </p>
              )}
            </div>
          )}

          {/* Last Search Query Display */}
          {lastSearchQuery && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-600" />
                  Last Search Query
                </h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {lastSearchQuery.api}
                </span>
              </div>

              <div className="space-y-3 text-sm">
                {/* Keywords */}
                <div>
                  <span className="text-gray-500 text-xs font-medium">Keywords:</span>
                  <div className="mt-1 p-2 bg-gray-50 rounded-lg font-mono text-xs break-all">
                    {lastSearchQuery.keywords || '(none)'}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <span className="text-gray-500 text-xs font-medium">Location:</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      lastSearchQuery.locationId
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {lastSearchQuery.location || '(not specified)'}
                    </span>
                    {lastSearchQuery.locationId ? (
                      <span className="text-xs text-gray-500">
                        ID: {lastSearchQuery.locationId}
                      </span>
                    ) : lastSearchQuery.location && (
                      <span className="text-xs text-yellow-600">
                        ⚠ No ID resolved
                      </span>
                    )}
                  </div>
                </div>

                {/* Boolean Query for LinkedIn */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs font-medium">LinkedIn Boolean Query:</span>
                    <button
                      onClick={() => {
                        const booleanQuery = `${lastSearchQuery.keywords}${lastSearchQuery.location ? ` location:"${lastSearchQuery.location}"` : ''}`;
                        navigator.clipboard.writeText(booleanQuery);
                        setCopiedQuery(true);
                        setTimeout(() => setCopiedQuery(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      {copiedQuery ? (
                        <>
                          <Check className="h-3 w-3" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-1 p-2 bg-blue-50 rounded-lg font-mono text-xs break-all border border-blue-200">
                    {lastSearchQuery.keywords}
                    {lastSearchQuery.location && (
                      <span className="text-blue-600"> location:&quot;{lastSearchQuery.location}&quot;</span>
                    )}
                  </div>
                </div>

                {/* API Confirmed Location */}
                {lastSearchQuery.confirmedParams && (
                  <div>
                    <span className="text-gray-500 text-xs font-medium">API Confirmed Location:</span>
                    <div className="mt-1 flex items-center gap-2">
                      {lastSearchQuery.confirmedParams.location ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          ✓ Location filter applied: {JSON.stringify(lastSearchQuery.confirmedParams.location)}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                          ✗ Location filter NOT applied by API
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Full API Request (collapsible for debugging) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                    View full API request body (what we sent)
                  </summary>
                  <pre className="mt-2 p-2 bg-gray-100 rounded-lg overflow-x-auto text-[10px]">
                    {JSON.stringify(lastSearchQuery.fullBody, null, 2)}
                  </pre>
                </details>

                {/* Confirmed params from API response */}
                {lastSearchQuery.confirmedParams && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                      View API confirmed params (what Unipile used)
                    </summary>
                    <pre className="mt-2 p-2 bg-blue-50 rounded-lg overflow-x-auto text-[10px] border border-blue-200">
                      {JSON.stringify(lastSearchQuery.confirmedParams, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="lg:col-span-2">
          {/* Search Progress */}
          {searchRun && searchRun.status !== 'completed' && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">
                  {searchRun.status === 'queued' ? 'Starting search...' : 'Searching LinkedIn...'}
                </span>
                <span className="text-sm text-gray-500">{searchRun.progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full">
                <div
                  className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${searchRun.progress}%` }}
                />
              </div>
              {searchRun.totalFound > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  Found {searchRun.totalFound} candidates so far...
                </p>
              )}
            </div>
          )}

          {/* Sourcing Score Summary (new 3-pillar system) */}
          {searchRun?.sourcingScoreSummary && (
            <BatchSourcingSummaryCard
              summary={searchRun.sourcingScoreSummary}
              aiPowered={searchRun.sourcingAiPowered ?? false}
            />
          )}

          {/* Legacy AI Scoring Summary (backwards compatibility) */}
          {searchRun?.aiScoringSummary && !searchRun?.sourcingScoreSummary && (
            <BatchScoringSummaryCard summary={searchRun.aiScoringSummary} />
          )}

          {/* Warning for demo/cached results */}
          {searchRun && hasDemoResults && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-yellow-800">
                  {candidatesWithoutProviderId === searchRun.candidates.length
                    ? 'All candidates are from cached/demo data'
                    : `${candidatesWithoutProviderId} candidate${candidatesWithoutProviderId > 1 ? 's are' : ' is'} from cached/demo data`}
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  These candidates are missing LinkedIn IDs and cannot be messaged.
                  {unipileConfig
                    ? ' Clear these results and run a new search to get real LinkedIn profiles.'
                    : ' Connect LinkedIn in Settings first, then run a new search.'}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={clearSearchResults}
                    className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-lg text-sm hover:bg-yellow-200"
                  >
                    Clear Results
                  </button>
                  {!unipileConfig && (
                    <a
                      href="/settings"
                      className="px-3 py-1.5 border border-yellow-300 text-yellow-800 rounded-lg text-sm hover:bg-yellow-100"
                    >
                      Connect LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {searchRun?.candidates && searchRun.candidates.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Found {searchRun.totalFound} Candidates
                  </h3>
                  {searchApiUsed && (
                    <p className="text-xs text-gray-500">
                      via {searchApiUsed === 'recruiter' ? 'LinkedIn Recruiter' :
                           searchApiUsed === 'sales_navigator' ? 'Sales Navigator' : 'LinkedIn Classic'}
                    </p>
                  )}
                  {!searchApiUsed && hasDemoResults && (
                    <p className="text-xs text-yellow-600">
                      Cached/demo results - run a new search for real LinkedIn profiles
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* AI Scoring Toggle */}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiScoringEnabled}
                      onChange={(e) => setAiScoringEnabled(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    />
                    <Brain className="h-4 w-4 text-purple-600" />
                    <span className="text-gray-700">AI Scoring</span>
                  </label>

                  {/* Auto Company Research Toggle */}
                  <label className="flex items-center gap-2 text-sm cursor-pointer" title="Automatically research company data for all candidates">
                    <input
                      type="checkbox"
                      checked={autoResearchEnabled}
                      onChange={(e) => setAutoResearchEnabled(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span className="text-gray-700">Auto-Research</span>
                  </label>

                  {/* Enrich Profiles Button - Fetch full profile data and re-score */}
                  {searchRun.status === 'completed' && searchRun.candidates.some(c => !c.isProfileEnriched && c.providerId) && (
                    <button
                      onClick={() => enrichAllProfiles(searchRun.candidates, true)}
                      disabled={isEnrichingProfiles || isAiScoring}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
                      title="Fetch full LinkedIn profiles (About, work history, skills) and re-run AI scoring"
                    >
                      {isEnrichingProfiles ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )}
                      {isEnrichingProfiles ? 'Enriching & Scoring...' : 'Enrich & Re-Score'}
                    </button>
                  )}

                  {/* Manual Score Button */}
                  {!searchRun.sourcingScoreSummary && !searchRun.aiScoringSummary && searchRun.status === 'completed' && (
                    <button
                      onClick={() => runAiScoring()}
                      disabled={isAiScoring || isEnrichingProfiles}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
                    >
                      {isAiScoring ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Brain className="h-3.5 w-3.5" />
                      )}
                      {isAiScoring ? 'Scoring...' : 'Score with AI'}
                    </button>
                  )}

                  {/* Re-score Button - Appears after initial scoring when profiles have been enriched */}
                  {searchRun.sourcingScoreSummary && searchRun.candidates.some(c => c.isProfileEnriched) && (
                    <button
                      onClick={() => runAiScoring()}
                      disabled={isAiScoring || isEnrichingProfiles}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
                      title="Re-run AI scoring with enriched profile data"
                    >
                      {isAiScoring ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {isAiScoring ? 'Re-scoring...' : 'Re-Score'}
                    </button>
                  )}

                  {searchRun.status === 'completed' && (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      Complete
                    </span>
                  )}

                  {/* Copy URLs Button */}
                  <button
                    onClick={() => {
                      const urls = searchRun.candidates
                        .map(c => c.profileUrl)
                        .filter(url => url && !url.includes('/unknown'))
                        .join('\n');
                      navigator.clipboard.writeText(urls);
                      setCopiedUrls(true);
                      setTimeout(() => setCopiedUrls(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    title={`Copy ${searchRun.candidates.length} LinkedIn profile URLs to clipboard`}
                  >
                    {copiedUrls ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy URLs
                      </>
                    )}
                  </button>

                  {/* Clear Results Button */}
                  <button
                    onClick={clearSearchResults}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Clear search results"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                </div>
              </div>

              {/* Profile Enrichment Progress */}
              {isEnrichingProfiles && (
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-blue-700">
                    Fetching full LinkedIn profiles (About section, work history, skills)...
                  </span>
                </div>
              )}

              {/* AI Scoring Progress */}
              {isAiScoring && (
                <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  <span className="text-sm text-purple-700">
                    AI is analyzing candidates using 4-pillar scoring (Role, Scope, Technical, Location)...
                  </span>
                </div>
              )}

              {/* Score Filter Tabs - support both new and legacy scoring */}
              {(searchRun.sourcingScoreSummary || searchRun.aiScoringSummary) && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                  <span className="text-xs text-gray-500 mr-2">Filter:</span>
                  {(['all', 'qualified', 'borderline', 'unqualified'] as const).map(filter => {
                    // Calculate count based on new sourcing summary or legacy
                    const sourcingSummary = searchRun.sourcingScoreSummary;
                    const legacySummary = searchRun.aiScoringSummary;

                    let count: number;
                    if (filter === 'all') {
                      count = searchRun.candidates.length;
                    } else if (filter === 'qualified') {
                      count = sourcingSummary
                        ? (sourcingSummary.strongYes + sourcingSummary.yes)
                        : (legacySummary?.qualified ?? 0);
                    } else if (filter === 'borderline') {
                      count = sourcingSummary?.maybe ?? legacySummary?.borderline ?? 0;
                    } else {
                      count = sourcingSummary?.no ?? legacySummary?.unqualified ?? 0;
                    }

                    return (
                      <button
                        key={filter}
                        onClick={() => setFilterByScore(filter)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                          filterByScore === filter
                            ? filter === 'qualified' ? 'bg-green-600 text-white' :
                              filter === 'borderline' ? 'bg-yellow-500 text-white' :
                              filter === 'unqualified' ? 'bg-red-500 text-white' :
                              'bg-gray-700 text-white'
                            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Batch Actions Bar */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCandidates.size === getFilteredCandidates().filter(c => c.status === 'new').length && selectedCandidates.size > 0}
                    onChange={() => {
                      const filteredNew = getFilteredCandidates().filter(c => c.status === 'new');
                      if (selectedCandidates.size === filteredNew.length) {
                        setSelectedCandidates(new Set());
                      } else {
                        setSelectedCandidates(new Set(filteredNew.map(c => c.id)));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Select All ({getFilteredCandidates().filter(c => c.status === 'new').length} available)
                  </span>
                </label>
                {selectedCandidates.size > 0 && (
                  <button
                    onClick={() => {
                      const selected = getFilteredCandidates().filter(c => selectedCandidates.has(c.id));
                      addToQueue(selected);
                    }}
                    disabled={addingToQueue}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {addingToQueue ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                    Add {selectedCandidates.size} to Queue
                  </button>
                )}
              </div>

              <div className="divide-y divide-gray-100">
                {getFilteredCandidates().map((candidate) => (
                  <div
                    key={candidate.id}
                    className={`transition-colors ${
                      candidate.status === 'queued' ? 'bg-blue-50' :
                      selectedCandidates.has(candidate.id) ? 'bg-blue-25' :
                      'hover:bg-gray-50'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {/* Selection checkbox */}
                          <div className="pt-1">
                            {candidate.status === 'new' ? (
                              <input
                                type="checkbox"
                                checked={selectedCandidates.has(candidate.id)}
                                onChange={() => toggleCandidateSelection(candidate.id)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                              />
                            ) : (
                              <span className="flex items-center justify-center w-4 h-4 text-blue-600">
                                <CheckCircle className="h-4 w-4" />
                              </span>
                            )}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium overflow-hidden">
                            {candidate.profilePictureUrl ? (
                              <img
                                src={candidate.profilePictureUrl}
                                alt={candidate.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              candidate.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">{candidate.name}</h4>
                              <a
                                href={candidate.profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {candidate.status === 'queued' && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                                  In Queue
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{candidate.headline}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                              {candidate.currentCompany && (
                                <span className="flex items-center gap-1">
                                  <Building className="h-3 w-3" />
                                  {candidate.currentCompany}
                                  {/* Show enriched company data */}
                                  {companyData.has(candidate.currentCompany.toLowerCase()) && (
                                    <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">
                                      {companyData.get(candidate.currentCompany.toLowerCase())?.headcountRange || 'Unknown size'}
                                      {companyData.get(candidate.currentCompany.toLowerCase())?.industry && (
                                        <> • {companyData.get(candidate.currentCompany.toLowerCase())?.industry}</>
                                      )}
                                    </span>
                                  )}
                                  {/* Show enriched badge if score was enriched */}
                                  {candidate.sourcingScore?.companyEnriched && (
                                    <span className="ml-1 flex items-center gap-0.5 px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]" title="Company data enriched">
                                      <Building2 className="h-2.5 w-2.5" />
                                      Co.
                                    </span>
                                  )}
                                  {/* Show profile enriched badge */}
                                  {candidate.isProfileEnriched && (
                                    <span className="ml-1 flex items-center gap-0.5 px-1 py-0.5 bg-green-100 text-green-700 rounded text-[10px]" title="Full profile data loaded (About, Experience, Skills)">
                                      <User className="h-2.5 w-2.5" />
                                      Profile
                                    </span>
                                  )}
                                </span>
                              )}
                              {candidate.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {candidate.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Sourcing Score Badge (new 3-pillar) - prioritize over legacy */}
                          {candidate.sourcingScore ? (
                            <div className="flex items-center gap-2">
                              <SourcingScoreCard
                                score={candidate.sourcingScore}
                                candidateName={candidate.name}
                                compact={true}
                              />
                              <button
                                onClick={() => toggleScoreDetails(candidate.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Toggle score details"
                              >
                                {showScoreDetails.has(candidate.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          ) : candidate.aiScore ? (
                            <div className="flex items-center gap-2">
                              <CandidateScoreCard
                                score={candidate.aiScore}
                                candidateName={candidate.name}
                                compact={true}
                              />
                              <button
                                onClick={() => toggleScoreDetails(candidate.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Toggle AI score details"
                              >
                                {showScoreDetails.has(candidate.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="text-right">
                              <div
                                className={`px-2 py-1 rounded text-xs font-medium ${getScoreBadgeColor(
                                  candidate.relevanceScore
                                )}`}
                              >
                                {candidate.relevanceScore}% match
                              </div>
                            </div>
                          )}
                          {/* Company Research Button - visible next to score */}
                          {unipileConfig && !candidate.sourcingScore?.companyEnriched && (
                            <button
                              onClick={() => researchCompany(candidate.id)}
                              disabled={researchingCompanies.has(candidate.id)}
                              className="flex items-center gap-1.5 px-2 py-1.5 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 border border-blue-200"
                              title="Research company size & industry to improve scoring accuracy"
                            >
                              {researchingCompanies.has(candidate.id) ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-xs font-medium">Researching...</span>
                                </>
                              ) : (
                                <>
                                  <Building2 className="h-4 w-4" />
                                  <span className="text-xs font-medium">Research Co.</span>
                                </>
                              )}
                            </button>
                          )}
                          {candidate.status === 'new' && (
                            <button
                              onClick={() => addToQueue([candidate])}
                              disabled={addingToQueue}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              title="Add to messaging queue"
                            >
                              <Clock className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Score Details - support both new and legacy */}
                    {candidate.sourcingScore && showScoreDetails.has(candidate.id) && (
                      <div className="px-4 pb-4 border-t border-gray-100 pt-3 bg-gray-50">
                        <SourcingScoreCard
                          score={candidate.sourcingScore}
                          candidateName={candidate.name}
                          showDetails={true}
                        />
                      </div>
                    )}
                    {candidate.aiScore && !candidate.sourcingScore && showScoreDetails.has(candidate.id) && (
                      <div className="px-4 pb-4 border-t border-gray-100 pt-3 bg-gray-50">
                        <CandidateScoreCard
                          score={candidate.aiScore}
                          candidateName={candidate.name}
                          showDetails={true}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!searchRun && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Ready to Source Candidates
              </h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Enter a job title and description, then click &quot;Parse with AI&quot; to generate
                optimized search criteria. Once ready, start the LinkedIn search to find
                matching candidates.
              </p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Location Clarification Modal */}
      {showLocationModal && locationChoices.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-600" />
                Multiple Locations Detected
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                We found multiple locations in the job description. Which one is the primary job location?
              </p>
            </div>
            <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
              {locationChoices.map((location, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCustomJD(prev => ({ ...prev, location }));
                    setShowLocationModal(false);
                    setLocationChoices([]);
                  }}
                  className="w-full px-4 py-3 text-left rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center gap-3"
                >
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{location}</span>
                </button>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowLocationModal(false);
                  setLocationChoices([]);
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  // Use the first location as default
                  setCustomJD(prev => ({ ...prev, location: locationChoices[0] }));
                  setShowLocationModal(false);
                  setLocationChoices([]);
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Use First ({locationChoices[0]})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
