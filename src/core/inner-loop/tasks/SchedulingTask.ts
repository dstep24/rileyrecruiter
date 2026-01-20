/**
 * Scheduling Task - Interview Coordination and Reminder Generation
 *
 * Handles:
 * - Interview scheduling recommendations
 * - Calendar event creation
 * - Reminder message generation
 */

import {
  BaseTask,
  TaskContext,
  TaskGenerationResult,
  TaskValidationResult,
  TaskLearning,
  ValidationIssue,
  registerTask,
  GeneratedOutput,
} from './BaseTask.js';
import type { ClaudeClient } from '../../../integrations/llm/ClaudeClient.js';
import type { GuidelinesContent } from '../../../domain/entities/Guidelines.js';
import type { CriteriaContent } from '../../../domain/entities/Criteria.js';

// =============================================================================
// TYPES
// =============================================================================

interface SchedulingData {
  candidateName: string;
  candidateEmail: string;
  candidateTimezone?: string;
  interviewerName: string;
  interviewerEmail: string;
  interviewerTimezone?: string;
  roleTitle: string;
  companyName: string;
  interviewType: 'phone_screen' | 'technical' | 'behavioral' | 'final' | 'panel';
  duration: number; // minutes
  availableSlots?: TimeSlot[];
  candidatePreferences?: {
    preferredTimes?: string[];
    unavailableDates?: string[];
  };
  interviewerAvailability?: TimeSlot[];
  meetingLink?: string;
  location?: string;
  notes?: string;
}

interface TimeSlot {
  start: string; // ISO datetime
  end: string;
  timezone?: string;
}

interface SchedulingOutput {
  recommendedSlots: RecommendedSlot[];
  calendarEvent: CalendarEvent;
  candidateMessage: {
    subject: string;
    body: string;
  };
  interviewerMessage: {
    subject: string;
    body: string;
  };
  conflicts?: string[];
}

interface RecommendedSlot {
  slot: TimeSlot;
  score: number;
  reasoning: string;
}

interface CalendarEvent {
  title: string;
  description: string;
  start: string;
  end: string;
  timezone: string;
  attendees: string[];
  location?: string;
  meetingLink?: string;
}

// =============================================================================
// SCHEDULING TASK
// =============================================================================

export class SchedulingTask extends BaseTask {
  constructor(claude: ClaudeClient) {
    super(claude, 'SCHEDULE_INTERVIEW');
  }

