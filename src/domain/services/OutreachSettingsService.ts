/**
 * Outreach Settings Service
 *
 * Manages settings related to outreach automation, including:
 * - Autopilot Mode: Whether to auto-send pitches after connection acceptance
 * - Follow-up configuration
 * - Timing settings
 * - AI auto-response settings
 * - Calendly integration settings
 *
 * Settings are persisted to database for reliability across restarts.
 * Falls back to in-memory cache for synchronous access patterns.
 */

import { prisma } from '../../infrastructure/database/prisma.js';
import type { OutreachSettings as PrismaOutreachSettings } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface OutreachSettings {
  autopilotMode: boolean;           // Auto-send pitches when connections accepted (legacy: autoPitchOnAcceptance)
  pitchDelayMinutes: number;        // Delay before auto-pitching (0 = immediate)
  followUpEnabled: boolean;         // Enable follow-up sequences
  followUpDays: number[];           // Days after pitch for follow-ups
  maxFollowUps: number;             // Max follow-up attempts
  // New Calendly-related settings
  autoRespondEnabled: boolean;      // AI auto-respond to messages
  includeCalendlyInFinal: boolean;  // Add Calendly link to final follow-up
  escalateToHumanKeywords: string[];// Keywords that trigger escalation
}

export interface OutreachSettingsUpdate {
  autopilotMode?: boolean;
  pitchDelayMinutes?: number;
  followUpEnabled?: boolean;
  followUpDays?: number[];
  maxFollowUps?: number;
  autoRespondEnabled?: boolean;
  includeCalendlyInFinal?: boolean;
  escalateToHumanKeywords?: string[];
}

const DEFAULT_SETTINGS: OutreachSettings = {
  autopilotMode: false,             // Default: require human approval
  pitchDelayMinutes: 0,
  followUpEnabled: true,
  followUpDays: [3, 7, 14],
  maxFollowUps: 3,
  autoRespondEnabled: true,
  includeCalendlyInFinal: true,
  escalateToHumanKeywords: ['salary', 'compensation', 'benefits'],
};

// =============================================================================
// SERVICE
// =============================================================================

class OutreachSettingsService {
  // In-memory cache for synchronous access
  private cache: Map<string, OutreachSettings> = new Map();

