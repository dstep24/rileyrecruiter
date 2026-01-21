/**
 * Outreach Settings Service
 *
 * Manages settings related to outreach automation, including:
 * - Autopilot Mode: Whether to auto-send pitches after connection acceptance
 * - Follow-up configuration
 * - Timing settings
 *
 * Settings are stored in-memory for now but could be persisted to database.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface OutreachSettings {
  autopilotMode: boolean;           // Auto-send pitches when connections accepted
  pitchDelayMinutes: number;        // Delay before auto-pitching (0 = immediate)
  followUpEnabled: boolean;         // Enable follow-up sequences
  followUpDays: number[];           // Days after pitch for follow-ups
  maxFollowUps: number;             // Max follow-up attempts
}

const DEFAULT_SETTINGS: OutreachSettings = {
  autopilotMode: false,             // Default: require human approval
  pitchDelayMinutes: 0,
  followUpEnabled: true,
  followUpDays: [3, 7, 14],
  maxFollowUps: 3,
};

// =============================================================================
// SERVICE
// =============================================================================

class OutreachSettingsService {
  // In-memory storage keyed by tenant
  private settings: Map<string, OutreachSettings> = new Map();

  /**
   * Get settings for a tenant
   */
  getSettings(tenantId: string = 'development'): OutreachSettings {
    const existing = this.settings.get(tenantId);
    if (existing) {
      return { ...existing };
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Update settings for a tenant
   */
  updateSettings(tenantId: string = 'development', updates: Partial<OutreachSettings>): OutreachSettings {
    const current = this.getSettings(tenantId);
    const updated = { ...current, ...updates };
    this.settings.set(tenantId, updated);
    console.log(`[OutreachSettings] Updated settings for ${tenantId}:`, updated);
    return updated;
  }

  /**
   * Check if autopilot mode is enabled
   */
  isAutopilotEnabled(tenantId: string = 'development'): boolean {
    return this.getSettings(tenantId).autopilotMode;
  }

  /**
   * Toggle autopilot mode
   */
  setAutopilotMode(enabled: boolean, tenantId: string = 'development'): void {
    this.updateSettings(tenantId, { autopilotMode: enabled });
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

export const outreachSettingsService = {
  get instance(): OutreachSettingsService {
    return getOutreachSettingsService();
  },
  getSettings: (tenantId?: string) => getOutreachSettingsService().getSettings(tenantId),
  updateSettings: (tenantId: string, updates: Partial<OutreachSettings>) =>
    getOutreachSettingsService().updateSettings(tenantId, updates),
  isAutopilotEnabled: (tenantId?: string) => getOutreachSettingsService().isAutopilotEnabled(tenantId),
  setAutopilotMode: (enabled: boolean, tenantId?: string) =>
    getOutreachSettingsService().setAutopilotMode(enabled, tenantId),
};
