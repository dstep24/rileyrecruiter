/**
 * Boolean Query Validator
 *
 * Validates and sanitizes Boolean search queries before sending to LinkedIn via Unipile.
 * Checks for syntax errors, provides warnings, and computes query statistics.
 */

// =============================================================================
// TYPES
// =============================================================================

export type ValidationErrorType =
  | 'UNBALANCED_PARENS'
  | 'UNBALANCED_QUOTES'
  | 'EMPTY_QUERY'
  | 'INVALID_OPERATOR'
  | 'CONSECUTIVE_OPERATORS'
  | 'EMPTY_GROUP';

export type ValidationWarningType =
  | 'QUERY_TOO_LONG'
  | 'NO_OPERATORS'
  | 'REDUNDANT_TERM'
  | 'MISSING_QUOTES_PHRASE'
  | 'CASE_SENSITIVITY';

export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  position?: number;
}

export interface ValidationWarning {
  type: ValidationWarningType;
  message: string;
  suggestion?: string;
}

export interface QueryStats {
  length: number;
  termCount: number;
  operatorCount: {
    AND: number;
    OR: number;
    NOT: number;
  };
  parenDepth: number;
  quotedPhrases: number;
  estimatedApiType: 'classic' | 'sales_navigator' | 'recruiter';
}

export interface ValidationResult {
  isValid: boolean;
  sanitizedQuery: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: QueryStats;
}

export type ApiType = 'classic' | 'sales_navigator' | 'recruiter';

// =============================================================================
// CONSTANTS
// =============================================================================

const API_LIMITS: Record<ApiType, number> = {
  classic: 150,
  sales_navigator: 500,
  recruiter: 1000,
};

// Common multi-word job titles that should be quoted
const COMMON_MULTI_WORD_TITLES = [
  'Director of Engineering',
  'VP of Engineering',
  'VP Engineering',
  'Head of Engineering',
  'Engineering Director',
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Engineer',
  'Principal Engineer',
  'Engineering Manager',
  'Product Manager',
  'Senior Product Manager',
  'Director of Product',
  'VP of Product',
  'Head of Product',
  'Chief Technology Officer',
  'Chief Product Officer',
  'Technical Lead',
  'Tech Lead',
  'Team Lead',
  'Project Manager',
  'Program Manager',
  'Data Scientist',
  'Machine Learning Engineer',
  'DevOps Engineer',
  'Site Reliability Engineer',
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'Solutions Architect',
  'Cloud Architect',
  'Software Architect',
  'Business Development',
  'Account Executive',
  'Sales Manager',
  'Customer Success',
];

// =============================================================================
// BOOLEAN QUERY VALIDATOR
// =============================================================================

export class BooleanQueryValidator {
  /**
   * Validate a Boolean query string
   */
  validate(query: string, apiType: ApiType = 'classic'): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Check for empty query
    if (!query || !query.trim()) {
      errors.push({
        type: 'EMPTY_QUERY',
        message: 'Query cannot be empty',
      });
      return {
        isValid: false,
        sanitizedQuery: '',
        errors,
        warnings,
        stats: this.createEmptyStats(),
      };
    }

    const trimmedQuery = query.trim();

    // 2. Check balanced parentheses
    const parenBalance = this.checkParentheses(trimmedQuery);
    if (parenBalance !== 0) {
      errors.push({
        type: 'UNBALANCED_PARENS',
        message:
          parenBalance > 0
            ? `Missing ${parenBalance} closing parenthesis`
            : `Missing ${Math.abs(parenBalance)} opening parenthesis`,
      });
    }

    // 3. Check balanced quotes
    const quoteCount = this.countUnescapedQuotes(trimmedQuery);
    if (quoteCount % 2 !== 0) {
      errors.push({
        type: 'UNBALANCED_QUOTES',
        message: 'Unmatched quote detected',
      });
    }

    // 4. Check for consecutive operators
    if (/\b(AND|OR|NOT)\s+(AND|OR)\b/i.test(trimmedQuery)) {
      errors.push({
        type: 'CONSECUTIVE_OPERATORS',
        message: 'Consecutive operators detected (e.g., AND AND)',
      });
    }

    // 5. Check for empty groups
    if (/\(\s*\)/.test(trimmedQuery)) {
      errors.push({
        type: 'EMPTY_GROUP',
        message: 'Empty parentheses group detected',
      });
    }

    // 6. Check for invalid operator usage
    // Operators at start (except NOT) or end of query
    if (/^\s*(AND|OR)\b/i.test(trimmedQuery)) {
      errors.push({
        type: 'INVALID_OPERATOR',
        message: 'Query cannot start with AND or OR',
      });
    }
    if (/\b(AND|OR|NOT)\s*$/i.test(trimmedQuery)) {
      errors.push({
        type: 'INVALID_OPERATOR',
        message: 'Query cannot end with an operator',
      });
    }

