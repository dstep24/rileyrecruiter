'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Check,
  Copy,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
  Sparkles,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// TYPES
// =============================================================================

interface ValidationError {
  type: string;
  message: string;
  position?: number;
}

interface ValidationWarning {
  type: string;
  message: string;
  suggestion?: string;
}

interface QueryStats {
  length: number;
  termCount: number;
  operatorCount: { AND: number; OR: number; NOT: number };
  parenDepth: number;
  quotedPhrases: number;
  estimatedApiType: 'classic' | 'sales_navigator' | 'recruiter';
}

interface ValidationResult {
  isValid: boolean;
  sanitizedQuery: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: QueryStats;
}

interface Interpretation {
  include: string[];
  exclude: string[];
}

interface PatternLabel {
  value: string;
  label: string;
}

interface BooleanQueryEditorProps {
  initialQuery: string;
  onQueryChange: (query: string) => void;
  apiType?: 'classic' | 'sales_navigator' | 'recruiter';
  titleVariants?: string[];
  skills?: string[];
  excludeTerms?: string[];
  onValidationChange?: (isValid: boolean) => void;
  compact?: boolean;
}

// =============================================================================
// API LIMITS
// =============================================================================

const API_LIMITS: Record<string, number> = {
  classic: 150,
  sales_navigator: 500,
  recruiter: 1000,
};

// =============================================================================
// CLIENT-SIDE VALIDATION (Fallback when API unavailable)
// =============================================================================

