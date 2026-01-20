/**
 * Slack Bot Integration - Quick Approvals
 *
 * Enables teleoperators to review and approve tasks directly from Slack.
 * Provides notification cards with draft content preview and inline actions.
 *
 * Key Features:
 * - Notification cards for pending approvals
 * - Approve/Reject/Edit buttons inline
 * - Links to dashboard for complex cases
 * - Urgent escalation alerts
 */

import { getApprovalQueue, QueuedTask, ApprovalDecision } from '../../core/outer-loop/ApprovalQueue.js';
import type { Priority, EscalationReason } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SlackConfig {
  botToken: string;
  signingSecret: string;
  appToken?: string; // For socket mode
  channels: {
    approvals: string;
    urgent: string;
    analytics: string;
  };
  dashboardUrl: string;
}

export interface SlackMessage {
  channel: string;
  blocks: SlackBlock[];
  text: string; // Fallback text
  thread_ts?: string;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: SlackElement[];
  accessory?: SlackElement;
  fields?: Array<{ type: string; text: string }>;
  block_id?: string;
}

export interface SlackElement {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  action_id?: string;
  value?: string;
  url?: string;
  style?: 'primary' | 'danger';
}

export interface SlackInteraction {
  type: string;
  user: { id: string; name: string };
  actions: Array<{
    action_id: string;
    value: string;
    block_id: string;
  }>;
  response_url: string;
  trigger_id: string;
}

// =============================================================================
// SLACK BOT
// =============================================================================

export class SlackBot {
  private config: SlackConfig;
  private approvalQueue = getApprovalQueue();

  constructor(config: SlackConfig) {
    this.config = config;
  }

  // ===========================================================================
  // NOTIFICATIONS
  // ===========================================================================

  /**
   * Send a task approval notification to Slack
   */
  async sendApprovalNotification(task: QueuedTask): Promise<void> {
    const channel = this.getChannelForTask(task);
    const message = this.buildApprovalMessage(task);

    await this.postMessage({
      channel,
      blocks: message,
      text: `New ${task.type} task pending approval for ${task.candidateName || 'Unknown'}`,
    });

    console.log(`[SlackBot] Sent approval notification for task ${task.id} to ${channel}`);
  }

  /**
   * Send an urgent escalation alert
   */
  async sendUrgentAlert(task: QueuedTask, reason: string): Promise<void> {
    const message = this.buildUrgentAlertMessage(task, reason);

    await this.postMessage({
      channel: this.config.channels.urgent,
      blocks: message,
      text: `🚨 URGENT: ${reason} - Task ${task.id} requires immediate attention`,
    });

    console.log(`[SlackBot] Sent urgent alert for task ${task.id}`);
  }

  /**
   * Send a daily summary
   */
  async sendDailySummary(stats: {
    totalApproved: number;
    totalRejected: number;
    pending: number;
    avgResponseTime: number;
  }): Promise<void> {
    const message = this.buildSummaryMessage(stats);

    await this.postMessage({
      channel: this.config.channels.analytics,
      blocks: message,
      text: `Daily Summary: ${stats.totalApproved} approved, ${stats.totalRejected} rejected, ${stats.pending} pending`,
    });
  }

  // ===========================================================================
  // INTERACTION HANDLERS
  // ===========================================================================

  /**
   * Handle button click interactions
   */
  async handleInteraction(interaction: SlackInteraction): Promise<void> {
    const action = interaction.actions[0];
    const [actionType, taskId] = action.action_id.split(':');

    switch (actionType) {
      case 'approve':
        await this.handleApprove(taskId, interaction);
        break;
      case 'reject':
        await this.handleReject(taskId, interaction);
        break;
      case 'view':
        // View action just opens URL, no handler needed
        break;
      default:
        console.warn(`[SlackBot] Unknown action type: ${actionType}`);
    }
  }