    // 7. Warn about query length
    const maxLength = API_LIMITS[apiType];
    if (trimmedQuery.length > maxLength) {
      warnings.push({
        type: 'QUERY_TOO_LONG',
        message: `Query is ${trimmedQuery.length} chars, exceeds ${maxLength} char limit for ${apiType} API`,
        suggestion:
          apiType === 'classic'
            ? 'Consider using Sales Navigator or Recruiter API for longer queries'
            : 'Consider removing less important terms',
      });
    }

    // 8. Check for missing quotes on multi-word phrases
    const unquotedPhrases = this.findUnquotedPhrases(trimmedQuery);
    for (const phrase of unquotedPhrases) {
      warnings.push({
        type: 'MISSING_QUOTES_PHRASE',
        message: `"${phrase}" might match unintended results without quotes`,
        suggestion: `Use "${phrase}" for exact phrase matching`,
      });
    }

    // 9. Check for redundant terms
    const redundantTerms = this.findRedundantTerms(trimmedQuery);
    for (const term of redundantTerms) {
      warnings.push({
        type: 'REDUNDANT_TERM',
        message: `"${term}" appears multiple times in the query`,
        suggestion: 'Remove duplicate terms to simplify the query',
      });
    }

    // 10. Check for no operators (might be unintentional)
    if (!/\b(AND|OR|NOT)\b/i.test(trimmedQuery) && trimmedQuery.includes(' ')) {
      warnings.push({
        type: 'NO_OPERATORS',
        message: 'Query has no Boolean operators (AND, OR, NOT)',
        suggestion: 'LinkedIn will treat spaces as AND. Add explicit operators for clarity.',
      });
    }

    // Sanitize the query
    const sanitizedQuery = this.sanitize(trimmedQuery);

    // Compute stats
    const stats = this.computeStats(sanitizedQuery);