  /**
   * Get settings for a tenant (synchronous, uses cache).
   * For fresh data, use getSettingsAsync.
   */
  getSettings(tenantId: string = 'development'): OutreachSettings {
    const cached = this.cache.get(tenantId);
    if (cached) {
      return { ...cached };
    }
    // Return defaults if not cached
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Get settings from database (async, most up-to-date).
   */
  async getSettingsAsync(tenantId: string = 'development'): Promise<OutreachSettings> {
    try {
      const dbSettings = await prisma.outreachSettings.findUnique({
        where: { tenantId },
      });

      if (dbSettings) {
        const settings = this.mapFromDatabase(dbSettings);
        this.cache.set(tenantId, settings);
        return settings;
      }

      // Create default settings if not found
      const created = await this.createDefaultSettings(tenantId);
      return created;
    } catch (error) {
      console.error('[OutreachSettings] Database error, using defaults:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Update settings for a tenant (persists to database).
   */
  async updateSettingsAsync(
    tenantId: string = 'development',
    updates: OutreachSettingsUpdate
  ): Promise<OutreachSettings> {
    try {
      const dbData = this.mapToDatabase(updates);

      const updated = await prisma.outreachSettings.upsert({
        where: { tenantId },
        update: dbData,
        create: {
          tenantId,
          ...this.mapToDatabase({ ...DEFAULT_SETTINGS, ...updates }),
        },
      });

      const settings = this.mapFromDatabase(updated);
      this.cache.set(tenantId, settings);

      console.log(`[OutreachSettings] Updated settings for ${tenantId}`);
      return settings;
    } catch (error) {
      console.error('[OutreachSettings] Failed to update settings:', error);
      throw error;
    }
  }

  /**
   * Update settings (synchronous wrapper that updates cache immediately).
   * Persists asynchronously in the background.
   */
  updateSettings(tenantId: string = 'development', updates: Partial<OutreachSettings>): OutreachSettings {
    const current = this.getSettings(tenantId);
    const updated = { ...current, ...updates };
    this.cache.set(tenantId, updated);

    // Persist in background
    this.updateSettingsAsync(tenantId, updates).catch(error => {
      console.error('[OutreachSettings] Background persist failed:', error);
    });

    console.log(`[OutreachSettings] Updated settings for ${tenantId}:`, updated);
    return updated;
  }

  /**
   * Check if autopilot mode is enabled.
   */
  isAutopilotEnabled(tenantId: string = 'development'): boolean {
    return this.getSettings(tenantId).autopilotMode;
  }

  /**
   * Toggle autopilot mode.
   */
  setAutopilotMode(enabled: boolean, tenantId: string = 'development'): void {
    this.updateSettings(tenantId, { autopilotMode: enabled });
  }

  /**
   * Check if auto-respond is enabled.
   */
  isAutoRespondEnabled(tenantId: string = 'development'): boolean {
    return this.getSettings(tenantId).autoRespondEnabled;
  }

  /**
   * Load settings from database into cache (call on startup).
   */
  async loadFromDatabase(tenantId: string = 'development'): Promise<void> {
    await this.getSettingsAsync(tenantId);
    console.log(`[OutreachSettings] Loaded settings for ${tenantId} into cache`);
  }

  /**
   * Clear the cache (useful for testing).
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Create default settings in database.
   */
  private async createDefaultSettings(tenantId: string): Promise<OutreachSettings> {
    const created = await prisma.outreachSettings.create({
      data: {
        tenantId,
        ...this.mapToDatabase(DEFAULT_SETTINGS),
      },
    });

    const settings = this.mapFromDatabase(created);
    this.cache.set(tenantId, settings);
    return settings;
  }

  /**
   * Map from database model to service interface.
   */
  private mapFromDatabase(db: PrismaOutreachSettings): OutreachSettings {
    return {
      autopilotMode: db.autoPitchOnAcceptance,
      pitchDelayMinutes: db.pitchDelayMinutes,
      followUpEnabled: db.followUpEnabled,
      followUpDays: this.parseJsonArray(db.followUpDays, [3, 7, 14]),
      maxFollowUps: db.maxFollowUps,
      autoRespondEnabled: db.autoRespondEnabled,
      includeCalendlyInFinal: db.includeCalendlyInFinal,
      escalateToHumanKeywords: this.parseJsonArray(db.escalateToHumanKeywords, DEFAULT_SETTINGS.escalateToHumanKeywords),
    };
  }

  /**
   * Map from service interface to database model.
   */
  private mapToDatabase(settings: OutreachSettingsUpdate): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (settings.autopilotMode !== undefined) {
      data.autoPitchOnAcceptance = settings.autopilotMode;
    }
    if (settings.pitchDelayMinutes !== undefined) {
      data.pitchDelayMinutes = settings.pitchDelayMinutes;
    }
    if (settings.followUpEnabled !== undefined) {
      data.followUpEnabled = settings.followUpEnabled;
    }
    if (settings.followUpDays !== undefined) {
      data.followUpDays = settings.followUpDays;
    }
    if (settings.maxFollowUps !== undefined) {
      data.maxFollowUps = settings.maxFollowUps;
    }
    if (settings.autoRespondEnabled !== undefined) {
      data.autoRespondEnabled = settings.autoRespondEnabled;
    }
    if (settings.includeCalendlyInFinal !== undefined) {
      data.includeCalendlyInFinal = settings.includeCalendlyInFinal;
    }
    if (settings.escalateToHumanKeywords !== undefined) {
      data.escalateToHumanKeywords = settings.escalateToHumanKeywords;
    }

    return data;
  }

  /**
   * Safely parse JSON array from database.
   */
  private parseJsonArray<T>(value: unknown, defaultValue: T[]): T[] {
    if (Array.isArray(value)) {
      return value as T[];
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed as T[];
        }
      } catch {
        // Ignore parse errors
      }
    }
    return defaultValue;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: OutreachSettingsService | null = null;

export function getOutreachSettingsService(): OutreachSettingsService {
  if (!instance) {
    instance = new OutreachSettingsService();
  }
  return instance;
}

export function resetOutreachSettingsService(): void {
  instance = null;
}

export const outreachSettingsService = {
  get instance(): OutreachSettingsService {
    return getOutreachSettingsService();
  },
  getSettings: (tenantId?: string) => getOutreachSettingsService().getSettings(tenantId),
  getSettingsAsync: (tenantId?: string) => getOutreachSettingsService().getSettingsAsync(tenantId),
  updateSettings: (tenantId: string, updates: Partial<OutreachSettings>) =>
    getOutreachSettingsService().updateSettings(tenantId, updates),
  updateSettingsAsync: (tenantId: string, updates: OutreachSettingsUpdate) =>
    getOutreachSettingsService().updateSettingsAsync(tenantId, updates),
  isAutopilotEnabled: (tenantId?: string) => getOutreachSettingsService().isAutopilotEnabled(tenantId),
  isAutoRespondEnabled: (tenantId?: string) => getOutreachSettingsService().isAutoRespondEnabled(tenantId),
  setAutopilotMode: (enabled: boolean, tenantId?: string) =>
    getOutreachSettingsService().setAutopilotMode(enabled, tenantId),
  loadFromDatabase: (tenantId?: string) => getOutreachSettingsService().loadFromDatabase(tenantId),
  clearCache: () => getOutreachSettingsService().clearCache(),
};