  async generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult> {
    const data = context.data as unknown as SchedulingData;

    // Get scheduling workflow
    const workflow = this.findWorkflow(guidelines, 'interview_scheduling');

    // Get scheduling templates
    const candidateTemplate = this.findTemplate(guidelines, 'interview_confirmation_candidate', 'email');
    const interviewerTemplate = this.findTemplate(guidelines, 'interview_confirmation_interviewer', 'email');

    // Build the generation prompt
    const systemPrompt = this.buildSystemPrompt(guidelines);
    const userPrompt = this.buildUserPrompt(data, candidateTemplate, interviewerTemplate);

    // Generate the scheduling recommendation
    const response = await this.claude.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
      maxTokens: 2500,
    });

    const output = this.claude.parseJsonResponse<SchedulingOutput>(response);

    return {
      output: {
        type: 'interview_scheduling',
        content: output,
        format: 'structured',
        taskMetadata: {
          candidateId: context.candidateId,
          requisitionId: context.requisitionId,
          interviewType: data.interviewType,
          duration: data.duration,
        },
      },
      metadata: {
        recommendedSlotCount: output.recommendedSlots.length,
        hasConflicts: (output.conflicts?.length || 0) > 0,
      },
    };
  }

  async validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult> {
    const content = output.content as SchedulingOutput;
    const issues: ValidationIssue[] = [];
    let score = 1.0;

    // 1. Check for required components
    if (!content.recommendedSlots || content.recommendedSlots.length === 0) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'No recommended time slots provided',
      });
      score -= 0.4;
    }

    if (!content.calendarEvent) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Missing calendar event details',
      });
      score -= 0.3;
    }

    if (!content.candidateMessage || !content.candidateMessage.body) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Missing candidate notification message',
      });
      score -= 0.2;
    }

    // 2. Validate calendar event
    if (content.calendarEvent) {
      if (!content.calendarEvent.title) {
        issues.push({
          severity: 'warning',
          dimension: 'completeness',
          message: 'Calendar event missing title',
        });
        score -= 0.1;
      }

      if (!content.calendarEvent.attendees || content.calendarEvent.attendees.length < 2) {
        issues.push({
          severity: 'warning',
          dimension: 'completeness',
          message: 'Calendar event should have at least 2 attendees',
        });
        score -= 0.1;
      }

      // Check for valid dates
      const start = new Date(content.calendarEvent.start);
      const end = new Date(content.calendarEvent.end);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        issues.push({
          severity: 'error',
          dimension: 'format',
          message: 'Invalid date format in calendar event',
        });
        score -= 0.3;
      } else if (start >= end) {
        issues.push({
          severity: 'error',
          dimension: 'logic',
          message: 'Calendar event end time must be after start time',
        });
        score -= 0.3;
      }
    }

    // 3. Check message quality
    if (content.candidateMessage) {
      if (content.candidateMessage.body.length < 50) {
        issues.push({
          severity: 'warning',
          dimension: 'quality',
          message: 'Candidate message seems too brief',
        });
        score -= 0.05;
      }

      // Check for placeholder text
      if (/\{\{.*?\}\}|\[.*?\]/.test(content.candidateMessage.body)) {
        issues.push({
          severity: 'error',
          dimension: 'completeness',
          message: 'Candidate message contains unresolved placeholders',
        });
        score -= 0.2;
      }
    }

    // 4. Check for conflicts
    if (content.conflicts && content.conflicts.length > 0) {
      issues.push({
        severity: 'warning',
        dimension: 'scheduling',
        message: `${content.conflicts.length} scheduling conflicts identified`,
        evidence: content.conflicts.join('; '),
      });
    }

    return {
      valid: score >= 0.7 && !issues.some((i) => i.severity === 'error'),
      score: Math.max(0, Math.min(1, score)),
      issues,
    };
  }

  async extractLearnings(
    context: TaskContext,
    output: GeneratedOutput,
    validation: TaskValidationResult,
    guidelines: GuidelinesContent
  ): Promise<TaskLearning[]> {
    const learnings: TaskLearning[] = [];
    const content = output.content as SchedulingOutput;
    const data = context.data as unknown as SchedulingData;

    // Analyze scheduling patterns
    if (content.conflicts && content.conflicts.length > 0) {
      learnings.push({
        type: 'pattern_discovered',
        description: `Frequent scheduling conflicts for ${data.interviewType} interviews`,
      });
    }

    // Check for time zone issues
    for (const issue of validation.issues) {
      if (issue.dimension === 'scheduling') {
        learnings.push({
          type: 'guideline_update',
          description: 'May need to adjust scheduling buffer times',
          suggestedUpdate: {
            targetPath: 'workflows.interview_scheduling.buffer_minutes',
            operation: 'modify',
            newValue: 30,
            rationale: 'Scheduling conflicts suggest need for more buffer time',
          },
        });
      }
    }

    return learnings;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private buildSystemPrompt(guidelines: GuidelinesContent): string {
    // Get brand voice from templates
    const templateWithVoice = guidelines.templates.find((t) => t.brandVoice);
    const brandVoice = templateWithVoice?.brandVoice;

    return `You are Riley, an AI recruiting assistant coordinating interview scheduling.

## Guidelines
- Be considerate of time zones
- Provide multiple options when possible
- Include all relevant details in calendar events
- Write clear, professional confirmation messages

## Brand Voice
${brandVoice ? JSON.stringify(brandVoice, null, 2) : 'Professional and friendly'}

## Output Format
Return JSON with this structure:
{
  "recommendedSlots": [
    {
      "slot": { "start": "ISO datetime", "end": "ISO datetime", "timezone": "timezone" },
      "score": 0.0-1.0,
      "reasoning": "why this slot is good"
    }
  ],
  "calendarEvent": {
    "title": "Interview: Role - Candidate Name",
    "description": "interview details and prep notes",
    "start": "ISO datetime",
    "end": "ISO datetime",
    "timezone": "timezone",
    "attendees": ["email1", "email2"],
    "location": "physical location or null",
    "meetingLink": "video call link or null"
  },
  "candidateMessage": {
    "subject": "Interview Scheduled: Role at Company",
    "body": "confirmation message for candidate"
  },
  "interviewerMessage": {
    "subject": "Interview Scheduled: Candidate Name for Role",
    "body": "confirmation message for interviewer with candidate context"
  },
  "conflicts": ["any identified conflicts"]
}`;
  }

  private buildUserPrompt(
    data: SchedulingData,
    candidateTemplate: string | null,
    interviewerTemplate: string | null
  ): string {
    let prompt = `Schedule a ${data.interviewType} interview:

## Details
- Role: ${data.roleTitle} at ${data.companyName}
- Duration: ${data.duration} minutes
- Candidate: ${data.candidateName} (${data.candidateEmail})
  Timezone: ${data.candidateTimezone || 'Unknown'}
- Interviewer: ${data.interviewerName} (${data.interviewerEmail})
  Timezone: ${data.interviewerTimezone || 'Unknown'}

## Interview Type: ${data.interviewType}
`;

    if (data.availableSlots && data.availableSlots.length > 0) {
      prompt += `\n## Available Slots\n`;
      for (const slot of data.availableSlots) {
        prompt += `- ${slot.start} to ${slot.end}${slot.timezone ? ` (${slot.timezone})` : ''}\n`;
      }
    }

    if (data.candidatePreferences) {
      prompt += `\n## Candidate Preferences\n`;
      if (data.candidatePreferences.preferredTimes) {
        prompt += `Preferred: ${data.candidatePreferences.preferredTimes.join(', ')}\n`;
      }
      if (data.candidatePreferences.unavailableDates) {
        prompt += `Unavailable: ${data.candidatePreferences.unavailableDates.join(', ')}\n`;
      }
    }

    if (data.meetingLink) {
      prompt += `\n## Meeting Link\n${data.meetingLink}\n`;
    }

    if (data.location) {
      prompt += `\n## Location\n${data.location}\n`;
    }

    if (data.notes) {
      prompt += `\n## Notes\n${data.notes}\n`;
    }

    if (candidateTemplate) {
      prompt += `\n## Candidate Message Template (reference)\n${candidateTemplate}\n`;
    }

    if (interviewerTemplate) {
      prompt += `\n## Interviewer Message Template (reference)\n${interviewerTemplate}\n`;
    }

    prompt += `\nGenerate the scheduling details, calendar event, and confirmation messages.`;

    return prompt;
  }
}

