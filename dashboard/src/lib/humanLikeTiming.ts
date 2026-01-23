/**
 * Human-Like Timing System for LinkedIn Outreach
 *
 * Implements randomized delays and break patterns to mimic human behavior
 * and remain compliant with LinkedIn's Terms of Service.
 */

// Timing profiles
export type TimingProfile = 'conservative' | 'moderate' | 'aggressive';

export interface HumanLikeTimingConfig {
  // Per-message delays (randomized within range)
  minDelayMs: number;
  maxDelayMs: number;

  // Break patterns (every N messages, pause for longer)
  messagesPerBreak: {
    min: number;
    max: number;
  };
  breakDurationMs: {
    min: number;
    max: number;
  };

  // Daily limits (LinkedIn's approximate thresholds)
  dailyConnectionLimit: number;
  dailyInMailLimit: number;
  dailyMessageLimit: number;

  // Session management
  maxSessionDurationMinutes: number;
  sessionBreakMinutes: number;
}

// Pre-defined timing profiles
export const TIMING_PROFILES: Record<TimingProfile, HumanLikeTimingConfig> = {
  conservative: {
    minDelayMs: 30000,  // 30 seconds
    maxDelayMs: 90000,  // 90 seconds
    messagesPerBreak: { min: 3, max: 6 },
    breakDurationMs: { min: 180000, max: 420000 }, // 3-7 minutes
    dailyConnectionLimit: 50,
    dailyInMailLimit: 15,
    dailyMessageLimit: 100,
    maxSessionDurationMinutes: 30,
    sessionBreakMinutes: 20,
  },
  moderate: {
    minDelayMs: 15000,  // 15 seconds
    maxDelayMs: 45000,  // 45 seconds
    messagesPerBreak: { min: 5, max: 10 },
    breakDurationMs: { min: 120000, max: 300000 }, // 2-5 minutes
    dailyConnectionLimit: 80,
    dailyInMailLimit: 25,
    dailyMessageLimit: 150,
    maxSessionDurationMinutes: 45,
    sessionBreakMinutes: 15,
  },
  aggressive: {
    minDelayMs: 8000,   // 8 seconds
    maxDelayMs: 20000,  // 20 seconds
    messagesPerBreak: { min: 8, max: 15 },
    breakDurationMs: { min: 60000, max: 180000 }, // 1-3 minutes
    dailyConnectionLimit: 100,
    dailyInMailLimit: 30,
    dailyMessageLimit: 200,
    maxSessionDurationMinutes: 60,
    sessionBreakMinutes: 10,
  },
};

// Daily stats tracking
export interface DailyOutreachStats {
  date: string;  // "YYYY-MM-DD"
  connectionsSent: number;
  inMailsSent: number;
  messagesSent: number;
}

const DAILY_STATS_KEY = 'riley_daily_outreach_stats';

/**
 * Get a random delay within the specified range
 */
export function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check if we should take a break based on messages sent
 */
export function shouldTakeBreak(
  messagesSent: number,
  config: HumanLikeTimingConfig,
  lastBreakAt: number
): boolean {
  if (messagesSent === 0) return false;

  const messagesSinceBreak = messagesSent - lastBreakAt;
  const breakInterval = getRandomDelay(
    config.messagesPerBreak.min,
    config.messagesPerBreak.max
  );

  return messagesSinceBreak >= breakInterval;
}

/**
 * Get a random break duration
 */