  private async handleApprove(
    taskId: string,
    interaction: SlackInteraction
  ): Promise<void> {
    const decision: ApprovalDecision = {
      taskId,
      decision: 'approve',
      teleoperatorId: interaction.user.id,
    };

    try {
      await this.approvalQueue.processDecision(decision);

      // Update the message to show approval
      await this.updateMessage(interaction.response_url, {
        text: `✅ Approved by ${interaction.user.name}`,
        replace_original: true,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Task Approved*\nApproved by <@${interaction.user.id}> at ${new Date().toLocaleString()}`,
            },
          },
        ],
      });

      console.log(`[SlackBot] Task ${taskId} approved by ${interaction.user.id}`);
    } catch (error) {
      await this.updateMessage(interaction.response_url, {
        text: `❌ Failed to approve: ${error instanceof Error ? error.message : 'Unknown error'}`,
        replace_original: false,
      });
    }
  }

  private async handleReject(
    taskId: string,
    interaction: SlackInteraction
  ): Promise<void> {
    // For rejection, we'd typically open a modal to get the reason
    // For now, use a default reason
    const decision: ApprovalDecision = {
      taskId,
      decision: 'reject',
      teleoperatorId: interaction.user.id,
      rejectionReason: 'Rejected via Slack (no reason provided)',
    };

    try {
      await this.approvalQueue.processDecision(decision);

      await this.updateMessage(interaction.response_url, {
        text: `❌ Rejected by ${interaction.user.name}`,
        replace_original: true,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❌ *Task Rejected*\nRejected by <@${interaction.user.id}> at ${new Date().toLocaleString()}`,
            },
          },
        ],
      });

      console.log(`[SlackBot] Task ${taskId} rejected by ${interaction.user.id}`);
    } catch (error) {
      await this.updateMessage(interaction.response_url, {
        text: `❌ Failed to reject: ${error instanceof Error ? error.message : 'Unknown error'}`,
        replace_original: false,
      });
    }
  }

  // ===========================================================================
  // MESSAGE BUILDERS
  // ===========================================================================

  private buildApprovalMessage(task: QueuedTask): SlackBlock[] {
    const priorityEmoji = this.getPriorityEmoji(task.priority);
    const escalationText = task.escalationReason
      ? `\n⚠️ *Escalation:* ${this.formatEscalationReason(task.escalationReason)}`
      : '';

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${priorityEmoji} ${task.type.replace(/_/g, ' ')}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Candidate:*\n${task.candidateName || 'Unknown'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Position:*\n${task.requisitionTitle || 'Unknown'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Confidence:*\n${((task.confidenceScore || 0) * 100).toFixed(0)}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Iterations:*\n${task.innerLoopIterations || 0}`,
          },
        ],
      },
    ];

    // Add content preview
    if (task.payload) {
      const preview = this.formatPayloadPreview(task.type, task.payload);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Preview:*\n\`\`\`${preview}\`\`\`${escalationText}`,
        },
      });
    }

    // Add action buttons
    blocks.push({
      type: 'actions',
      block_id: `task_actions_${task.id}`,
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Approve',
            emoji: true,
          },
          style: 'primary',
          action_id: `approve:${task.id}`,
          value: task.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❌ Reject',
            emoji: true,
          },
          style: 'danger',
          action_id: `reject:${task.id}`,
          value: task.id,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔗 View in Dashboard',
            emoji: true,
          },
          action_id: `view:${task.id}`,
          url: `${this.config.dashboardUrl}/queue?task=${task.id}`,
        },
      ],
    });

    // Add context
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Task ID: ${task.id} | Queued: ${this.formatTimestamp(task.queuedAt)}`,
        },
      ],
    } as unknown as SlackBlock);

    return blocks;
  }

  private buildUrgentAlertMessage(task: QueuedTask, reason: string): SlackBlock[] {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 URGENT ESCALATION',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason:* ${reason}\n*Task:* ${task.type.replace(/_/g, ' ')}\n*Candidate:* ${task.candidateName || 'Unknown'}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in Dashboard',
              emoji: true,
            },
            style: 'primary',
            url: `${this.config.dashboardUrl}/queue?task=${task.id}`,
            action_id: `view_urgent:${task.id}`,
          },
        ],
      },
    ];
  }

  private buildSummaryMessage(stats: {
    totalApproved: number;
    totalRejected: number;
    pending: number;
    avgResponseTime: number;
  }): SlackBlock[] {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Daily Summary',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Approved:*\n${stats.totalApproved} ✅`,
          },
          {
            type: 'mrkdwn',
            text: `*Rejected:*\n${stats.totalRejected} ❌`,
          },
          {
            type: 'mrkdwn',
            text: `*Pending:*\n${stats.pending} ⏳`,
          },
          {
            type: 'mrkdwn',
            text: `*Avg Response Time:*\n${stats.avgResponseTime.toFixed(1)} min`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Full Analytics',
              emoji: true,
            },
            url: `${this.config.dashboardUrl}/analytics`,
            action_id: 'view_analytics',
          },
        ],
      },
    ];
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private getChannelForTask(task: QueuedTask): string {
    if (task.priority === 'URGENT') {
      return this.config.channels.urgent;
    }
    return this.config.channels.approvals;
  }

  private getPriorityEmoji(priority: Priority): string {
    switch (priority) {
      case 'URGENT':
        return '🔴';
      case 'HIGH':
        return '🟠';
      case 'MEDIUM':
        return '🟡';
      case 'LOW':
        return '🟢';
      default:
        return '⚪';
    }
  }

  private formatEscalationReason(reason: EscalationReason): string {
    const labels: Record<EscalationReason, string> = {
      SENSITIVE_COMMUNICATION: 'Sensitive Communication',
      BUDGET_DISCUSSION: 'Budget Discussion',
      OFFER_NEGOTIATION: 'Offer Negotiation',
      CANDIDATE_COMPLAINT: 'Candidate Complaint',
      EDGE_CASE: 'Edge Case',
      LOW_CONFIDENCE: 'Low Confidence',
      POLICY_VIOLATION_RISK: 'Policy Violation Risk',
      FIRST_CONTACT_VIP: 'First Contact with VIP',
      MANUAL_REVIEW_REQUESTED: 'Manual Review Requested',
    };
    return labels[reason] || reason;
  }

  private formatPayloadPreview(type: string, payload: unknown): string {
    const p = payload as Record<string, unknown>;

    switch (type) {
      case 'SEND_EMAIL':
        return `To: ${p.to}\nSubject: ${p.subject}\n\n${String(p.body || '').slice(0, 200)}...`;
      case 'SEND_LINKEDIN_MESSAGE':
        return String(p.message || '').slice(0, 300);
      case 'SCHEDULE_INTERVIEW':
        return `Type: ${p.interviewType}\nDuration: ${p.duration} min\nSlots: ${(p.proposedSlots as string[] || []).join(', ')}`;
      case 'PREPARE_OFFER':
        return `Salary: $${p.salary}\nBonus: ${p.bonus}\nEquity: ${p.equity}`;
      default:
        return JSON.stringify(payload, null, 2).slice(0, 300);
    }
  }

  private formatTimestamp(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    return date.toLocaleDateString();
  }

  // ===========================================================================
  // API CALLS (Stubs - would use @slack/bolt in production)
  // ===========================================================================

  private async postMessage(message: SlackMessage): Promise<void> {
    // In production, would use Slack Web API:
    // await this.client.chat.postMessage(message);
    console.log('[SlackBot] Would post message:', JSON.stringify(message, null, 2));
  }

  private async updateMessage(
    responseUrl: string,
    update: { text: string; replace_original?: boolean; blocks?: SlackBlock[] }
  ): Promise<void> {
    // In production, would POST to response_url:
    // await fetch(responseUrl, { method: 'POST', body: JSON.stringify(update) });
    console.log('[SlackBot] Would update message at', responseUrl, ':', update);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: SlackBot | null = null;

export function initializeSlackBot(config: SlackConfig): SlackBot {
  instance = new SlackBot(config);
  return instance;
}

export function getSlackBot(): SlackBot {
  if (!instance) {
    throw new Error('SlackBot not initialized. Call initializeSlackBot first.');
  }
  return instance;
}

// =============================================================================
// EXPRESS ROUTES (for webhook handling)
// =============================================================================

/**
 * Create Express routes for Slack integration
 * Usage: app.use('/slack', createSlackRoutes())
 */
export function createSlackRoutes() {
  // In production, would return Express router with:
  // - POST /events - for Slack events
  // - POST /interactions - for button clicks
  // - POST /commands - for slash commands

  return {
    handleEvents: async (req: unknown, res: unknown) => {
      // Handle Slack events
    },
    handleInteractions: async (req: unknown, res: unknown) => {
      // Handle button clicks
    },
  };
}
