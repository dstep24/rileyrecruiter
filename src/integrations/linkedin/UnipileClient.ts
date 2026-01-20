/**
 * Unipile API Client - LinkedIn Integration via Unipile
 *
 * Provides direct integration with Unipile's LinkedIn API for:
 * - Profile search (Classic, Sales Navigator, Recruiter)
 * - Profile data extraction
 * - Messaging (InMail, connection requests)
 * - Conversation management
 *
 * API Docs: https://developer.unipile.com/docs/
 */

import { v4 as uuid } from 'uuid';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface UnipileConfig {
  apiKey: string;
  dsn: string; // Your Unipile subdomain (e.g., "api1" for api1.unipile.com)
  port?: string; // Port (defaults to 13443)
  accountId: string; // LinkedIn account to use for operations
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

export type UnipileSearchApi = 'classic' | 'sales_navigator' | 'recruiter';
export type UnipileSearchCategory = 'people' | 'companies' | 'jobs' | 'posts';

// Skill filter with priority (for Recruiter API)
export interface UnipileSkillFilter {
  id: string; // Skill ID from parameter lookup
  priority: 'MUST_HAVE' | 'DOESNT_HAVE';
}

// Role filter with scope (for Recruiter API)
export interface UnipileRoleFilter {
  keywords: string; // Boolean search like "developer OR engineer"
  priority: 'MUST_HAVE' | 'DOESNT_HAVE';
  scope: 'CURRENT' | 'PAST' | 'CURRENT_OR_PAST';
}

export interface UnipileSearchParams {
  // Search type
  api: UnipileSearchApi;
  category: UnipileSearchCategory;

  // Search terms
  keywords?: string;
  url?: string; // Paste LinkedIn search URL directly

  // Filters
  location?: string[]; // Location IDs from parameter lookup
  industry?: {
    include?: string[];
    exclude?: string[];
  };
  company?: {
    include?: string[];
    exclude?: string[];
  };

  // Skills - can be simple strings OR structured filters for Recruiter API
  skills?: string[] | UnipileSkillFilter[];

  // Role - can be simple strings OR structured filters for Recruiter API
  role?: string[] | UnipileRoleFilter[];

  title?: string[];
  school?: string[];
  profile_language?: string[];
  network_distance?: (1 | 2 | 3 | 'GROUP')[];

  // Experience/tenure filters
  years_of_experience?: {
    min?: number;
    max?: number;
  };
  tenure?: {
    min?: number;
    max?: number;
  };

  // Seniority levels
  seniority?: string[];

  // Boolean search (advanced)
  first_name?: string;
  last_name?: string;

  // Pagination
  cursor?: string;
  limit?: number;
}

// Parameter lookup types
export type UnipileParameterType = 'LOCATION' | 'SKILL' | 'INDUSTRY' | 'COMPANY' | 'SCHOOL' | 'SENIORITY';

export interface UnipileParameterResult {
  id: string;
  name: string;
  type: UnipileParameterType;
}

export interface UnipileProfile {
  id: string;
  provider: 'LINKEDIN';
  provider_id: string; // LinkedIn URN
  public_identifier?: string; // Vanity URL

  // Basic info
  first_name?: string;
  last_name?: string;
  name?: string;
  headline?: string;
  summary?: string;
  profile_url?: string;
  profile_picture_url?: string;

  // Location
  location?: string;
  country?: string;

  // Current position
  current_title?: string;
  current_company?: string;
  current_company_id?: string;

  // Experience - API returns "work_experience" but we map to "experiences" for consistency
  experiences?: UnipileExperience[];

  // Raw API field - Unipile returns work history as "work_experience"
  work_experience?: UnipileWorkExperience[];

  // Education
  educations?: UnipileEducation[];

  // Skills - API may return as array of strings or as skill objects
  skills?: string[] | UnipileSkill[];

  // Network
  connection_degree?: 1 | 2 | 3;
  connections_count?: number;
  mutual_connections?: number;

  // Status
  is_open_to_work?: boolean;
  is_premium?: boolean;
}

// Raw work_experience format from Unipile API
export interface UnipileWorkExperience {
  company_id?: string;
  company?: string;
  position?: string;
  location?: string;
  start?: string;
  end?: string;
  description?: string;
}

// Skill object format from Unipile API (when linkedin_sections=* is used)
export interface UnipileSkill {
  name: string;
  endorsements_count?: number;
}

export interface UnipileExperience {
  title: string;
  company_name: string;
  company_id?: string;
  company_logo?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  description?: string;
}

export interface UnipileEducation {
  school_name: string;
  school_id?: string;
  degree?: string;
  field_of_study?: string;
  start_year?: number;
  end_year?: number;
}

export interface UnipileSearchResult {
  object: 'LinkedinSearch';
  items: UnipileProfile[];
  paging: {
    start: number;
    page_count: number;
    total_count: number;
  };
  cursor?: string;
}

// =============================================================================
// COMPANY TYPES
// =============================================================================

export interface UnipileCompany {
  type: 'COMPANY';
  id: string;
  name: string;
  profile_url?: string;
  summary?: string;
  industry?: string;
  location?: string;
  followers_count?: number;
  job_offers_count?: number;
  headcount?: string; // e.g., "54", "152"
  logo_url?: string;
  website?: string;
}

export interface UnipileCompanySearchResult {
  object: 'LinkedinSearch';
  items: UnipileCompany[];
  paging: {
    start: number;
    page_count: number;
    total_count: number;
  };
  cursor?: string;
}

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

// =============================================================================
// MESSAGING TYPES
// =============================================================================

export interface UnipileMessage {
  id: string;
  provider: 'LINKEDIN';
  provider_id: string;
  chat_id: string;

  // Content
  text: string;
  subject?: string;

  // Participants
  sender_id: string;
  recipient_id?: string;

  // Timestamps
  created_at: string;
  delivered_at?: string;
  seen_at?: string;

  // Type
  type: 'message' | 'inmail' | 'connection_request';
}

export interface UnipileChatAttendee {
  id: string;
  provider_id?: string;
  name?: string;
  profile_url?: string;
}

export interface UnipileChat {
  id: string;
  provider: 'LINKEDIN';
  provider_id: string;
  participants?: UnipileProfile[];
  attendees?: UnipileChatAttendee[]; // Alternative field name used by some endpoints
  last_message?: UnipileMessage;
  message_count: number;
  unread_count: number;
  updated_at: string;
}

export interface UnipileSendMessageParams {
  account_id: string;
  attendee_provider_id: string; // LinkedIn URN of recipient
  text: string;
}

export interface UnipileSendInMailParams {
  account_id: string;
  attendee_provider_id: string;
  subject: string;
  text: string;
}

export interface UnipileConnectionRequestParams {
  account_id: string;
  provider_id: string; // LinkedIn URN
  message?: string; // Optional note (max 300 chars)
}

// =============================================================================
// UNIPILE CLIENT
// =============================================================================

// Track which API types the account has access to
export interface AccountCapabilities {
  classic: boolean;
  sales_navigator: boolean;
  recruiter: boolean;
  checkedAt: Date;
}

export class UnipileClient {
  private config: UnipileConfig;
  private baseUrl: string;
  private accountCapabilities: AccountCapabilities | null = null;

  constructor(config: UnipileConfig) {
    this.config = config;
    const port = config.port || '13443';
    this.baseUrl = `https://${config.dsn}.unipile.com:${port}/api/v1`;
  }

  /**
   * Check which LinkedIn API types this account has access to.
   * Sales Navigator and Recruiter provide richer data (including headcount for companies).
   */
  async checkAccountCapabilities(): Promise<AccountCapabilities> {
    // Return cached if checked within last hour
    if (this.accountCapabilities &&
        (Date.now() - this.accountCapabilities.checkedAt.getTime()) < 3600000) {
      return this.accountCapabilities;
    }

    const capabilities: AccountCapabilities = {
      classic: false,
      sales_navigator: false,
      recruiter: false,
      checkedAt: new Date(),
    };

    // Test each API type with a simple search
    const apiTypes: UnipileSearchApi[] = ['classic', 'sales_navigator', 'recruiter'];

    for (const apiType of apiTypes) {
      try {
        const testBody = {
          api: apiType,
          category: 'people' as const,
          keywords: 'test',
          limit: 1,
        };

        const response = await this.request<UnipileSearchResult>(
          'POST',
          `/linkedin/search?account_id=${this.config.accountId}`,
          testBody
        );

        // If we get a response without error, this API type is available
        if (response && response.object === 'LinkedinSearch') {
          capabilities[apiType] = true;
          console.log(`[UnipileClient] ✓ Account has ${apiType} access`);
        }
      } catch (error) {
        console.log(`[UnipileClient] ✗ Account does NOT have ${apiType} access`);
      }
    }

    this.accountCapabilities = capabilities;

    console.log('[UnipileClient] Account capabilities:', {
      classic: capabilities.classic,
      sales_navigator: capabilities.sales_navigator,
      recruiter: capabilities.recruiter,
    });

    return capabilities;
  }

  /**
   * Get the best available API type for company search.
   * Prefers: recruiter > sales_navigator > classic
   * Recruiter and Sales Navigator return headcount, Classic does not.
   */
  async getBestApiForCompanySearch(): Promise<UnipileSearchApi> {
    const caps = await this.checkAccountCapabilities();

    if (caps.recruiter) return 'recruiter';
    if (caps.sales_navigator) return 'sales_navigator';
    return 'classic';
  }

  // ===========================================================================
  // PARAMETER LOOKUP
  // ===========================================================================

  /**
   * Look up parameter IDs for locations, skills, industries, etc.
   * Required for building structured search queries.
   */
  async lookupParameters(
    type: UnipileParameterType,
    keywords: string,
    limit: number = 10
  ): Promise<UnipileParameterResult[]> {
    const url = `/linkedin/search/parameters?account_id=${this.config.accountId}&type=${type}&keywords=${encodeURIComponent(keywords)}&limit=${limit}`;

    const response = await this.request<{
      items: UnipileParameterResult[];
    }>('GET', url);

    return response?.items || [];
  }

  /**
   * Look up location IDs by name
   */
  async lookupLocations(query: string, limit: number = 5): Promise<UnipileParameterResult[]> {
    return this.lookupParameters('LOCATION', query, limit);
  }

  /**
   * Look up skill IDs by name
   */
  async lookupSkills(query: string, limit: number = 10): Promise<UnipileParameterResult[]> {
    return this.lookupParameters('SKILL', query, limit);
  }

  /**
   * Look up industry IDs by name
   */
  async lookupIndustries(query: string, limit: number = 10): Promise<UnipileParameterResult[]> {
    return this.lookupParameters('INDUSTRY', query, limit);
  }

  /**
   * Look up company IDs by name
   */
  async lookupCompanies(query: string, limit: number = 10): Promise<UnipileParameterResult[]> {
    return this.lookupParameters('COMPANY', query, limit);
  }

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  /**
   * Search LinkedIn for profiles
   */
  async searchProfiles(params: UnipileSearchParams): Promise<UnipileSearchResult> {
    const body: Record<string, unknown> = {
      api: params.api,
      category: params.category,
    };

    // Add search terms
    if (params.keywords) body.keywords = params.keywords;
    if (params.url) body.url = params.url;

    // Add filters
    if (params.location?.length) body.location = params.location;
    if (params.industry) body.industry = params.industry;
    if (params.company) body.company = params.company;

    // Skills - handle both simple strings and structured filters
    if (params.skills?.length) {
      body.skills = params.skills;
    }

    // Role - handle both simple strings and structured filters
    if (params.role?.length) {
      body.role = params.role;
    }

    if (params.title?.length) body.title = params.title;
    if (params.school?.length) body.school = params.school;
    if (params.profile_language?.length) body.profile_language = params.profile_language;
    if (params.network_distance?.length) body.network_distance = params.network_distance;
    if (params.seniority?.length) body.seniority = params.seniority;
    if (params.first_name) body.first_name = params.first_name;
    if (params.last_name) body.last_name = params.last_name;

    // Experience/tenure filters
    if (params.years_of_experience) {
      body.years_of_experience = params.years_of_experience;
    }
    if (params.tenure) {
      body.tenure = params.tenure;
    }

    // Pagination
    if (params.cursor) body.cursor = params.cursor;
    if (params.limit) body.limit = params.limit;

    console.log('[UnipileClient] Search request:', JSON.stringify(body, null, 2));

    const response = await this.request<UnipileSearchResult>(
      'POST',
      `/linkedin/search?account_id=${this.config.accountId}`,
      body
    );

    console.log('[UnipileClient] Search response:', response?.paging);

    return response || {
      object: 'LinkedinSearch',
      items: [],
      paging: { start: 0, page_count: 0, total_count: 0 },
    };
  }

  /**
   * Search with a LinkedIn search URL
   * Allows copy/paste from browser
   */
  async searchWithUrl(url: string, api: UnipileSearchApi = 'classic'): Promise<UnipileSearchResult> {
    return this.searchProfiles({
      api,
      category: 'people',
      url,
    });
  }

  /**
   * Paginate through search results
   */
  async *searchProfilesIterator(
    params: UnipileSearchParams,
    maxResults: number = 100
  ): AsyncGenerator<UnipileProfile[], void, unknown> {
    let cursor: string | undefined;
    let totalFetched = 0;

    while (totalFetched < maxResults) {
      const result = await this.searchProfiles({
        ...params,
        cursor,
        limit: Math.min(25, maxResults - totalFetched),
      });

      if (result.items.length === 0) break;

      yield result.items;
      totalFetched += result.items.length;

      if (!result.cursor || result.items.length < 25) break;
      cursor = result.cursor;

      // Rate limiting delay
      await this.delay(1000);
    }
  }

  // ===========================================================================
  // PROFILE
  // ===========================================================================

  /**
   * Get full profile by provider ID (LinkedIn URN)
   *
   * IMPORTANT: To get experiences, skills, and about section, we need to specify
   * linkedin_sections parameter. Without it, Unipile only returns basic profile info.
   *
   * According to Unipile docs:
   * - Use linkedin_sections=* to get ALL available sections
   * - Or specify individual sections like 'experience', 'about', 'skills'
   *
   * The API returns work history as "work_experience" (not "experiences")
   * and skills may be objects with endorsement counts. We normalize these.
   *
   * @param providerId - LinkedIn provider ID (ACo... format)
   * @param sections - Which sections to fetch. Use '*' for all, or specific section names.
   */
  async getProfile(
    providerId: string,
    sections: string = '*'
  ): Promise<UnipileProfile | null> {
    // Build query params with sections to request full profile data
    const params = new URLSearchParams({
      account_id: this.config.accountId,
      // Use linkedin_sections parameter to request all profile data
      // The '*' value requests all available sections including experience, about, skills
      linkedin_sections: sections,
    });

    console.log(`[UnipileClient] Fetching profile ${providerId} with linkedin_sections=${sections}`);
    console.log(`[UnipileClient] Full URL: /users/${providerId}?${params.toString()}`);

    const rawResponse = await this.request<UnipileProfile>(
      'GET',
      `/users/${providerId}?${params.toString()}`
    );

    if (!rawResponse) {
      return null;
    }

    // Log the FULL response to see exactly what fields are returned
    console.log(`[UnipileClient] Full profile response keys for ${providerId}:`,
      Object.keys(rawResponse)
    );

    // Check for work_experience (Unipile's actual field name)
    // The API returns work_experience but our interface has work_experience as optional
    const workExperience = (rawResponse as unknown as Record<string, unknown>).work_experience as UnipileWorkExperience[] | undefined;
    console.log(`[UnipileClient] Raw work_experience field:`, {
      hasWorkExperience: !!workExperience,
      workExperienceCount: workExperience?.length || 0,
      firstEntry: workExperience?.[0],
    });

    // Transform work_experience to our experiences format
    const experiences: UnipileExperience[] = workExperience?.map(we => ({
      title: we.position || '',
      company_name: we.company || '',
      company_id: we.company_id,
      location: we.location,
      start_date: we.start,
      end_date: we.end,
      is_current: !we.end,
      description: we.description,
    })) || [];

    // Normalize skills - API may return string[] or skill objects[]
    let normalizedSkills: string[] = [];
    const rawSkills = rawResponse.skills;
    if (Array.isArray(rawSkills)) {
      normalizedSkills = rawSkills.map(skill => {
        if (typeof skill === 'string') {
          return skill;
        } else if (skill && typeof skill === 'object' && 'name' in skill) {
          return (skill as UnipileSkill).name;
        }
        return String(skill);
      });
    }

    // Create normalized profile
    const normalizedProfile: UnipileProfile = {
      ...rawResponse,
      experiences: experiences.length > 0 ? experiences : rawResponse.experiences,
      skills: normalizedSkills.length > 0 ? normalizedSkills : undefined,
    };

    // Log what we received after normalization
    console.log(`[UnipileClient] Normalized profile for ${providerId}:`, {
      hasExperiences: !!normalizedProfile.experiences,
      experienceCount: normalizedProfile.experiences?.length || 0,
      firstExperience: normalizedProfile.experiences?.[0],
      hasSummary: !!normalizedProfile.summary,
      summaryPreview: normalizedProfile.summary?.substring(0, 100),
      hasSkills: !!normalizedProfile.skills,
      skillCount: normalizedProfile.skills?.length || 0,
      skills: normalizedProfile.skills?.slice(0, 5),
    });

    return normalizedProfile;
  }

  // ===========================================================================
  // COMPANY SEARCH
  // ===========================================================================

  /**
   * Search for companies on LinkedIn
   *
   * Based on Unipile API docs, company search returns different fields by API type:
   *
   * CLASSIC API (basic LinkedIn):
   * - type, id, name, profile_url, summary, industry, location
   * - followers_count, job_offers_count
   * - NO headcount field
   *
   * SALES NAVIGATOR / RECRUITER API (premium):
   * - All classic fields PLUS:
   * - headcount: Employee count as string (e.g., "54", "152")
   *
   * Priority order: recruiter > sales_navigator > classic
   * Recruiter/SN provide actual headcount; Classic requires estimation from followers.
   */
  async searchCompanies(
    keyword: string,
    limit: number = 5
  ): Promise<UnipileCompanySearchResult> {
    // Priority: Recruiter (most data) > Sales Navigator > Classic
    const apiTypes: UnipileSearchApi[] = ['recruiter', 'sales_navigator', 'classic'];

    for (const apiType of apiTypes) {
      const body = {
        api: apiType,
        category: 'companies' as const,
        keywords: keyword,
        limit,
      };

      console.log(`[UnipileClient] Company search (${apiType}) for: "${keyword}"`);

      try {
        const response = await this.request<UnipileCompanySearchResult>(
          'POST',
          `/linkedin/search?account_id=${this.config.accountId}`,
          body
        );

        if (response?.items?.length) {
          const firstCompany = response.items[0];
          const hasRealHeadcount = !!firstCompany?.headcount;

          console.log(`[UnipileClient] ✓ Company search succeeded with ${apiType}:`, {
            resultsCount: response.items.length,
            firstCompany: firstCompany?.name,
            hasHeadcount: hasRealHeadcount,
            headcount: firstCompany?.headcount || 'NOT AVAILABLE (will estimate from followers)',
            industry: firstCompany?.industry,
            followers: firstCompany?.followers_count,
          });

          // Tag the response with which API was used (for debugging)
          (response as unknown as Record<string, unknown>).__apiUsed = apiType;
          (response as unknown as Record<string, unknown>).__hasRealHeadcount = hasRealHeadcount;

          return response;
        }
      } catch (error) {
        // API type not available for this account - try next
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`[UnipileClient] ${apiType} not available: ${errorMessage}`);
        continue;
      }
    }

    console.log(`[UnipileClient] ✗ No company results found for: "${keyword}"`);
    return {
      object: 'LinkedinSearch',
      items: [],
      paging: { start: 0, page_count: 0, total_count: 0 },
    };
  }

  /**
   * Get detailed company info by LinkedIn company ID or identifier
   */
  async getCompany(identifier: string): Promise<UnipileCompany | null> {
    const response = await this.request<UnipileCompany>(
      'GET',
      `/linkedin/company/${identifier}?account_id=${this.config.accountId}`
    );

    return response;
  }

  /**
   * Research a company by name - searches and returns enriched info
   */
  async researchCompany(companyName: string): Promise<CompanyInfo | null> {
    try {
      console.log(`[UnipileClient] Researching company: "${companyName}"`);

      // Search for the company
      const searchResult = await this.searchCompanies(companyName, 3); // Get top 3 to find best match

      if (searchResult.items.length === 0) {
        console.log(`[UnipileClient] No results found for company: "${companyName}"`);
        return null;
      }

      // Find the best matching company (closest name match)
      const normalizedSearch = companyName.toLowerCase().trim();
      let bestMatch = searchResult.items[0];

      for (const company of searchResult.items) {
        const normalizedName = (company.name || '').toLowerCase().trim();
        // Prefer exact or close matches
        if (normalizedName === normalizedSearch ||
            normalizedName.includes(normalizedSearch) ||
            normalizedSearch.includes(normalizedName)) {
          bestMatch = company;
          break;
        }
      }

      console.log(`[UnipileClient] Best match for "${companyName}":`, {
        id: bestMatch.id,
        name: bestMatch.name,
        headcount: bestMatch.headcount,
        followers_count: bestMatch.followers_count,
        industry: bestMatch.industry,
        location: bestMatch.location,
      });

      // Log all fields to catch any naming variations
      console.log(`[UnipileClient] ALL fields for "${companyName}":`, JSON.stringify(bestMatch, null, 2));

      const info = this.companyToInfo(bestMatch);
      console.log(`[UnipileClient] Converted to CompanyInfo:`, info);

      return info;
    } catch (error) {
      console.error(`[UnipileClient] Company research failed for ${companyName}:`, error);
      return null;
    }
  }

  /**
   * Convert UnipileCompany to CompanyInfo
   *
   * Data availability by API type:
   * - Recruiter/Sales Navigator: Returns actual headcount field
   * - Classic: NO headcount - we estimate from followers_count
   *
   * Estimation accuracy from followers:
   * - This is a rough approximation; Recruiter/SN provide accurate data
   */
  private companyToInfo(company: UnipileCompany): CompanyInfo {
    // The API might return headcount as string or number
    const rawCompany = company as unknown as Record<string, unknown>;
    const headcountValue = rawCompany.headcount ?? rawCompany.employee_count ?? rawCompany.employees ?? rawCompany.staff_count;
    let headcount = this.parseHeadcount(String(headcountValue || ''));

    // Handle potential field name variations
    const name = (rawCompany.name ?? rawCompany.company_name ?? 'Unknown') as string;
    const industry = (rawCompany.industry ?? rawCompany.industry_name ?? null) as string | null;
    const location = (rawCompany.location ?? rawCompany.headquarters ?? null) as string | null;
    const profileUrl = (rawCompany.profile_url ?? rawCompany.linkedin_url ?? rawCompany.url ?? null) as string | null;
    const followers = (rawCompany.followers_count ?? rawCompany.followers ?? null) as number | null;

    let headcountRange: string;
    let dataSource: 'actual' | 'estimated';

    if (headcount) {
      // We have real headcount data (from Recruiter or Sales Navigator)
      headcountRange = this.toHeadcountRange(headcount);
      dataSource = 'actual';
      console.log(`[UnipileClient] ✓ Using ACTUAL headcount for ${name}: ${headcount} (${headcountRange})`);
    } else if (followers) {
      // No headcount available (Classic API) - estimate from followers
      // LinkedIn company followers roughly correlate with company size:
      // - <1K followers: likely small startup (10-50 employees)
      // - 1-10K followers: small-medium company (50-500 employees)
      // - 10-50K followers: medium company (500-2000 employees)
      // - 50-200K followers: large company (2000-10000 employees)
      // - 200K+ followers: enterprise (10000+ employees)
      dataSource = 'estimated';

      if (followers < 1000) {
        headcountRange = '11-50 (est.)';
        headcount = 30;
      } else if (followers < 10000) {
        headcountRange = '51-500 (est.)';
        headcount = 200;
      } else if (followers < 50000) {
        headcountRange = '501-2000 (est.)';
        headcount = 1000;
      } else if (followers < 200000) {
        headcountRange = '2001-10000 (est.)';
        headcount = 5000;
      } else {
        headcountRange = '10000+ (est.)';
        headcount = 15000;
      }
      console.log(`[UnipileClient] ⚠ ESTIMATED headcount for ${name} from ${followers.toLocaleString()} followers: ~${headcount} (${headcountRange})`);
      console.log(`[UnipileClient]   → For accurate data, use LinkedIn Recruiter or Sales Navigator`);
    } else {
      // No data at all
      headcountRange = 'Unknown';
      dataSource = 'estimated';
      console.log(`[UnipileClient] ✗ No headcount or follower data for ${name}`);
    }

    const result: CompanyInfo = {
      id: company.id || 'unknown',
      name,
      headcount,
      headcountRange,
      industry,
      location,
      linkedInUrl: profileUrl,
      followers,
      enrichedAt: new Date(),
    };

    return result;
  }

  /**
   * Parse headcount string to number
   */
  private parseHeadcount(headcount: string | undefined): number | null {
    if (!headcount) return null;
    const num = parseInt(headcount.replace(/,/g, ''), 10);
    return isNaN(num) ? null : num;
  }

  /**
   * Convert headcount to standard range for display
   */
  private toHeadcountRange(headcount: number | null): string {
    if (!headcount) return 'Unknown';
    if (headcount <= 10) return '1-10';
    if (headcount <= 50) return '11-50';
    if (headcount <= 200) return '51-200';
    if (headcount <= 500) return '201-500';
    if (headcount <= 1000) return '501-1000';
    if (headcount <= 5000) return '1001-5000';
    if (headcount <= 10000) return '5001-10000';
    return '10000+';
  }

  /**
   * Get profile by public identifier (vanity URL username)
   *
   * Tries multiple approaches to resolve a LinkedIn username to a provider_id:
   * 1. Direct API call with public identifier
   * 2. Search with exact first/last name (if username appears to be a name)
   * 3. Keyword search as fallback
   */
  async getProfileByPublicId(publicId: string): Promise<UnipileProfile | null> {
    console.log(`[UnipileClient] Looking up profile by public ID: "${publicId}"`);

    // Clean the public ID (remove any URL parts if accidentally included)
    const cleanPublicId = publicId
      .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '')
      .replace(/\/$/, '')
      .split('?')[0];

    console.log(`[UnipileClient] Cleaned public ID: "${cleanPublicId}"`);

    // Approach 1: Try direct API call with public identifier
    // Unipile may support looking up by public_identifier directly
    try {
      const directResult = await this.request<UnipileProfile>(
        'GET',
        `/users/${cleanPublicId}?account_id=${this.config.accountId}&linkedin_sections=*`
      );

      if (directResult && directResult.provider_id) {
        console.log(`[UnipileClient] ✓ Found profile via direct lookup:`, {
          name: directResult.name || `${directResult.first_name} ${directResult.last_name}`,
          provider_id: directResult.provider_id,
        });
        return directResult;
      }
    } catch (error) {
      console.log(`[UnipileClient] Direct lookup failed, trying search methods...`);
    }

    // Approach 2: Try searching by profile URL
    // Some APIs accept the full profile URL as a search parameter
    try {
      const profileUrl = `https://www.linkedin.com/in/${cleanPublicId}/`;
      const urlSearchResult = await this.searchProfiles({
        api: 'classic',
        category: 'people',
        url: profileUrl,
        limit: 1,
      });

      if (urlSearchResult.items.length > 0) {
        const profile = urlSearchResult.items[0];
        console.log(`[UnipileClient] ✓ Found profile via URL search:`, {
          name: profile.name || `${profile.first_name} ${profile.last_name}`,
          provider_id: profile.provider_id,
        });
        // Get full profile with all sections
        return this.getProfile(profile.provider_id);
      }
    } catch (error) {
      console.log(`[UnipileClient] URL search failed, trying keyword search...`);
    }

    // Approach 3: Try keyword search with the username
    // This is less reliable but may work for some profiles
    const searchResult = await this.searchProfiles({
      api: 'classic',
      category: 'people',
      keywords: cleanPublicId.replace(/[-_]/g, ' '), // Convert hyphens/underscores to spaces
      limit: 10, // Get more results to find the right match
    });

    // Look for an exact or close match on public_identifier
    for (const profile of searchResult.items) {
      const profilePublicId = profile.public_identifier?.toLowerCase() ||
        profile.profile_url?.match(/linkedin\.com\/in\/([^\/\?]+)/)?.[1]?.toLowerCase();

      if (profilePublicId === cleanPublicId.toLowerCase()) {
        console.log(`[UnipileClient] ✓ Found exact match in search results:`, {
          name: profile.name || `${profile.first_name} ${profile.last_name}`,
          provider_id: profile.provider_id,
          public_identifier: profile.public_identifier,
        });
        // Get full profile with all sections
        return this.getProfile(profile.provider_id);
      }
    }

    // If no exact match, try the first result if it looks reasonable
    if (searchResult.items.length > 0) {
      const firstResult = searchResult.items[0];
      console.log(`[UnipileClient] ⚠ No exact match found, using best guess:`, {
        name: firstResult.name || `${firstResult.first_name} ${firstResult.last_name}`,
        provider_id: firstResult.provider_id,
        public_identifier: firstResult.public_identifier,
        searchedFor: cleanPublicId,
      });
      return this.getProfile(firstResult.provider_id);
    }

    console.log(`[UnipileClient] ✗ Could not find profile for: "${cleanPublicId}"`);
    return null;
  }

  /**
   * Batch get profiles
   */
  async batchGetProfiles(providerIds: string[]): Promise<Map<string, UnipileProfile>> {
    const profiles = new Map<string, UnipileProfile>();

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < providerIds.length; i += batchSize) {
      const batch = providerIds.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (id) => {
          try {
            return await this.getProfile(id);
          } catch (error) {
            console.error(`[UnipileClient] Error fetching profile ${id}:`, error);
            return null;
          }
        })
      );

      for (let j = 0; j < batch.length; j++) {
        const profile = results[j];
        if (profile) {
          profiles.set(batch[j], profile);
        }
      }

      // Delay between batches
      if (i + batchSize < providerIds.length) {
        await this.delay(1000);
      }
    }

    return profiles;
  }

  // ===========================================================================
  // MESSAGING
  // ===========================================================================

  /**
   * Send a message to a 1st degree connection
   */
  async sendMessage(recipientProviderId: string, text: string): Promise<UnipileMessage> {
    const response = await this.request<UnipileMessage>(
      'POST',
      '/chats/message',
      {
        account_id: this.config.accountId,
        attendee_provider_id: recipientProviderId,
        text,
      }
    );

    if (!response) {
      throw new Error('Failed to send message');
    }

    return response;
  }

  /**
   * Send an InMail to 2nd/3rd degree connection
   */
  async sendInMail(
    recipientProviderId: string,
    subject: string,
    text: string
  ): Promise<UnipileMessage> {
    const response = await this.request<UnipileMessage>(
      'POST',
      '/chats/inmail',
      {
        account_id: this.config.accountId,
        attendee_provider_id: recipientProviderId,
        subject,
        text,
      }
    );

    if (!response) {
      throw new Error('Failed to send InMail');
    }

    return response;
  }

  /**
   * Send a connection request
   */
  async sendConnectionRequest(
    recipientProviderId: string,
    note?: string
  ): Promise<{ status: string }> {
    const body: UnipileConnectionRequestParams = {
      account_id: this.config.accountId,
      provider_id: recipientProviderId,
    };

    if (note) {
      body.message = note.slice(0, 300); // LinkedIn limit
    }

    const response = await this.request<{ status: string }>(
      'POST',
      `/users/${recipientProviderId}/invite`,
      body
    );

    return response || { status: 'pending' };
  }

  // ===========================================================================
  // CONVERSATIONS
  // ===========================================================================

  /**
   * List all conversations
   */
  async listChats(limit?: number, cursor?: string): Promise<{
    items: UnipileChat[];
    cursor?: string;
  }> {
    let url = `/chats?account_id=${this.config.accountId}`;
    if (limit) url += `&limit=${limit}`;
    if (cursor) url += `&cursor=${cursor}`;

    const response = await this.request<{
      items: UnipileChat[];
      cursor?: string;
    }>('GET', url);

    return response || { items: [] };
  }

  /**
   * Get a specific chat
   */
  async getChat(chatId: string): Promise<UnipileChat | null> {
    return this.request<UnipileChat>(
      'GET',
      `/chats/${chatId}?account_id=${this.config.accountId}`
    );
  }

  /**
   * Get messages in a chat
   */
  async getChatMessages(
    chatId: string,
    limit?: number,
    cursor?: string
  ): Promise<{
    items: UnipileMessage[];
    cursor?: string;
  }> {
    let url = `/chats/${chatId}/messages?account_id=${this.config.accountId}`;
    if (limit) url += `&limit=${limit}`;
    if (cursor) url += `&cursor=${cursor}`;

    const response = await this.request<{
      items: UnipileMessage[];
      cursor?: string;
    }>('GET', url);

    return response || { items: [] };
  }

  /**
   * Reply to an existing conversation (chat)
   * This is the primary method for automated replies
   */
  async replyToChat(chatId: string, text: string): Promise<UnipileMessage> {
    const response = await this.request<UnipileMessage>(
      'POST',
      `/chats/${chatId}/messages`,
      {
        account_id: this.config.accountId,
        text,
      }
    );

    if (!response) {
      throw new Error('Failed to send reply');
    }

    return response;
  }

  /**
   * Start a new chat with a user (for 1st degree connections)
   */
  async startChat(
    attendeeProviderIds: string[],
    text: string,
    options?: {
      title?: string; // For group chats
      linkedinApi?: 'classic' | 'recruiter' | 'sales_navigator';
      isInMail?: boolean;
    }
  ): Promise<{
    chat_id: string;
    message: UnipileMessage;
  }> {
    const body: Record<string, unknown> = {
      account_id: this.config.accountId,
      attendees_ids: attendeeProviderIds,
      text,
    };

    if (options?.title) {
      body.title = options.title;
    }

    if (options?.linkedinApi || options?.isInMail) {
      body.linkedin = {
        api: options.linkedinApi || 'classic',
        inmail: options.isInMail || false,
      };
    }

    console.log('[UnipileClient] startChat request:', JSON.stringify(body, null, 2));

    const response = await this.request<Record<string, unknown>>('POST', '/chats', body);

    console.log('[UnipileClient] startChat raw response:', JSON.stringify(response, null, 2));

    if (!response) {
      throw new Error('Failed to start chat');
    }

    // The API response structure may vary - handle different field names
    const chatId = (response.chat_id || response.id || response.chatId) as string;
    const message = (response.message || response) as UnipileMessage;

    return {
      chat_id: chatId,
      message,
    };
  }

  /**
   * Find an existing chat with a specific user
   */
  async findChatWithUser(userProviderId: string): Promise<UnipileChat | null> {
    // Get recent chats and look for one with this user
    const { items: chats } = await this.listChats(50);

    for (const chat of chats) {
      // Check attendees first (some endpoints use this)
      const hasUserInAttendees = chat.attendees?.some(
        (a: UnipileChatAttendee) => a.provider_id === userProviderId || a.id === userProviderId
      );
      if (hasUserInAttendees) {
        return chat;
      }

      // Also check participants (other endpoints use this)
      const hasUserInParticipants = chat.participants?.some(
        (p: UnipileProfile) => p.provider_id === userProviderId || p.id === userProviderId
      );
      if (hasUserInParticipants) {
        return chat;
      }
    }

    return null;
  }

  /**
   * Send a message to a user - finds existing chat or starts new one
   */
  async messageUser(
    userProviderId: string,
    text: string,
    options?: {
      useInMail?: boolean;
      linkedinApi?: 'classic' | 'recruiter' | 'sales_navigator';
    }
  ): Promise<{
    chatId: string;
    message: UnipileMessage;
    isNewChat: boolean;
  }> {
    // First, try to find an existing chat
    const existingChat = await this.findChatWithUser(userProviderId);

    if (existingChat) {
      // Reply to existing chat
      const message = await this.replyToChat(existingChat.id, text);
      return {
        chatId: existingChat.id,
        message,
        isNewChat: false,
      };
    }

    // No existing chat - start a new one
    if (options?.useInMail) {
      // Use InMail for non-connections
      const message = await this.sendInMail(userProviderId, 'Following up', text);
      return {
        chatId: message.chat_id || '',
        message,
        isNewChat: true,
      };
    }

    // Start regular chat (1st degree only)
    const result = await this.startChat([userProviderId], text, {
      linkedinApi: options?.linkedinApi,
    });

    return {
      chatId: result.chat_id,
      message: result.message,
      isNewChat: true,
    };
  }

  // ===========================================================================
  // ACCOUNT
  // ===========================================================================

  /**
   * Get account status and limits
   */
  async getAccountStatus(): Promise<{
    id: string;
    provider: string;
    status: string;
    limits?: {
      searches_remaining?: number;
      messages_remaining?: number;
    };
  } | null> {
    return this.request(
      'GET',
      `/accounts/${this.config.accountId}`
    );
  }

  /**
   * List all connected accounts
   */
  async listAccounts(): Promise<Array<{
    id: string;
    provider: string;
    status: string;
  }>> {
    const response = await this.request<{
      items: Array<{
        id: string;
        provider: string;
        status: string;
      }>;
    }>('GET', '/accounts');

    return response?.items || [];
  }

  // ===========================================================================
  // HTTP CLIENT
  // ===========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-KEY': this.config.apiKey,
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        if (response.status === 429) {
          throw new Error('Unipile API rate limit exceeded');
        }

        const errorBody = await response.text();
        console.error(`[UnipileClient] API error: ${response.status}`, errorBody);
        throw new Error(`Unipile API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error(`[UnipileClient] Request failed: ${method} ${path}`, error);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

import type { LinkedInProfile, LinkedInExperience, LinkedInEducation } from './LinkedInClient.js';

/**
 * Convert UnipileProfile to LinkedInProfile for compatibility
 */
export function unipileToLinkedInProfile(profile: UnipileProfile): LinkedInProfile {
  const experience: LinkedInExperience[] = (profile.experiences || []).map((exp) => ({
    title: exp.title,
    company: exp.company_name,
    companyId: exp.company_id,
    companyLogoUrl: exp.company_logo,
    location: exp.location,
    startDate: exp.start_date,
    endDate: exp.end_date,
    isCurrent: exp.is_current || !exp.end_date,
    description: exp.description,
  }));

  const education: LinkedInEducation[] = (profile.educations || []).map((edu) => ({
    school: edu.school_name,
    schoolId: edu.school_id,
    degree: edu.degree,
    fieldOfStudy: edu.field_of_study,
    startYear: edu.start_year,
    endYear: edu.end_year,
  }));

  // Normalize skills to string array (API may return skill objects)
  const skills: string[] = Array.isArray(profile.skills)
    ? profile.skills.map(s => typeof s === 'string' ? s : (s as { name: string }).name)
    : [];

  return {
    id: uuid(),
    externalId: profile.provider_id,
    publicId: profile.public_identifier || '',
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    headline: profile.headline,
    summary: profile.summary,
    profileUrl: profile.profile_url || `https://linkedin.com/in/${profile.public_identifier}`,
    profilePictureUrl: profile.profile_picture_url,
    location: profile.location,
    country: profile.country,
    currentTitle: profile.current_title,
    currentCompany: profile.current_company,
    currentCompanyId: profile.current_company_id,
    experience,
    education,
    skills,
    connectionDegree: profile.connection_degree,
    connectionCount: profile.connections_count,
    mutualConnections: profile.mutual_connections,
    isOpenToWork: profile.is_open_to_work,
    isPremium: profile.is_premium,
    source: 'search',
  };
}

// =============================================================================
// SINGLETON
// =============================================================================

let unipileInstance: UnipileClient | null = null;

export function initializeUnipileClient(config: UnipileConfig): UnipileClient {
  unipileInstance = new UnipileClient(config);
  return unipileInstance;
}

export function getUnipileClient(): UnipileClient {
  if (!unipileInstance) {
    throw new Error('UnipileClient not initialized. Call initializeUnipileClient first.');
  }
  return unipileInstance;
}