export function getBreakDuration(config: HumanLikeTimingConfig): number {
  return getRandomDelay(
    config.breakDurationMs.min,
    config.breakDurationMs.max
  );
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Human-like delay with optional status updates
 * Returns false if cancelled
 */
export async function humanLikeDelay(
  messageIndex: number,
  config: HumanLikeTimingConfig,
  lastBreakAt: number,
  onStatusUpdate?: (status: string, remainingMs: number, isBreak: boolean) => void,
  shouldCancel?: () => boolean
): Promise<{ cancelled: boolean; tookBreak: boolean }> {
  // Check if we need a break
  if (shouldTakeBreak(messageIndex, config, lastBreakAt)) {
    const breakMs = getBreakDuration(config);

    // Countdown during break
    let remaining = breakMs;
    const breakInterval = 1000; // Update every second

    while (remaining > 0) {
      if (shouldCancel?.()) {
        return { cancelled: true, tookBreak: true };
      }

      onStatusUpdate?.(`Taking a break...`, remaining, true);
      await sleep(Math.min(breakInterval, remaining));
      remaining -= breakInterval;
    }

    return { cancelled: false, tookBreak: true };
  }

  // Normal inter-message delay (skip for first message)
  if (messageIndex > 0) {
    const delayMs = getRandomDelay(config.minDelayMs, config.maxDelayMs);

    // Countdown during delay
    let remaining = delayMs;
    const updateInterval = 1000; // Update every second

    while (remaining > 0) {
      if (shouldCancel?.()) {
        return { cancelled: true, tookBreak: false };
      }

      onStatusUpdate?.(`Waiting before next message...`, remaining, false);
      await sleep(Math.min(updateInterval, remaining));
      remaining -= updateInterval;
    }
  }

  return { cancelled: false, tookBreak: false };
}

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get daily outreach stats from localStorage
 */
export function getDailyStats(): DailyOutreachStats {
  try {
    const stored = localStorage.getItem(DAILY_STATS_KEY);
    if (stored) {
      const stats: DailyOutreachStats = JSON.parse(stored);
      // Check if it's today's stats
      if (stats.date === getTodayString()) {
        return stats;
      }
    }
  } catch {
    // Ignore localStorage errors
  }

  // Return fresh stats for today
  return {
    date: getTodayString(),
    connectionsSent: 0,
    inMailsSent: 0,
    messagesSent: 0,
  };
}

/**
 * Save daily outreach stats to localStorage
 */
export function saveDailyStats(stats: DailyOutreachStats): void {
  try {
    localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Increment connection count for today
 */
export function incrementConnectionCount(count: number = 1): DailyOutreachStats {
  const stats = getDailyStats();
  stats.connectionsSent += count;
  saveDailyStats(stats);
  return stats;
}

/**
 * Increment InMail count for today
 */
export function incrementInMailCount(count: number = 1): DailyOutreachStats {
  const stats = getDailyStats();
  stats.inMailsSent += count;
  saveDailyStats(stats);
  return stats;
}

/**
 * Increment message count for today
 */
export function incrementMessageCount(count: number = 1): DailyOutreachStats {
  const stats = getDailyStats();
  stats.messagesSent += count;
  saveDailyStats(stats);
  return stats;
}

/**
 * Check if we can send more connections today
 */
export function canSendConnection(config: HumanLikeTimingConfig): boolean {
  const stats = getDailyStats();
  return stats.connectionsSent < config.dailyConnectionLimit;
}

/**
 * Check if we can send more InMails today
 */
export function canSendInMail(config: HumanLikeTimingConfig): boolean {
  const stats = getDailyStats();
  return stats.inMailsSent < config.dailyInMailLimit;
}

/**
 * Check if we can send more messages today
 */
export function canSendMessage(config: HumanLikeTimingConfig): boolean {
  const stats = getDailyStats();
  return stats.messagesSent < config.dailyMessageLimit;
}

/**
 * Get remaining daily allowance for each type
 */
export function getRemainingAllowance(config: HumanLikeTimingConfig): {
  connections: number;
  inMails: number;
  messages: number;
} {
  const stats = getDailyStats();
  return {
    connections: Math.max(0, config.dailyConnectionLimit - stats.connectionsSent),
    inMails: Math.max(0, config.dailyInMailLimit - stats.inMailsSent),
    messages: Math.max(0, config.dailyMessageLimit - stats.messagesSent),
  };
}

/**
 * Format milliseconds as human-readable time (e.g., "2:15" for 2 min 15 sec)
 */
export function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Estimate total time for a batch of messages
 */
export function estimateBatchTime(
  messageCount: number,
  config: HumanLikeTimingConfig
): {
  minMs: number;
  maxMs: number;
  avgMs: number;
  estimatedBreaks: number;
} {
  // Average delay per message
  const avgDelayMs = (config.minDelayMs + config.maxDelayMs) / 2;
  const avgBreakMs = (config.breakDurationMs.min + config.breakDurationMs.max) / 2;
  const avgMessagesPerBreak = (config.messagesPerBreak.min + config.messagesPerBreak.max) / 2;

  // Estimate number of breaks
  const estimatedBreaks = Math.floor(messageCount / avgMessagesPerBreak);

  // Calculate time estimates
  const messageTime = (messageCount - 1) * avgDelayMs; // First message has no delay
  const breakTime = estimatedBreaks * avgBreakMs;

  const avgMs = messageTime + breakTime;

  // Min/max estimates (rough approximation)
  const minMs = (messageCount - 1) * config.minDelayMs +
                Math.floor(messageCount / config.messagesPerBreak.max) * config.breakDurationMs.min;
  const maxMs = (messageCount - 1) * config.maxDelayMs +
                Math.floor(messageCount / config.messagesPerBreak.min) * config.breakDurationMs.max;

  return {
    minMs,
    maxMs,
    avgMs,
    estimatedBreaks,
  };
}

/**
 * Format duration for display (e.g., "~25 minutes")
 */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);

  if (minutes < 1) {
    return 'less than a minute';
  } else if (minutes === 1) {
    return '~1 minute';
  } else if (minutes < 60) {
    return `~${minutes} minutes`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `~${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `~${hours}h ${remainingMinutes}m`;
  }
}
