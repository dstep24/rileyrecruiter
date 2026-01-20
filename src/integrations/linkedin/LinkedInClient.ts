/**
 * LinkedIn Integration Client - Candidate Sourcing & Messaging
 *
 * Provides LinkedIn operations via Unipile or official RSC partner APIs.
 * Handles candidate search, profile enrichment, and InMail messaging.
 *
 * Key Operations:
 * - Search for candidates
 * - View profile details
 * - Send InMail/connection requests
 * - Track message status
 */

import { v4 as uuid } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export interface LinkedInConfig {
  provider: 'unipile' | 'rsc' | 'phantombuster';
  apiKey: string;
  baseUrl: string;
  accountId?: string; // For multi-account setups
  rateLimits?: RateLimits;
}

export interface RateLimits {
  searchesPerDay: number;
  viewsPerDay: number;
  connectionsPerDay: number;
  messagesPerDay: number;
}

const DEFAULT_RATE_LIMITS: RateLimits = {
  searchesPerDay: 100,
  viewsPerDay: 500,
  connectionsPerDay: 100,
  messagesPerDay: 150,
};

// LinkedIn Profile
export interface LinkedInProfile {
  id: string;
  externalId: string; // LinkedIn URN
  publicId: string; // Vanity URL slug

  // Basic Info
  firstName: string;
  lastName: string;
  headline?: string;
  summary?: string;
  profileUrl: string;
  profilePictureUrl?: string;

  // Location
  location?: string;
  country?: string;

  // Current Position
  currentTitle?: string;
  currentCompany?: string;
  currentCompanyId?: string;
  currentCompanyUrl?: string;

  // Experience
  experience: LinkedInExperience[];

  // Education
  education: LinkedInEducation[];

  // Skills
  skills: string[];

  // Network
  connectionDegree?: 1 | 2 | 3;
  connectionCount?: number;
  mutualConnections?: number;

  // Activity
  isOpenToWork?: boolean;
  isInfluencer?: boolean;
  isPremium?: boolean;

  // Metadata
  lastUpdated?: Date;
  source: 'search' | 'view' | 'import';
}

export interface LinkedInExperience {
  title: string;
  company: string;
  companyId?: string;
  companyLogoUrl?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  description?: string;
}

export interface LinkedInEducation {
  school: string;
  schoolId?: string;
  degree?: string;
  fieldOfStudy?: string;
  startYear?: number;
  endYear?: number;
}

// Search
export interface LinkedInSearchQuery {
  keywords?: string;
  title?: string;
  company?: string;
  location?: string;
  industry?: string;
  connectionDegree?: (1 | 2 | 3)[];
  yearsOfExperience?: { min?: number; max?: number };
  skills?: string[];
  schools?: string[];
  pastCompanies?: string[];
  openToWork?: boolean;
  limit?: number;
  offset?: number;
}

export interface LinkedInSearchResult {
  profiles: LinkedInProfile[];
  total: number;
  hasMore: boolean;
}

// Messaging
export interface LinkedInMessage {
  id: string;
  externalId: string;
  threadId: string;

  // Participants
  fromProfileId: string;
  toProfileId: string;

  // Content
  body: string;
  subject?: string; // For InMail

  // Type
  type: 'regular' | 'inmail' | 'connection_request';

  // Status
  status: 'sent' | 'delivered' | 'read' | 'replied' | 'failed';
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  repliedAt?: Date;

  // Metadata
  isSponsored?: boolean;
}

export interface LinkedInConversation {
  id: string;
  externalId: string;
  participants: LinkedInProfile[];
  lastMessage?: LinkedInMessage;
  messageCount: number;
  unreadCount: number;
  lastActivityAt: Date;
}

export interface SendMessageRequest {
  profileId: string;
  body: string;
  subject?: string; // Required for InMail
  type?: 'regular' | 'inmail' | 'connection_request';
  connectionNote?: string; // For connection requests
}

// Connection
export interface ConnectionRequest {
  id: string;
  profileId: string;
  note?: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  sentAt: Date;
  respondedAt?: Date;
}

// =============================================================================
// LINKEDIN CLIENT
// =============================================================================

export class LinkedInClient {
  private config: LinkedInConfig;
  private rateLimits: RateLimits;

  // Rate limit tracking
  private usageToday = {
    searches: 0,
    views: 0,
    connections: 0,
    messages: 0,
    lastReset: new Date(),
  };

