/**
 * Scheduling Service - Interview Coordination & Calendar Management
 *
 * Handles interview scheduling, availability management, timezone handling,
 * reminders, and rescheduling workflows.
 *
 * Key Responsibilities:
 * - Find optimal interview slots
 * - Coordinate multiple calendars
 * - Handle timezone conversions
 * - Send reminders and confirmations
 * - Manage rescheduling requests
 */

import { v4 as uuid } from 'uuid';
import { ClaudeClient, getClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import type { Candidate, JobRequisition } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TimeSlot {
  id: string;
  start: Date;
  end: Date;
  duration: number; // minutes
  timezone: string;
  available: boolean;
  score?: number; // Preference score 0-100
}

export interface InterviewRequest {
  id: string;
  tenantId: string;
  candidateId: string;
  requisitionId: string;

  // Interview details
  type: InterviewType;
  duration: number; // minutes
  interviewers: Interviewer[];

  // Scheduling
  proposedSlots: TimeSlot[];
  selectedSlot?: TimeSlot;
  status: InterviewStatus;

  // Location
  format: 'in_person' | 'video' | 'phone';
  location?: string; // Office address or video link
  meetingLink?: string;

  // Communication
  candidateTimezone: string;
  interviewerTimezones: string[];

  // Tracking
  createdAt: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
}

export type InterviewType =
  | 'phone_screen'
  | 'technical'
  | 'behavioral'
  | 'system_design'
  | 'coding'
  | 'culture_fit'
  | 'hiring_manager'
  | 'team_meet'
  | 'executive'
  | 'onsite';

export type InterviewStatus =
  | 'pending_slots' // Waiting for availability
  | 'slots_proposed' // Sent slots to candidate
  | 'pending_confirmation' // Candidate selected, awaiting final confirm
  | 'confirmed' // Locked in
  | 'reminder_sent' // Pre-interview reminder sent
  | 'completed' // Interview done
  | 'cancelled' // Cancelled
  | 'rescheduling' // In process of rescheduling
  | 'no_show'; // Candidate didn't show

export interface Interviewer {
  id: string;
  name: string;
  email: string;
  role: string;
  timezone: string;
  calendarId?: string;
  isRequired: boolean;
}

export interface CalendarEvent {
  id: string;
  interviewId: string;
  calendarId: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
  attendees: string[];
  location?: string;
  meetingLink?: string;
  reminders: Array<{
    type: 'email' | 'popup';
    minutesBefore: number;
  }>;
}

export interface ReminderConfig {
  candidateReminders: number[]; // Minutes before
  interviewerReminders: number[];
  includePrep: boolean;
}

export interface SchedulingConfig {
  tenantId: string;
  businessHours: {
    start: number; // Hour (0-23)
    end: number;
    days: number[]; // 0=Sunday, 1=Monday, etc.
  };
  bufferMinutes: number; // Buffer between interviews
  defaultDuration: Record<InterviewType, number>;
  defaultReminders: ReminderConfig;
}

// =============================================================================
// SCHEDULING SERVICE
// =============================================================================

export class SchedulingService {
  private claude: ClaudeClient;
  private defaultConfig: SchedulingConfig = {
    tenantId: '',
    businessHours: {
      start: 9,
      end: 17,
      days: [1, 2, 3, 4, 5], // Monday-Friday
    },
    bufferMinutes: 15,
    defaultDuration: {
      phone_screen: 30,
      technical: 60,
      behavioral: 45,
      system_design: 60,
      coding: 90,
      culture_fit: 45,
      hiring_manager: 60,
      team_meet: 30,
      executive: 45,
      onsite: 240,
    },
    defaultReminders: {
      candidateReminders: [1440, 60], // 24h and 1h before
      interviewerReminders: [60, 15], // 1h and 15min before
      includePrep: true,
    },
  };

  constructor(claude?: ClaudeClient) {
    this.claude = claude || getClaudeClient();
  }

  // ===========================================================================
  // AVAILABILITY FINDING
  // ===========================================================================

  /**
   * Find available slots across multiple calendars
   */
  async findAvailableSlots(
    interviewers: Interviewer[],
    duration: number,
    config: SchedulingConfig,
    options: {
      startDate?: Date;
      endDate?: Date;
      candidateTimezone?: string;
      preferredTimes?: string[]; // e.g., ["morning", "afternoon"]
      count?: number;
    } = {}
  ): Promise<TimeSlot[]> {
    const {
      startDate = new Date(),
      endDate = this.addDays(startDate, 14),
      candidateTimezone = 'UTC',
      preferredTimes = [],
      count = 5,
    } = options;

    // 1. Get busy times from all interviewers
    const busyTimes = await this.getBusyTimes(interviewers, startDate, endDate);

    // 2. Generate potential slots
    const potentialSlots = this.generateSlots(
      startDate,
      endDate,
      duration,
      config.businessHours,
      config.bufferMinutes
    );

    // 3. Filter out busy times
    const availableSlots = this.filterBusySlots(potentialSlots, busyTimes);

    // 4. Score slots based on preferences
    const scoredSlots = await this.scoreSlots(
      availableSlots,
      candidateTimezone,
      preferredTimes,
      interviewers
    );

    // 5. Return top slots
    return scoredSlots
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, count);
  }

  private generateSlots(
    startDate: Date,
    endDate: Date,
    duration: number,
    businessHours: SchedulingConfig['businessHours'],
    buffer: number
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const current = new Date(startDate);

    while (current < endDate) {
      const dayOfWeek = current.getDay();

      if (businessHours.days.includes(dayOfWeek)) {
        // Set to start of business hours
        const dayStart = new Date(current);
        dayStart.setHours(businessHours.start, 0, 0, 0);

        const dayEnd = new Date(current);
        dayEnd.setHours(businessHours.end, 0, 0, 0);

        // Generate slots for this day
        const slotStart = new Date(dayStart);
        while (slotStart.getTime() + duration * 60000 <= dayEnd.getTime()) {
          slots.push({
            id: uuid(),
            start: new Date(slotStart),
            end: new Date(slotStart.getTime() + duration * 60000),
            duration,
            timezone: 'UTC', // Will convert later
            available: true,
          });

          // Move to next potential slot (with buffer)
          slotStart.setTime(slotStart.getTime() + (duration + buffer) * 60000);
        }
      }

      // Move to next day
      current.setDate(current.getDate() + 1);
    }

    return slots;
  }

  private async getBusyTimes(
    interviewers: Interviewer[],
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ start: Date; end: Date }>> {
    // In production, would query calendar API for each interviewer
    // For now, return mock busy times
    const busyTimes: Array<{ start: Date; end: Date }> = [];

    // Simulate some busy slots
    for (const interviewer of interviewers) {
      const randomBusy = Math.floor(Math.random() * 5) + 2;
      for (let i = 0; i < randomBusy; i++) {
        const busyStart = new Date(
          startDate.getTime() +
            Math.random() * (endDate.getTime() - startDate.getTime())
        );
        busyStart.setMinutes(0, 0, 0);
        const busyEnd = new Date(busyStart.getTime() + 60 * 60000); // 1 hour
        busyTimes.push({ start: busyStart, end: busyEnd });
      }
    }

    return busyTimes;
  }

  private filterBusySlots(
    slots: TimeSlot[],
    busyTimes: Array<{ start: Date; end: Date }>
  ): TimeSlot[] {
    return slots.filter((slot) => {
      return !busyTimes.some((busy) => {
        // Check for overlap
        return slot.start < busy.end && slot.end > busy.start;
      });
    });
  }

  private async scoreSlots(
    slots: TimeSlot[],
    candidateTimezone: string,
    preferredTimes: string[],
    interviewers: Interviewer[]
  ): Promise<TimeSlot[]> {
    return slots.map((slot) => {
      let score = 50; // Base score

      // Convert to candidate's timezone for scoring
      const candidateHour = this.getHourInTimezone(slot.start, candidateTimezone);

      // Prefer mid-morning and mid-afternoon
      if (candidateHour >= 10 && candidateHour <= 11) score += 20;
      if (candidateHour >= 14 && candidateHour <= 15) score += 15;

      // Penalize very early or late
      if (candidateHour < 9 || candidateHour > 17) score -= 20;

      // Prefer not Monday or Friday
      const dayOfWeek = slot.start.getDay();
      if (dayOfWeek === 2 || dayOfWeek === 3 || dayOfWeek === 4) score += 10;

      // Match preferred times
      if (preferredTimes.includes('morning') && candidateHour >= 9 && candidateHour < 12) {
        score += 15;
      }
      if (preferredTimes.includes('afternoon') && candidateHour >= 12 && candidateHour < 17) {
        score += 15;
      }

      return { ...slot, score: Math.min(100, Math.max(0, score)) };
    });
  }

  // ===========================================================================
  // INTERVIEW MANAGEMENT
  // ===========================================================================

  /**
   * Create an interview request
   */
  async createInterviewRequest(
    candidate: Candidate,
    requisition: JobRequisition,
    interviewers: Interviewer[],
    config: SchedulingConfig,
    options: {
      type?: InterviewType;
      format?: 'in_person' | 'video' | 'phone';
      candidateTimezone?: string;
    } = {}
  ): Promise<InterviewRequest> {
    const {
      type = 'phone_screen',
      format = 'video',
      candidateTimezone = 'America/New_York',
    } = options;

    const duration = config.defaultDuration[type] || 60;

    // Find available slots
    const proposedSlots = await this.findAvailableSlots(
      interviewers,
      duration,
      config,
      {
        candidateTimezone,
        count: 5,
      }
    );

    return {
      id: uuid(),
      tenantId: config.tenantId,
      candidateId: candidate.id,
      requisitionId: requisition.id,
      type,
      duration,
      interviewers,
      proposedSlots,
      status: 'slots_proposed',
      format,
      candidateTimezone,
      interviewerTimezones: interviewers.map((i) => i.timezone),
      createdAt: new Date(),
    };
  }

  /**
   * Confirm interview with selected slot
   */
  async confirmInterview(
    interview: InterviewRequest,
    selectedSlotId: string,
    config: SchedulingConfig
  ): Promise<InterviewRequest> {
    const selectedSlot = interview.proposedSlots.find((s) => s.id === selectedSlotId);
    if (!selectedSlot) {
      throw new Error('Invalid slot selection');
    }

    // Create calendar events
    await this.createCalendarEvents(interview, selectedSlot, config);

    return {
      ...interview,
      selectedSlot,
      status: 'confirmed',
      confirmedAt: new Date(),
    };
  }

  /**
   * Cancel interview
   */
  async cancelInterview(
    interview: InterviewRequest,
    reason: string
  ): Promise<InterviewRequest> {
    // In production, would delete calendar events and send notifications
    return {
      ...interview,
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason,
    };
  }

  /**
   * Request reschedule
   */
  async requestReschedule(
    interview: InterviewRequest,
    reason: string,
    config: SchedulingConfig
  ): Promise<InterviewRequest> {
    // Find new available slots
    const newSlots = await this.findAvailableSlots(
      interview.interviewers,
      interview.duration,
      config,
      {
        candidateTimezone: interview.candidateTimezone,
        count: 5,
      }
    );

    return {
      ...interview,
      proposedSlots: newSlots,
      selectedSlot: undefined,
      status: 'rescheduling',
    };
  }

  // ===========================================================================
  // CALENDAR EVENTS
  // ===========================================================================

  private async createCalendarEvents(
    interview: InterviewRequest,
    slot: TimeSlot,
    config: SchedulingConfig
  ): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];

    // Generate meeting link for video interviews
    const meetingLink = interview.format === 'video'
      ? `https://meet.riley.ai/${interview.id}`
      : undefined;

    // Create event for each interviewer
    for (const interviewer of interview.interviewers) {
      const event: CalendarEvent = {
        id: uuid(),
        interviewId: interview.id,
        calendarId: interviewer.calendarId || interviewer.email,
        title: this.generateEventTitle(interview),
        description: this.generateEventDescription(interview, interviewer),
        start: slot.start,
        end: slot.end,
        attendees: [
          interviewer.email,
          // Would add candidate email too
        ],
        location: interview.location,
        meetingLink,
        reminders: config.defaultReminders.interviewerReminders.map((m) => ({
          type: 'email' as const,
          minutesBefore: m,
        })),
      };

      events.push(event);

      // In production, would create via calendar API:
      // await calendarClient.createEvent(event);
    }

    return events;
  }

  private generateEventTitle(interview: InterviewRequest): string {
    const typeLabels: Record<InterviewType, string> = {
      phone_screen: 'Phone Screen',
      technical: 'Technical Interview',
      behavioral: 'Behavioral Interview',
      system_design: 'System Design Interview',
      coding: 'Coding Interview',
      culture_fit: 'Culture Fit Interview',
      hiring_manager: 'Hiring Manager Interview',
      team_meet: 'Team Meet & Greet',
      executive: 'Executive Interview',
      onsite: 'Onsite Interview',
    };

    return `${typeLabels[interview.type]} - [Candidate Name]`;
  }

  private generateEventDescription(
    interview: InterviewRequest,
    interviewer: Interviewer
  ): string {
    return `Interview Details:
- Type: ${interview.type}
- Duration: ${interview.duration} minutes
- Format: ${interview.format}
${interview.meetingLink ? `- Meeting Link: ${interview.meetingLink}` : ''}

Your Role: ${interviewer.role}

Candidate Information:
[Candidate profile would be included here]

Interview Prep Materials:
[Relevant prep materials would be linked here]`;
  }

  // ===========================================================================
  // REMINDERS
  // ===========================================================================

  /**
   * Generate reminder message for interview
   */
  async generateReminder(
    interview: InterviewRequest,
    recipient: 'candidate' | 'interviewer',
    minutesBefore: number
  ): Promise<{ subject: string; body: string }> {
    const isUrgent = minutesBefore <= 60;

    const prompt = `Generate a ${isUrgent ? 'final' : ''} interview reminder ${recipient === 'candidate' ? 'for a candidate' : 'for an interviewer'}.

Interview Details:
- Type: ${interview.type}
- Duration: ${interview.duration} minutes
- Format: ${interview.format}
- Time: ${interview.selectedSlot?.start.toISOString()}
${interview.meetingLink ? `- Link: ${interview.meetingLink}` : ''}

Time until interview: ${minutesBefore} minutes

Return JSON: { "subject": "Email subject", "body": "Email body" }`;

    const response = await this.claude.complete({
      prompt,
      maxTokens: 500,
    });

    return JSON.parse(response.content);
  }

  /**
   * Get interviews needing reminders
   */
  async getInterviewsNeedingReminders(
    config: SchedulingConfig
  ): Promise<Array<{ interview: InterviewRequest; minutesBefore: number }>> {
    // In production, would query database for confirmed interviews
    // within reminder windows
    const needing: Array<{ interview: InterviewRequest; minutesBefore: number }> = [];

    // Check each reminder threshold
    for (const threshold of config.defaultReminders.candidateReminders) {
      // Would query: interviews where selectedSlot.start - now = threshold
    }

    return needing;
  }

  // ===========================================================================
  // PREP MATERIALS
  // ===========================================================================

  /**
   * Generate interview prep materials
   */
  async generatePrepMaterials(
    interview: InterviewRequest,
    candidate: Candidate,
    requisition: JobRequisition
  ): Promise<{
    candidatePrep: string;
    interviewerPrep: Record<string, string>;
  }> {
    // Generate for candidate
    const candidatePrepPrompt = `Generate interview preparation tips for a candidate:

Interview Type: ${interview.type}
Duration: ${interview.duration} minutes
Role: ${requisition.title}

Include:
1. What to expect
2. How to prepare
3. Questions they might be asked
4. Questions they should ask

Keep it concise and helpful.`;

    const candidateResponse = await this.claude.complete({
      prompt: candidatePrepPrompt,
      maxTokens: 800,
    });

    // Generate for each interviewer
    const interviewerPrep: Record<string, string> = {};

    for (const interviewer of interview.interviewers) {
      const interviewerPrompt = `Generate interview prep for an interviewer:

Interviewer: ${interviewer.name}
Role: ${interviewer.role}
Interview Type: ${interview.type}

Candidate Summary:
- Name: ${candidate.firstName} ${candidate.lastName}
- Current: ${(candidate as unknown as { currentTitle?: string }).currentTitle || 'Unknown'}

Include suggested questions to ask based on the candidate's background.`;

      const interviewerResponse = await this.claude.complete({
        prompt: interviewerPrompt,
        maxTokens: 600,
      });

      interviewerPrep[interviewer.id] = interviewerResponse.content;
    }

    return {
      candidatePrep: candidateResponse.content,
      interviewerPrep,
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private getHourInTimezone(date: Date, timezone: string): number {
    // In production, would use proper timezone conversion
    // For now, simple approximation
    const utcHour = date.getUTCHours();

    const offsets: Record<string, number> = {
      'America/New_York': -5,
      'America/Chicago': -6,
      'America/Denver': -7,
      'America/Los_Angeles': -8,
      'Europe/London': 0,
      'Europe/Paris': 1,
      'Asia/Tokyo': 9,
      UTC: 0,
    };

    const offset = offsets[timezone] || 0;
    return (utcHour + offset + 24) % 24;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: SchedulingService | null = null;

export function getSchedulingService(): SchedulingService {
  if (!instance) {
    instance = new SchedulingService();
  }
  return instance;
}

export function resetSchedulingService(): void {
  instance = null;
}