// =============================================================================
// REMINDER TASK
// =============================================================================

export class ReminderTask extends BaseTask {
  constructor(claude: ClaudeClient) {
    super(claude, 'SEND_REMINDER');
  }

  async generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult> {
    const data = context.data as unknown as {
      recipientName: string;
      recipientEmail: string;
      eventType: 'interview' | 'follow_up' | 'deadline';
      eventDetails: Record<string, unknown>;
      timeBefore: string; // e.g., "24h", "1h"
    };

    const template = this.findTemplate(guidelines, `${data.eventType}_reminder`, 'email');

    const response = await this.claude.chat({
      systemPrompt: `You are Riley, generating reminder messages.
Return JSON: { "subject": "string", "body": "string", "urgency": "low|medium|high" }`,
      prompt: `Generate a ${data.timeBefore} reminder for ${data.recipientName}:

Event Type: ${data.eventType}
Details: ${JSON.stringify(data.eventDetails, null, 2)}

${template ? `Template reference: ${template}` : ''}`,
      temperature: 0.3,
      maxTokens: 1000,
    });

    const output = this.claude.parseJsonResponse(response);

    return {
      output: {
        type: 'reminder_message',
        content: output,
        format: 'structured',
        taskMetadata: {
          eventType: data.eventType,
          timeBefore: data.timeBefore,
        },
      },
      metadata: {},
    };
  }

  async validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult> {
    const content = output.content as { subject: string; body: string };
    const issues: ValidationIssue[] = [];
    let score = 1.0;

    if (!content.subject) {
      issues.push({ severity: 'error', dimension: 'completeness', message: 'Missing subject' });
      score -= 0.3;
    }

    if (!content.body || content.body.length < 20) {
      issues.push({ severity: 'error', dimension: 'completeness', message: 'Body too short' });
      score -= 0.3;
    }

    return { valid: score >= 0.7, score, issues };
  }

  async extractLearnings(): Promise<TaskLearning[]> {
    return [];
  }
}

// =============================================================================
// REGISTRATION
// =============================================================================

registerTask('SCHEDULE_INTERVIEW', SchedulingTask);
registerTask('SEND_REMINDER', ReminderTask);