  constructor(config: LinkedInConfig) {
    this.config = config;
    this.rateLimits = config.rateLimits || DEFAULT_RATE_LIMITS;
  }

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  /**
   * Search for LinkedIn profiles
   */
  async searchProfiles(query: LinkedInSearchQuery): Promise<LinkedInSearchResult> {
    this.checkRateLimit('searches');

    const params = this.buildSearchParams(query);

    const response = await this.request<LinkedInSearchResponse>(
      'POST',
      '/search',
      params
    );

    this.usageToday.searches++;

    return {
      profiles: (response?.results || []).map((r) => this.normalizeProfile(r, 'search')),
      total: response?.total || 0,
      hasMore: (response?.results?.length || 0) === (query.limit || 25),
    };
  }

  /**
   * Search with boolean query (advanced)
   */
  async searchWithBoolean(booleanQuery: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<LinkedInSearchResult> {
    this.checkRateLimit('searches');

    const response = await this.request<LinkedInSearchResponse>(
      'POST',
      '/search/boolean',
      {
        query: booleanQuery,
        limit: options?.limit || 25,
        start: options?.offset || 0,
      }
    );

    this.usageToday.searches++;

    return {
      profiles: (response?.results || []).map((r) => this.normalizeProfile(r, 'search')),
      total: response?.total || 0,
      hasMore: (response?.results?.length || 0) === (options?.limit || 25),
    };
  }

  private buildSearchParams(query: LinkedInSearchQuery): Record<string, unknown> {
    const params: Record<string, unknown> = {
      limit: query.limit || 25,
      start: query.offset || 0,
    };

    if (query.keywords) params.keywords = query.keywords;
    if (query.title) params.title = query.title;
    if (query.company) params.company = query.company;
    if (query.location) params.location = query.location;
    if (query.industry) params.industry = query.industry;
    if (query.connectionDegree) params.connectionDegree = query.connectionDegree;
    if (query.skills) params.skills = query.skills;
    if (query.schools) params.schools = query.schools;
    if (query.pastCompanies) params.pastCompanies = query.pastCompanies;
    if (query.openToWork !== undefined) params.openToWork = query.openToWork;

    if (query.yearsOfExperience) {
      if (query.yearsOfExperience.min) {
        params.yearsOfExperienceMin = query.yearsOfExperience.min;
      }
      if (query.yearsOfExperience.max) {
        params.yearsOfExperienceMax = query.yearsOfExperience.max;
      }
    }

    return params;
  }

  // ===========================================================================
  // PROFILE
  // ===========================================================================

  /**
   * Get full profile details
   */
  async getProfile(profileId: string): Promise<LinkedInProfile | null> {
    this.checkRateLimit('views');

    const response = await this.request<LinkedInProfileResponse>(
      'GET',
      `/profiles/${profileId}`
    );

    if (!response) return null;

    this.usageToday.views++;
    return this.normalizeProfile(response, 'view');
  }

  /**
   * Get profile by public ID (vanity URL)
   */
  async getProfileByPublicId(publicId: string): Promise<LinkedInProfile | null> {
    this.checkRateLimit('views');

    const response = await this.request<LinkedInProfileResponse>(
      'GET',
      `/profiles/public/${publicId}`
    );

    if (!response) return null;

    this.usageToday.views++;
    return this.normalizeProfile(response, 'view');
  }

  /**
   * Enrich profile with additional data
   */
  async enrichProfile(profile: LinkedInProfile): Promise<LinkedInProfile> {
    // If we only have basic info from search, fetch full profile
    if (profile.source === 'search' && profile.externalId) {
      const fullProfile = await this.getProfile(profile.externalId);
      if (fullProfile) {
        return {
          ...profile,
          ...fullProfile,
          id: profile.id, // Keep original internal ID
        };
      }
    }

    return profile;
  }

  /**
   * Batch get profiles
   */
  async batchGetProfiles(profileIds: string[]): Promise<Map<string, LinkedInProfile>> {
    const profiles = new Map<string, LinkedInProfile>();

    // Process in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < profileIds.length; i += batchSize) {
      const batch = profileIds.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (id) => {
          try {
            return await this.getProfile(id);
          } catch (error) {
            console.error(`[LinkedInClient] Error fetching profile ${id}:`, error);
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

      // Add delay between batches
      if (i + batchSize < profileIds.length) {
        await this.delay(1000);
      }
    }

    return profiles;
  }

  // ===========================================================================
  // MESSAGING
  // ===========================================================================

  /**
   * Send a message
   */
  async sendMessage(request: SendMessageRequest): Promise<LinkedInMessage> {
    this.checkRateLimit('messages');

    const messageType = request.type || 'regular';

    let endpoint: string;
    let body: Record<string, unknown>;

    if (messageType === 'connection_request') {
      endpoint = '/connections/request';
      body = {
        profileId: request.profileId,
        note: request.connectionNote || request.body,
      };
    } else if (messageType === 'inmail') {
      endpoint = '/messages/inmail';
      body = {
        recipientId: request.profileId,
        subject: request.subject,
        body: request.body,
      };
    } else {
      endpoint = '/messages';
      body = {
        recipientId: request.profileId,
        body: request.body,
      };
    }

    const response = await this.request<LinkedInMessageResponse>('POST', endpoint, body);

    this.usageToday.messages++;

    return this.normalizeMessage(response!);
  }

  /**
   * Get conversation with a profile
   */
  async getConversation(profileId: string): Promise<LinkedInConversation | null> {
    const response = await this.request<LinkedInConversationResponse>(
      'GET',
      `/conversations/profile/${profileId}`
    );

    if (!response) return null;
    return this.normalizeConversation(response);
  }

  /**
   * List conversations
   */
  async listConversations(options?: {
    limit?: number;
    offset?: number;
  }): Promise<LinkedInConversation[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('start', options.offset.toString());

    const response = await this.request<{ conversations: LinkedInConversationResponse[] }>(
      'GET',
      `/conversations?${params.toString()}`
    );

    return (response?.conversations || []).map((c) => this.normalizeConversation(c));
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(conversationId: string, limit?: number): Promise<LinkedInMessage[]> {
    const params = limit ? `?limit=${limit}` : '';
    const response = await this.request<{ messages: LinkedInMessageResponse[] }>(
      'GET',
      `/conversations/${conversationId}/messages${params}`
    );

    return (response?.messages || []).map((m) => this.normalizeMessage(m));
  }

  // ===========================================================================
  // CONNECTIONS
  // ===========================================================================

  /**
   * Send connection request
   */
  async sendConnectionRequest(
    profileId: string,
    note?: string
  ): Promise<ConnectionRequest> {
    this.checkRateLimit('connections');

    const response = await this.request<ConnectionRequestResponse>(
      'POST',
      '/connections/request',
      {
        profileId,
        note,
      }
    );

    this.usageToday.connections++;

    return {
      id: uuid(),
      profileId,
      note,
      status: 'pending',
      sentAt: new Date(),
    };
  }

  /**
   * Withdraw connection request
   */
  async withdrawConnectionRequest(profileId: string): Promise<void> {
    await this.request('DELETE', `/connections/request/${profileId}`);
  }

  /**
   * Check connection status
   */
  async getConnectionStatus(profileId: string): Promise<{
    isConnected: boolean;
    isPending: boolean;
    connectionDegree?: 1 | 2 | 3;
  }> {
    const response = await this.request<{
      status: string;
      degree?: number;
    }>('GET', `/connections/status/${profileId}`);

    return {
      isConnected: response?.status === 'connected',
      isPending: response?.status === 'pending',
      connectionDegree: response?.degree as 1 | 2 | 3 | undefined,
    };
  }

  // ===========================================================================
  // OPEN TO WORK
  // ===========================================================================

  /**
   * Check if profile is open to work
   */
  async checkOpenToWork(profileId: string): Promise<{
    isOpen: boolean;
    openToRoles?: string[];
    openToLocations?: string[];
    openToRemote?: boolean;
  }> {
    const response = await this.request<{
      openToWork: boolean;
      preferences?: {
        roles?: string[];
        locations?: string[];
        remote?: boolean;
      };
    }>('GET', `/profiles/${profileId}/open-to-work`);

    return {
      isOpen: response?.openToWork || false,
      openToRoles: response?.preferences?.roles,
      openToLocations: response?.preferences?.locations,
      openToRemote: response?.preferences?.remote,
    };
  }

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  private checkRateLimit(action: 'searches' | 'views' | 'connections' | 'messages'): void {
    this.resetDailyCountsIfNeeded();

    const limits: Record<typeof action, keyof RateLimits> = {
      searches: 'searchesPerDay',
      views: 'viewsPerDay',
      connections: 'connectionsPerDay',
      messages: 'messagesPerDay',
    };

    const limitKey = limits[action];
    const currentUsage = this.usageToday[action];
    const maxAllowed = this.rateLimits[limitKey];

    if (currentUsage >= maxAllowed) {
      throw new Error(
        `LinkedIn rate limit exceeded for ${action}. Used ${currentUsage}/${maxAllowed} today.`
      );
    }
  }

  private resetDailyCountsIfNeeded(): void {
    const now = new Date();
    const lastReset = this.usageToday.lastReset;

    if (
      now.getDate() !== lastReset.getDate() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    ) {
      this.usageToday = {
        searches: 0,
        views: 0,
        connections: 0,
        messages: 0,
        lastReset: now,
      };
    }
  }

  /**
   * Get current usage stats
   */
  getUsageStats(): {
    searches: { used: number; limit: number };
    views: { used: number; limit: number };
    connections: { used: number; limit: number };
    messages: { used: number; limit: number };
  } {
    this.resetDailyCountsIfNeeded();

    return {
      searches: {
        used: this.usageToday.searches,
        limit: this.rateLimits.searchesPerDay,
      },
      views: {
        used: this.usageToday.views,
        limit: this.rateLimits.viewsPerDay,
      },
      connections: {
        used: this.usageToday.connections,
        limit: this.rateLimits.connectionsPerDay,
      },
      messages: {
        used: this.usageToday.messages,
        limit: this.rateLimits.messagesPerDay,
      },
    };
  }

  // ===========================================================================
  // HTTP CLIENT
  // ===========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    if (this.config.accountId) {
      headers['x-account-id'] = this.config.accountId;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        if (response.status === 429) {
          throw new Error('LinkedIn API rate limit exceeded');
        }
        throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      console.error(`[LinkedInClient] Request failed: ${method} ${path}`, error);
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // NORMALIZERS
  // ===========================================================================

  private normalizeProfile(
    data: LinkedInProfileResponse,
    source: 'search' | 'view' | 'import'
  ): LinkedInProfile {
    // Normalize experience entries
    const experience: LinkedInExperience[] = (data.positions?.values || data.experience || []).map((exp) => ({
      title: exp.title || '',
      company: exp.companyName || exp.company || '',
      companyId: exp.companyId,
      companyLogoUrl: exp.companyLogo,
      location: exp.locationName || exp.location,
      startDate: exp.startDate
        ? `${exp.startDate.year}-${exp.startDate.month || 1}`
        : undefined,
      endDate: exp.endDate
        ? `${exp.endDate.year}-${exp.endDate.month || 1}`
        : undefined,
      isCurrent: !exp.endDate,
      description: exp.description,
    }));

    // Normalize education entries
    const education: LinkedInEducation[] = (data.educations?.values || data.education || []).map((edu) => ({
      school: edu.schoolName || edu.school || '',
      schoolId: edu.schoolId,
      degree: edu.degreeName || edu.degree,
      fieldOfStudy: edu.fieldOfStudy || edu.field,
      startYear: edu.startDate?.year,
      endYear: edu.endDate?.year,
    }));

    // Normalize skills - handle both string and object formats
    const skills: string[] = (data.skills || []).map((s) => {
      if (typeof s === 'object' && s.name) return s.name;
      if (typeof s === 'string') return s;
      return '';
    }).filter(Boolean);

    return {
      id: uuid(),
      externalId: data.urn || data.id || '',
      publicId: data.publicIdentifier || data.vanityName || '',
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      headline: data.headline,
      summary: data.summary,
      profileUrl: data.publicIdentifier
        ? `https://linkedin.com/in/${data.publicIdentifier}`
        : '',
      profilePictureUrl: data.profilePicture?.displayImage || data.pictureUrl,
      location: data.locationName || data.location?.name,
      country: data.geoCountryName || data.location?.country,
      currentTitle: data.positions?.values?.[0]?.title || data.currentTitle,
      currentCompany: data.positions?.values?.[0]?.companyName || data.currentCompany,
      currentCompanyId: data.positions?.values?.[0]?.companyId,
      experience,
      education,
      skills,
      connectionDegree: data.distance?.value || data.connectionDegree,
      connectionCount: data.numConnections,
      mutualConnections: data.sharedConnectionsCount,
      isOpenToWork: data.openToWork || data.isOpenToWork,
      isInfluencer: data.influencer,
      isPremium: data.premium,
      lastUpdated: data.lastModified ? new Date(data.lastModified) : undefined,
      source,
    };
  }

  private normalizeMessage(data: LinkedInMessageResponse): LinkedInMessage {
    const sentAtRaw = data.createdAt || data.sentAt;
    return {
      id: uuid(),
      externalId: data.id || data.urn || '',
      threadId: data.conversationId || data.threadId || '',
      fromProfileId: data.from?.profileId || data.senderId || '',
      toProfileId: data.to?.profileId || data.recipientId || '',
      body: data.body || data.text || '',
      subject: data.subject,
      type: data.messageType || 'regular',
      status: this.normalizeMessageStatus(data.deliveryReceipt),
      sentAt: sentAtRaw ? new Date(sentAtRaw) : new Date(),
      deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : undefined,
      readAt: data.seenAt ? new Date(data.seenAt) : undefined,
    };
  }

  private normalizeMessageStatus(receipt?: {
    delivered?: boolean;
    seen?: boolean;
  }): LinkedInMessage['status'] {
    if (receipt?.seen) return 'read';
    if (receipt?.delivered) return 'delivered';
    return 'sent';
  }

  private normalizeConversation(data: LinkedInConversationResponse): LinkedInConversation {
    const lastActivityRaw = data.lastActivityAt || data.updatedAt;
    return {
      id: uuid(),
      externalId: data.id || data.urn || '',
      participants: (data.participants || []).map((p) =>
        this.normalizeProfile(p, 'view')
      ),
      lastMessage: data.lastMessage
        ? this.normalizeMessage(data.lastMessage)
        : undefined,
      messageCount: data.totalEventCount || data.messageCount || 0,
      unreadCount: data.unreadCount || 0,
      lastActivityAt: lastActivityRaw ? new Date(lastActivityRaw) : new Date(),
    };
  }
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

interface LinkedInSearchResponse {
  results: LinkedInProfileResponse[];
  total: number;
}

interface LinkedInProfileResponse {
  id?: string;
  urn?: string;
  publicIdentifier?: string;
  vanityName?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  profilePicture?: { displayImage?: string };
  pictureUrl?: string;
  locationName?: string;
  location?: { name?: string; country?: string };
  geoCountryName?: string;
  currentTitle?: string;
  currentCompany?: string;
  positions?: {
    values?: Array<{
      title: string;
      companyName?: string;
      company?: string;
      companyId?: string;
      companyLogo?: string;
      locationName?: string;
      location?: string;
      startDate?: { year: number; month?: number };
      endDate?: { year: number; month?: number };
      description?: string;
    }>;
  };
  experience?: Array<{
    title: string;
    companyName?: string;
    company?: string;
    companyId?: string;
    companyLogo?: string;
    locationName?: string;
    location?: string;
    startDate?: { year: number; month?: number };
    endDate?: { year: number; month?: number };
    description?: string;
  }>;
  educations?: {
    values?: Array<{
      schoolName?: string;
      school?: string;
      schoolId?: string;
      degreeName?: string;
      degree?: string;
      fieldOfStudy?: string;
      field?: string;
      startDate?: { year: number };
      endDate?: { year: number };
    }>;
  };
  education?: Array<{
    schoolName?: string;
    school?: string;
    schoolId?: string;
    degreeName?: string;
    degree?: string;
    fieldOfStudy?: string;
    field?: string;
    startDate?: { year: number };
    endDate?: { year: number };
  }>;
  skills?: Array<{ name: string } | string>;
  distance?: { value?: 1 | 2 | 3 };
  connectionDegree?: 1 | 2 | 3;
  numConnections?: number;
  sharedConnectionsCount?: number;
  openToWork?: boolean;
  isOpenToWork?: boolean;
  influencer?: boolean;
  premium?: boolean;
  lastModified?: number;
}

interface LinkedInMessageResponse {
  id?: string;
  urn?: string;
  conversationId?: string;
  threadId?: string;
  from?: { profileId: string };
  to?: { profileId: string };
  senderId?: string;
  recipientId?: string;
  body?: string;
  text?: string;
  subject?: string;
  messageType?: 'regular' | 'inmail' | 'connection_request';
  deliveryReceipt?: { delivered?: boolean; seen?: boolean };
  createdAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  seenAt?: string;
}

interface LinkedInConversationResponse {
  id?: string;
  urn?: string;
  participants?: LinkedInProfileResponse[];
  lastMessage?: LinkedInMessageResponse;
  totalEventCount?: number;
  messageCount?: number;
  unreadCount?: number;
  lastActivityAt?: string;
  updatedAt?: string;
}

interface ConnectionRequestResponse {
  status: string;
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: LinkedInClient | null = null;

export function initializeLinkedInClient(config: LinkedInConfig): LinkedInClient {
  instance = new LinkedInClient(config);
  return instance;
}

export function getLinkedInClient(): LinkedInClient {
  if (!instance) {
    throw new Error('LinkedInClient not initialized. Call initializeLinkedInClient first.');
  }
  return instance;
}