function clientSideValidate(query: string, apiType: string = 'classic'): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for empty query
  if (!query.trim()) {
    errors.push({ type: 'EMPTY_QUERY', message: 'Query cannot be empty' });
  }

  // Check balanced parentheses
  let parenBalance = 0;
  for (const char of query) {
    if (char === '(') parenBalance++;
    if (char === ')') parenBalance--;
    if (parenBalance < 0) break;
  }
  if (parenBalance !== 0) {
    errors.push({
      type: 'UNBALANCED_PARENS',
      message: parenBalance > 0
        ? `Missing ${parenBalance} closing parenthesis`
        : `Missing ${-parenBalance} opening parenthesis`,
    });
  }

  // Check balanced quotes
  const quoteCount = (query.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    errors.push({ type: 'UNBALANCED_QUOTES', message: 'Unmatched quote detected' });
  }

  // Check for consecutive operators
  if (/\b(AND|OR|NOT)\s+(AND|OR|NOT)\b/i.test(query)) {
    errors.push({ type: 'CONSECUTIVE_OPERATORS', message: 'Consecutive operators detected' });
  }

  // Check for empty groups
  if (/\(\s*\)/.test(query)) {
    errors.push({ type: 'EMPTY_GROUP', message: 'Empty parentheses group detected' });
  }

  // Warn about query length
  const maxLength = API_LIMITS[apiType] || 150;
  if (query.length > maxLength) {
    warnings.push({
      type: 'QUERY_TOO_LONG',
      message: `Query exceeds ${maxLength} chars for ${apiType} API`,
      suggestion: 'Consider removing less important terms',
    });
  }

  // Calculate stats
  const stats: QueryStats = {
    length: query.length,
    termCount: query.split(/\s+/).filter(t => !['AND', 'OR', 'NOT', '(', ')'].includes(t.toUpperCase())).length,
    operatorCount: {
      AND: (query.match(/\bAND\b/gi) || []).length,
      OR: (query.match(/\bOR\b/gi) || []).length,
      NOT: (query.match(/\bNOT\b/gi) || []).length,
    },
    parenDepth: Math.max(...query.split('').reduce((depths: number[], char) => {
      const last = depths.length > 0 ? depths[depths.length - 1] : 0;
      if (char === '(') depths.push(last + 1);
      else if (char === ')') depths.push(Math.max(0, last - 1));
      else depths.push(last);
      return depths;
    }, [0])),
    quotedPhrases: (query.match(/"[^"]+"/g) || []).length,
    estimatedApiType: query.length <= 150 ? 'classic' : query.length <= 500 ? 'sales_navigator' : 'recruiter',
  };

  return {
    isValid: errors.length === 0,
    sanitizedQuery: query.replace(/\s+/g, ' ').trim(),
    errors,
    warnings,
    stats,
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BooleanQueryEditor({
  initialQuery,
  onQueryChange,
  apiType = 'classic',
  titleVariants = [],
  skills = [],
  excludeTerms = [],
  onValidationChange,
  compact = false,
}: BooleanQueryEditorProps) {
  const [query, setQuery] = useState(initialQuery);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [patterns, setPatterns] = useState<{
    titles: { labels: PatternLabel[]; values: Record<string, string[]> };
    skills: { labels: PatternLabel[]; values: Record<string, string[]> };
    exclusions: { labels: PatternLabel[]; values: Record<string, string[]> };
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with initial query when it changes
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Debounced validation - with client-side fallback when API is unavailable
  const validateQuery = useCallback(async (q: string) => {
    if (!q.trim()) {
      setValidation(null);
      setInterpretation(null);
      onValidationChange?.(false);
      return;
    }

    setIsValidating(true);
    try {
      // Call validation endpoint
      const response = await fetch(`${API_BASE}/api/demo/validate-boolean-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, apiType }),
      });

      if (!response.ok) {
        // Fall back to client-side validation
        console.warn('Server validation unavailable, using client-side validation');
        const clientValidation = clientSideValidate(q, apiType);
        setValidation(clientValidation);
        onValidationChange?.(clientValidation.isValid);
        return;
      }

      const result = await response.json();
      setValidation(result);
      onValidationChange?.(result.isValid);

      // Get interpretation
      const interpResponse = await fetch(`${API_BASE}/api/demo/interpret-boolean-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      if (interpResponse.ok) {
        const interpResult = await interpResponse.json();
        setInterpretation(interpResult.interpretation);
      }
    } catch (error) {
      console.error('Validation error:', error);
      // Fall back to client-side validation on network error
      const clientValidation = clientSideValidate(q, apiType);
      setValidation(clientValidation);
      onValidationChange?.(clientValidation.isValid);
    } finally {
      setIsValidating(false);
    }
  }, [apiType, onValidationChange]);

  // Debounce query changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      validateQuery(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, validateQuery]);

  // Load patterns on mount
  useEffect(() => {
    const loadPatterns = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/demo/boolean-patterns`);
        if (response.ok) {
          const result = await response.json();
          setPatterns(result.patterns);
        }
      } catch (error) {
        console.error('Failed to load patterns:', error);
      }
    };
    loadPatterns();
  }, []);

  // Handle query change
  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    onQueryChange(newQuery);
  };

  // Insert text at cursor position
  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = query.substring(0, start);
    const after = query.substring(end);

    // Add space if needed
    const needsSpaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('(');
    const needsSpaceAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith(')');

    const newQuery = `${before}${needsSpaceBefore ? ' ' : ''}${text}${needsSpaceAfter ? ' ' : ''}${after}`;
    handleQueryChange(newQuery);

    // Restore cursor position
    setTimeout(() => {
      const newPos = start + (needsSpaceBefore ? 1 : 0) + text.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset to initial query
  const handleReset = () => {
    setQuery(initialQuery);
    onQueryChange(initialQuery);
  };

  // Insert pattern group
  const insertPatternGroup = (patternTerms: string[], operator: 'OR' | 'AND' = 'OR') => {
    const group = `(${patternTerms.join(` ${operator} `)})`;
    insertAtCursor(group);
  };

  // Get character count color
  const getCharCountColor = () => {
    const limit = API_LIMITS[apiType];
    const ratio = query.length / limit;
    if (ratio > 1) return 'text-red-600';
    if (ratio > 0.9) return 'text-yellow-600';
    return 'text-gray-500';
  };

  // Render validation status
  const renderValidationStatus = () => {
    if (isValidating) {
      return (
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-xs">Validating...</span>
        </div>
      );
    }

    if (!validation) return null;

    if (validation.isValid && validation.warnings.length === 0) {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-xs font-medium">Valid query</span>
        </div>
      );
    }

    if (validation.isValid && validation.warnings.length > 0) {
      return (
        <div className="flex items-center gap-2 text-yellow-600">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs font-medium">{validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertCircle className="h-4 w-4" />
        <span className="text-xs font-medium">{validation.errors.length} error{validation.errors.length > 1 ? 's' : ''}</span>
      </div>
    );
  };

  // Compact view
  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 text-xs font-medium">LinkedIn Boolean Query:</span>
          <div className="flex items-center gap-2">
            {renderValidationStatus()}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className={`w-full p-2 bg-blue-50 rounded-lg font-mono text-xs border transition-colors resize-none ${
              validation?.isValid === false ? 'border-red-300 bg-red-50' :
              validation?.warnings?.length ? 'border-yellow-300' : 'border-blue-200'
            }`}
            rows={2}
            placeholder="Enter Boolean search query..."
          />
          <div className={`absolute right-2 bottom-2 text-[10px] ${getCharCountColor()}`}>
            {query.length}/{API_LIMITS[apiType]}
          </div>
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="font-medium text-gray-900 text-sm">Boolean Search Query</span>
        </div>
        <div className="flex items-center gap-2">
          {renderValidationStatus()}
          <button
            onClick={handleReset}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Reset to AI-generated"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="p-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className={`w-full p-3 bg-gray-50 rounded-lg font-mono text-sm border-2 transition-colors resize-none min-h-[80px] ${
              validation?.isValid === false ? 'border-red-300 bg-red-50' :
              validation?.warnings?.length ? 'border-yellow-200' : 'border-gray-200 focus:border-blue-400'
            }`}
            placeholder='e.g., ("Director of Engineering" OR "VP Engineering") AND (TypeScript OR React) NOT (Sales)'
            rows={3}
          />
          <div className={`absolute right-3 bottom-3 text-xs ${getCharCountColor()}`}>
            {query.length}/{API_LIMITS[apiType]} chars
          </div>
        </div>

        {/* Quick Insert Buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center mr-1">Insert:</span>
          <button
            onClick={() => insertAtCursor('AND')}
            className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            AND
          </button>
          <button
            onClick={() => insertAtCursor('OR')}
            className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            OR
          </button>
          <button
            onClick={() => insertAtCursor('NOT')}
            className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
          >
            NOT
          </button>
          <button
            onClick={() => insertAtCursor('""')}
            className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
            title="Wrap in quotes for exact match"
          >
            &quot;Phrase&quot;
          </button>
          <button
            onClick={() => insertAtCursor('()')}
            className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            title="Add parentheses for grouping"
          >
            ( )
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-300 self-center mx-1" />

          {/* Pattern dropdowns */}
          {titleVariants.length > 0 && (
            <div className="relative">
              <button
                onClick={() => insertPatternGroup(titleVariants.map(t => `"${t}"`))}
                className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                title="Insert title variants from AI strategy"
              >
                + Titles
              </button>
            </div>
          )}
          {skills.length > 0 && (
            <button
              onClick={() => insertPatternGroup(skills.map(s => s.includes(' ') ? `"${s}"` : s))}
              className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
              title="Insert skills from search strategy"
            >
              + Skills
            </button>
          )}
          {excludeTerms.length > 0 && (
            <button
              onClick={() => insertAtCursor(`NOT (${excludeTerms.join(' OR ')})`)}
              className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              title="Insert exclusion terms"
            >
              + Exclusions
            </button>
          )}

          {/* Pattern library toggle */}
          <button
            onClick={() => setShowPatterns(!showPatterns)}
            className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors flex items-center gap-1"
          >
            Pattern Library
            {showPatterns ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {/* Pattern Library Panel */}
        {showPatterns && patterns && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              {/* Titles */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Title Patterns</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {patterns.titles.labels.slice(0, 8).map((item) => (
                    <button
                      key={item.value}
                      onClick={() => insertPatternGroup(patterns.titles.values[item.value])}
                      className="block w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Skills */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Skill Patterns</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {patterns.skills.labels.slice(0, 8).map((item) => (
                    <button
                      key={item.value}
                      onClick={() => insertPatternGroup(patterns.skills.values[item.value])}
                      className="block w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Exclusions */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Exclusion Patterns</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {patterns.exclusions.labels.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => insertAtCursor(`NOT (${patterns.exclusions.values[item.value].join(' OR ')})`)}
                      className="block w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-red-50 hover:text-red-700 rounded transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Validation Feedback */}
        {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="mt-3 space-y-2">
            {/* Errors */}
            {validation.errors.map((error, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-700">{error.message}</span>
              </div>
            ))}
            {/* Warnings */}
            {validation.warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="text-xs text-yellow-800">{warning.message}</span>
                  {warning.suggestion && (
                    <p className="text-xs text-yellow-600 mt-0.5">{warning.suggestion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Interpretation Preview */}
        {interpretation && (interpretation.include.length > 0 || interpretation.exclude.length > 0) && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-blue-800">How LinkedIn Will Interpret This</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              {interpretation.include.length > 0 && (
                <div>
                  <span className="font-medium text-green-700">INCLUDE:</span>
                  <p className="text-gray-600 mt-0.5">{interpretation.include.slice(0, 8).join(', ')}{interpretation.include.length > 8 ? '...' : ''}</p>
                </div>
              )}
              {interpretation.exclude.length > 0 && (
                <div>
                  <span className="font-medium text-red-700">EXCLUDE:</span>
                  <p className="text-gray-600 mt-0.5">{interpretation.exclude.slice(0, 8).join(', ')}{interpretation.exclude.length > 8 ? '...' : ''}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Query Stats (Collapsible) */}
        <div className="mt-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Query Details
          </button>
          {showAdvanced && validation?.stats && (
            <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-600 grid grid-cols-4 gap-2">
              <div>
                <span className="font-medium">Terms:</span> {validation.stats.termCount}
              </div>
              <div>
                <span className="font-medium">AND:</span> {validation.stats.operatorCount.AND}
              </div>
              <div>
                <span className="font-medium">OR:</span> {validation.stats.operatorCount.OR}
              </div>
              <div>
                <span className="font-medium">NOT:</span> {validation.stats.operatorCount.NOT}
              </div>
              <div>
                <span className="font-medium">Depth:</span> {validation.stats.parenDepth}
              </div>
              <div>
                <span className="font-medium">Phrases:</span> {validation.stats.quotedPhrases}
              </div>
              <div className="col-span-2">
                <span className="font-medium">Best API:</span> {validation.stats.estimatedApiType}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {validation?.isValid ? 'Ready to search' : 'Fix errors before searching'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            Reset to AI-Generated
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy Query'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BooleanQueryEditor;