    return {
      isValid: errors.length === 0,
      sanitizedQuery,
      errors,
      warnings,
      stats,
    };
  }

  /**
   * Sanitize a query string
   */
  sanitize(query: string): string {
    return query
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\(\s+/g, '(') // Remove space after (
      .replace(/\s+\)/g, ')') // Remove space before )
      .replace(/\s*\bAND\b\s*/gi, ' AND ') // Normalize AND spacing
      .replace(/\s*\bOR\b\s*/gi, ' OR ') // Normalize OR spacing
      .replace(/\s*\bNOT\b\s*/gi, ' NOT ') // Normalize NOT spacing
      .replace(/\s+/g, ' ') // Clean up any double spaces
      .trim();
  }

  /**
   * Check parentheses balance
   * Returns: 0 if balanced, positive if missing ), negative if missing (
   */
  private checkParentheses(query: string): number {
    let balance = 0;
    let inQuotes = false;

    for (const char of query) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (char === '(') balance++;
        if (char === ')') balance--;
      }
    }

    return balance;
  }

  /**
   * Count unescaped quotes
   */
  private countUnescapedQuotes(query: string): number {
    // Count quotes that aren't escaped
    let count = 0;
    for (let i = 0; i < query.length; i++) {
      if (query[i] === '"' && (i === 0 || query[i - 1] !== '\\')) {
        count++;
      }
    }
    return count;
  }

  /**
   * Find multi-word phrases that should probably be quoted
   */
  private findUnquotedPhrases(query: string): string[] {
    const unquoted: string[] = [];

    // Extract all quoted phrases to exclude them
    const quotedPhrases = new Set<string>();
    const quoteRegex = /"([^"]+)"/g;
    let match;
    while ((match = quoteRegex.exec(query)) !== null) {
      quotedPhrases.add(match[1].toLowerCase());
    }

    // Check each common title
    for (const title of COMMON_MULTI_WORD_TITLES) {
      const lowerTitle = title.toLowerCase();
      const lowerQuery = query.toLowerCase();

      // Check if the title appears unquoted
      if (lowerQuery.includes(lowerTitle) && !quotedPhrases.has(lowerTitle)) {
        // Make sure it's not inside quotes
        const index = lowerQuery.indexOf(lowerTitle);
        if (!this.isInsideQuotes(query, index)) {
          unquoted.push(title);
        }
      }
    }

    return unquoted;
  }

  /**
   * Check if a position is inside quotes
   */
  private isInsideQuotes(query: string, position: number): boolean {
    let inQuotes = false;
    for (let i = 0; i < position && i < query.length; i++) {
      if (query[i] === '"' && (i === 0 || query[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      }
    }
    return inQuotes;
  }

  /**
   * Find redundant (duplicate) terms in the query
   */
  private findRedundantTerms(query: string): string[] {
    const redundant: string[] = [];

    // Extract all terms (quoted phrases and single words)
    const terms: string[] = [];

    // Extract quoted phrases
    const quoteRegex = /"([^"]+)"/g;
    let match;
    while ((match = quoteRegex.exec(query)) !== null) {
      terms.push(match[1].toLowerCase());
    }

    // Remove quoted phrases and extract remaining words
    const withoutQuotes = query.replace(/"[^"]+"/g, '');
    const words = withoutQuotes
      .split(/[\s()]+/)
      .filter((w) => w && !/^(AND|OR|NOT)$/i.test(w))
      .map((w) => w.toLowerCase());
    terms.push(...words);

    // Find duplicates
    const seen = new Set<string>();
    for (const term of terms) {
      if (seen.has(term)) {
        if (!redundant.includes(term)) {
          redundant.push(term);
        }
      } else {
        seen.add(term);
      }
    }

    return redundant;
  }

  /**
   * Compute query statistics
   */
  private computeStats(query: string): QueryStats {
    // Count operators
    const andCount = (query.match(/\bAND\b/gi) || []).length;
    const orCount = (query.match(/\bOR\b/gi) || []).length;
    const notCount = (query.match(/\bNOT\b/gi) || []).length;

    // Count quoted phrases
    const quotedPhrases = (query.match(/"[^"]+"/g) || []).length;

    // Count max paren depth
    let maxDepth = 0;
    let currentDepth = 0;
    let inQuotes = false;
    for (const char of query) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (char === '(') {
          currentDepth++;
          maxDepth = Math.max(maxDepth, currentDepth);
        }
        if (char === ')') {
          currentDepth--;
        }
      }
    }

    // Count terms (quoted phrases + individual words)
    const withoutQuotes = query.replace(/"[^"]+"/g, ' QUOTED_PHRASE ');
    const words = withoutQuotes
      .split(/[\s()]+/)
      .filter((w) => w && !/^(AND|OR|NOT)$/i.test(w));
    const termCount = words.length;

    // Estimate appropriate API based on length
    let estimatedApiType: ApiType = 'classic';
    if (query.length > API_LIMITS.classic) {
      estimatedApiType = 'sales_navigator';
    }
    if (query.length > API_LIMITS.sales_navigator) {
      estimatedApiType = 'recruiter';
    }

    return {
      length: query.length,
      termCount,
      operatorCount: {
        AND: andCount,
        OR: orCount,
        NOT: notCount,
      },
      parenDepth: maxDepth,
      quotedPhrases,
      estimatedApiType,
    };
  }

  /**
   * Create empty stats object
   */
  private createEmptyStats(): QueryStats {
    return {
      length: 0,
      termCount: 0,
      operatorCount: { AND: 0, OR: 0, NOT: 0 },
      parenDepth: 0,
      quotedPhrases: 0,
      estimatedApiType: 'classic',
    };
  }

  /**
   * Generate a human-readable interpretation of the query
   */
  interpretQuery(query: string): { include: string[]; exclude: string[] } {
    const include: string[] = [];
    const exclude: string[] = [];

    // Simple interpretation - extract terms after NOT
    const notPattern = /\bNOT\s*\(([^)]+)\)/gi;
    let match;
    while ((match = notPattern.exec(query)) !== null) {
      const terms = match[1]
        .split(/\s+OR\s+/i)
        .map((t) => t.replace(/"/g, '').trim());
      exclude.push(...terms);
    }

    // Also handle single NOT terms
    const singleNotPattern = /\bNOT\s+(?!\()("[^"]+"|\w+)/gi;
    while ((match = singleNotPattern.exec(query)) !== null) {
      exclude.push(match[1].replace(/"/g, '').trim());
    }

    // Extract include terms (everything not in NOT blocks)
    const withoutNot = query.replace(/\bNOT\s*\([^)]+\)/gi, '').replace(/\bNOT\s+("[^"]+"|\w+)/gi, '');
    const includeTerms = withoutNot
      .replace(/\b(AND|OR)\b/gi, ' ')
      .replace(/[()]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && t !== '"')
      .map((t) => t.replace(/"/g, '').trim());

    // Also extract quoted phrases
    const quotedRegex = /"([^"]+)"/g;
    while ((match = quotedRegex.exec(withoutNot)) !== null) {
      if (!include.includes(match[1])) {
        include.push(match[1]);
      }
    }

    // Add non-quoted terms
    for (const term of includeTerms) {
      if (term && !include.includes(term)) {
        include.push(term);
      }
    }

    return { include, exclude };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let validatorInstance: BooleanQueryValidator | null = null;

export function getBooleanQueryValidator(): BooleanQueryValidator {
  if (!validatorInstance) {
    validatorInstance = new BooleanQueryValidator();
  }
  return validatorInstance;
}

export function resetBooleanQueryValidator(): void {
  validatorInstance = null;
}
