/**
 * Calendar Integration Client - Google & Outlook Calendar
 *
 * Provides unified calendar operations for interview scheduling:
 * - Find available slots across multiple calendars
 * - Create/update/delete events
 * - Send invitations
 * - Handle timezone conversions
 */

import { v4 as uuid } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export interface CalendarConfig {
  provider: 'google' | 'outlook';
  credentials: CalendarOAuthCredentials;
  userId: string;
  defaultCalendarId?: string;
  defaultTimezone?: string;
}

export interface CalendarOAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  clientId: string;
  clientSecret: string;
}

export interface CalendarEvent {
  id: string;
  externalId: string;
  calendarId: string;

  // Basic info
  title: string;
  description?: string;
  location?: string;

  // Timing
  start: Date;
  end: Date;
  timezone: string;
  allDay: boolean;

  // Recurrence
  recurrence?: RecurrenceRule;
  recurringEventId?: string;

  // Attendees
  organizer: CalendarAttendee;
  attendees: CalendarAttendee[];

  // Video conferencing
  conferenceData?: ConferenceData;

  // Reminders
  reminders: EventReminder[];

  // Status
  status: EventStatus;
  visibility: 'public' | 'private' | 'confidential';

  // Metadata
  htmlLink?: string;
  created: Date;
  updated: Date;
}

export interface CalendarAttendee {
  email: string;
  name?: string;
  responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
  organizer?: boolean;
}

export interface ConferenceData {
  type: 'hangoutsMeet' | 'teams' | 'zoom' | 'custom';
  conferenceId?: string;
  entryPoints: Array<{
    entryPointType: 'video' | 'phone' | 'sip';
    uri: string;
    label?: string;
    pin?: string;
  }>;
  createRequest?: {
    requestId: string;
    status: 'pending' | 'success' | 'failure';
  };
}

export interface EventReminder {
  method: 'email' | 'popup';
  minutes: number;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  count?: number;
  until?: Date;
  byDay?: string[]; // e.g., ['MO', 'WE', 'FR']
  byMonth?: number[];
  byMonthDay?: number[];
}

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

export interface FreeBusySlot {
  start: Date;
  end: Date;
  status: 'free' | 'busy' | 'tentative';
}

export interface CreateEventRequest {
  calendarId?: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  timezone?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    optional?: boolean;
  }>;
  conferenceType?: 'hangoutsMeet' | 'teams' | 'zoom';
  reminders?: EventReminder[];
  visibility?: 'public' | 'private';
  sendNotifications?: boolean;
}

export interface UpdateEventRequest {
  title?: string;
  description?: string;
  location?: string;
  start?: Date;
  end?: Date;
  attendees?: Array<{
    email: string;
    name?: string;
    optional?: boolean;
  }>;
  sendNotifications?: boolean;
}

// =============================================================================
// CALENDAR CLIENT
// =============================================================================

export class CalendarClient {
  private config: CalendarConfig;

  constructor(config: CalendarConfig) {
    this.config = config;
  }

  // ===========================================================================
  // CALENDARS
  // ===========================================================================

  /**
   * List available calendars
   */
  async listCalendars(): Promise<Array<{
    id: string;
    name: string;
    primary: boolean;
    timezone: string;
  }>> {
    if (this.config.provider === 'google') {
      return this.listGoogleCalendars();
    } else {
      return this.listOutlookCalendars();
    }
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  /**
   * Get event by ID
   */
  async getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent | null> {
    const calendar = calendarId || this.config.defaultCalendarId || 'primary';

    if (this.config.provider === 'google') {
      return this.getGoogleEvent(calendar, eventId);
    } else {
      return this.getOutlookEvent(calendar, eventId);
    }
  }

  /**
   * List events in a time range
   */
  async listEvents(options: {
    calendarId?: string;
    timeMin: Date;
    timeMax: Date;
    query?: string;
    maxResults?: number;
  }): Promise<CalendarEvent[]> {
    const calendar = options.calendarId || this.config.defaultCalendarId || 'primary';

    if (this.config.provider === 'google') {
      return this.listGoogleEvents(calendar, options);
    } else {
      return this.listOutlookEvents(calendar, options);
    }
  }

  /**
   * Create a new event
   */
  async createEvent(request: CreateEventRequest): Promise<CalendarEvent> {
    const calendar = request.calendarId || this.config.defaultCalendarId || 'primary';

    if (this.config.provider === 'google') {
      return this.createGoogleEvent(calendar, request);
    } else {
      return this.createOutlookEvent(calendar, request);
    }
  }

  /**
   * Update an existing event
   */
  async updateEvent(
    eventId: string,
    request: UpdateEventRequest,
    calendarId?: string
  ): Promise<CalendarEvent> {
    const calendar = calendarId || this.config.defaultCalendarId || 'primary';

    if (this.config.provider === 'google') {
      return this.updateGoogleEvent(calendar, eventId, request);
    } else {
      return this.updateOutlookEvent(calendar, eventId, request);
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(
    eventId: string,
    calendarId?: string,
    sendNotifications: boolean = true
  ): Promise<void> {
    const calendar = calendarId || this.config.defaultCalendarId || 'primary';

    if (this.config.provider === 'google') {
      await this.deleteGoogleEvent(calendar, eventId, sendNotifications);
    } else {
      await this.deleteOutlookEvent(calendar, eventId, sendNotifications);
    }
  }

  // ===========================================================================
  // AVAILABILITY
  // ===========================================================================

  /**
   * Get free/busy information for calendars
   */
  async getFreeBusy(options: {
    calendarIds: string[];
    timeMin: Date;
    timeMax: Date;
  }): Promise<Map<string, FreeBusySlot[]>> {
    if (this.config.provider === 'google') {
      return this.getGoogleFreeBusy(options);
    } else {
      return this.getOutlookFreeBusy(options);
    }
  }

  /**
   * Find available slots across multiple calendars
   */
  async findAvailableSlots(options: {
    calendarIds: string[];
    duration: number; // minutes
    timeMin: Date;
    timeMax: Date;
    workingHours?: {
      start: number; // hour (0-23)
      end: number;
      days: number[]; // 0=Sunday
    };
    buffer?: number; // minutes between slots
  }): Promise<Array<{ start: Date; end: Date }>> {
    const {
      calendarIds,
      duration,
      timeMin,
      timeMax,
      workingHours = { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
      buffer = 0,
    } = options;

    // Get busy times for all calendars
    const freeBusyMap = await this.getFreeBusy({
      calendarIds,
      timeMin,
      timeMax,
    });

    // Merge all busy times
    const allBusySlots: Array<{ start: Date; end: Date }> = [];
    for (const slots of freeBusyMap.values()) {
      for (const slot of slots) {
        if (slot.status === 'busy') {
          allBusySlots.push({ start: slot.start, end: slot.end });
        }
      }
    }

    // Sort by start time
    allBusySlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Find available slots
    const availableSlots: Array<{ start: Date; end: Date }> = [];
    const slotDuration = duration * 60 * 1000;
    const bufferDuration = buffer * 60 * 1000;

    // Generate candidate slots
    const current = new Date(timeMin);
    while (current < timeMax) {
      const dayOfWeek = current.getDay();

      // Check if this is a working day
      if (workingHours.days.includes(dayOfWeek)) {
        // Set to working hours start
        const dayStart = new Date(current);
        dayStart.setHours(workingHours.start, 0, 0, 0);

        const dayEnd = new Date(current);
        dayEnd.setHours(workingHours.end, 0, 0, 0);

        // Skip if day has already passed
        if (dayEnd > timeMin) {
          const slotStart = new Date(Math.max(dayStart.getTime(), timeMin.getTime()));

          while (slotStart.getTime() + slotDuration <= dayEnd.getTime()) {
            const slotEnd = new Date(slotStart.getTime() + slotDuration);

            // Check if slot overlaps with any busy time
            const isAvailable = !allBusySlots.some((busy) => {
              return slotStart < busy.end && slotEnd > busy.start;
            });

            if (isAvailable && slotEnd <= timeMax) {
              availableSlots.push({ start: new Date(slotStart), end: slotEnd });
            }

            // Move to next potential slot
            slotStart.setTime(slotStart.getTime() + slotDuration + bufferDuration);
          }
        }
      }

      // Move to next day
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    return availableSlots;
  }

  // ===========================================================================
  // CONFERENCING
  // ===========================================================================

  /**
   * Create a video conference for an event
   */
  async createConference(
    eventId: string,
    type: 'hangoutsMeet' | 'teams',
    calendarId?: string
  ): Promise<ConferenceData> {
    const calendar = calendarId || this.config.defaultCalendarId || 'primary';

    if (this.config.provider === 'google' && type === 'hangoutsMeet') {
      return this.createGoogleMeet(calendar, eventId);
    } else if (this.config.provider === 'outlook' && type === 'teams') {
      return this.createTeamsMeeting(calendar, eventId);
    }

    throw new Error(`Conference type ${type} not supported for ${this.config.provider}`);
  }

  // ===========================================================================
  // GOOGLE CALENDAR IMPLEMENTATION
  // ===========================================================================

  private async listGoogleCalendars(): Promise<Array<{
    id: string;
    name: string;
    primary: boolean;
    timezone: string;
  }>> {
    const response = await this.googleRequest<{
      items: Array<{
        id: string;
        summary: string;
        primary?: boolean;
        timeZone: string;
      }>;
    }>('GET', '/users/me/calendarList');

    return (response?.items || []).map((cal) => ({
      id: cal.id,
      name: cal.summary,
      primary: cal.primary || false,
      timezone: cal.timeZone,
    }));
  }

  private async getGoogleEvent(
    calendarId: string,
    eventId: string
  ): Promise<CalendarEvent | null> {
    const response = await this.googleRequest<GoogleEventResponse>(
      'GET',
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`
    );

    if (!response) return null;
    return this.normalizeGoogleEvent(response, calendarId);
  }

  private async listGoogleEvents(
    calendarId: string,
    options: {
      timeMin: Date;
      timeMax: Date;
      query?: string;
      maxResults?: number;
    }
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: options.timeMin.toISOString(),
      timeMax: options.timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: (options.maxResults || 250).toString(),
    });

    if (options.query) {
      params.set('q', options.query);
    }

    const response = await this.googleRequest<{ items: GoogleEventResponse[] }>(
      'GET',
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    );

    return (response?.items || []).map((e) => this.normalizeGoogleEvent(e, calendarId));
  }

  private async createGoogleEvent(
    calendarId: string,
    request: CreateEventRequest
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      summary: request.title,
      description: request.description,
      location: request.location,
      start: {
        dateTime: request.start.toISOString(),
        timeZone: request.timezone || this.config.defaultTimezone,
      },
      end: {
        dateTime: request.end.toISOString(),
        timeZone: request.timezone || this.config.defaultTimezone,
      },
      attendees: request.attendees?.map((a) => ({
        email: a.email,
        displayName: a.name,
        optional: a.optional,
      })),
      visibility: request.visibility,
    };

    if (request.conferenceType === 'hangoutsMeet') {
      body.conferenceData = {
        createRequest: {
          requestId: uuid(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    if (request.reminders) {
      body.reminders = {
        useDefault: false,
        overrides: request.reminders.map((r) => ({
          method: r.method,
          minutes: r.minutes,
        })),
      };
    }

    const params = new URLSearchParams({
      sendUpdates: request.sendNotifications ? 'all' : 'none',
    });

    if (request.conferenceType) {
      params.set('conferenceDataVersion', '1');
    }

    const response = await this.googleRequest<GoogleEventResponse>(
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      body
    );

    return this.normalizeGoogleEvent(response!, calendarId);
  }

  private async updateGoogleEvent(
    calendarId: string,
    eventId: string,
    request: UpdateEventRequest
  ): Promise<CalendarEvent> {
    // Get current event first
    const current = await this.getGoogleEvent(calendarId, eventId);
    if (!current) {
      throw new Error(`Event ${eventId} not found`);
    }

    const body: Record<string, unknown> = {
      summary: request.title ?? current.title,
      description: request.description ?? current.description,
      location: request.location ?? current.location,
    };

    if (request.start) {
      body.start = {
        dateTime: request.start.toISOString(),
        timeZone: current.timezone,
      };
    }

    if (request.end) {
      body.end = {
        dateTime: request.end.toISOString(),
        timeZone: current.timezone,
      };
    }

    if (request.attendees) {
      body.attendees = request.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
        optional: a.optional,
      }));
    }

    const params = new URLSearchParams({
      sendUpdates: request.sendNotifications ? 'all' : 'none',
    });

    const response = await this.googleRequest<GoogleEventResponse>(
      'PATCH',
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?${params.toString()}`,
      body
    );

    return this.normalizeGoogleEvent(response!, calendarId);
  }

  private async deleteGoogleEvent(
    calendarId: string,
    eventId: string,
    sendNotifications: boolean
  ): Promise<void> {
    const params = new URLSearchParams({
      sendUpdates: sendNotifications ? 'all' : 'none',
    });

    await this.googleRequest(
      'DELETE',
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?${params.toString()}`
    );
  }

  private async getGoogleFreeBusy(options: {
    calendarIds: string[];
    timeMin: Date;
    timeMax: Date;
  }): Promise<Map<string, FreeBusySlot[]>> {
    const response = await this.googleRequest<{
      calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
    }>('POST', '/freeBusy', {
      timeMin: options.timeMin.toISOString(),
      timeMax: options.timeMax.toISOString(),
      items: options.calendarIds.map((id) => ({ id })),
    });

    const result = new Map<string, FreeBusySlot[]>();

    for (const [calendarId, data] of Object.entries(response?.calendars || {})) {
      result.set(
        calendarId,
        (data.busy || []).map((slot) => ({
          start: new Date(slot.start),
          end: new Date(slot.end),
          status: 'busy' as const,
        }))
      );
    }

    return result;
  }

  private async createGoogleMeet(
    calendarId: string,
    eventId: string
  ): Promise<ConferenceData> {
    const response = await this.googleRequest<GoogleEventResponse>(
      'PATCH',
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?conferenceDataVersion=1`,
      {
        conferenceData: {
          createRequest: {
            requestId: uuid(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }
    );

    if (!response?.conferenceData) {
      throw new Error('Failed to create conference - no conference data returned');
    }
    return this.normalizeGoogleConference(response.conferenceData);
  }

  private async googleRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    await this.refreshTokenIfNeeded();

    const url = `https://www.googleapis.com/calendar/v3${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Google Calendar API error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) return null;
    return (await response.json()) as T;
  }

  private normalizeGoogleEvent(data: GoogleEventResponse, calendarId: string): CalendarEvent {
    const start = data.start?.dateTime
      ? new Date(data.start.dateTime)
      : new Date(data.start?.date || '');
    const end = data.end?.dateTime
      ? new Date(data.end.dateTime)
      : new Date(data.end?.date || '');

    return {
      id: uuid(),
      externalId: data.id,
      calendarId,
      title: data.summary || '',
      description: data.description,
      location: data.location,
      start,
      end,
      timezone: data.start?.timeZone || this.config.defaultTimezone || 'UTC',
      allDay: !data.start?.dateTime,
      organizer: {
        email: data.organizer?.email || '',
        name: data.organizer?.displayName,
        responseStatus: 'accepted',
        organizer: true,
      },
      attendees: (data.attendees || []).map((a) => ({
        email: a.email,
        name: a.displayName,
        responseStatus: a.responseStatus as CalendarAttendee['responseStatus'],
        optional: a.optional,
      })),
      conferenceData: data.conferenceData
        ? this.normalizeGoogleConference(data.conferenceData)
        : undefined,
      reminders: data.reminders?.overrides?.map((r) => ({
        method: r.method as 'email' | 'popup',
        minutes: r.minutes,
      })) || [],
      status: data.status as EventStatus,
      visibility: (data.visibility as CalendarEvent['visibility']) || 'public',
      htmlLink: data.htmlLink,
      created: new Date(data.created),
      updated: new Date(data.updated),
    };
  }

  private normalizeGoogleConference(data: GoogleConferenceData): ConferenceData {
    return {
      type: 'hangoutsMeet',
      conferenceId: data.conferenceId,
      entryPoints: (data.entryPoints || []).map((ep) => ({
        entryPointType: ep.entryPointType as 'video' | 'phone' | 'sip',
        uri: ep.uri,
        label: ep.label,
        pin: ep.pin,
      })),
      createRequest: data.createRequest
        ? {
            requestId: data.createRequest.requestId,
            status: data.createRequest.status?.statusCode as 'pending' | 'success' | 'failure',
          }
        : undefined,
    };
  }

  // ===========================================================================
  // OUTLOOK CALENDAR IMPLEMENTATION
  // ===========================================================================

  private async listOutlookCalendars(): Promise<Array<{
    id: string;
    name: string;
    primary: boolean;
    timezone: string;
  }>> {
    const response = await this.outlookRequest<{
      value: Array<{
        id: string;
        name: string;
        isDefaultCalendar?: boolean;
      }>;
    }>('GET', '/me/calendars');

    // Get user timezone
    const userResponse = await this.outlookRequest<{ mailboxSettings?: { timeZone?: string } }>(
      'GET',
      '/me/mailboxSettings'
    );
    const timezone = userResponse?.mailboxSettings?.timeZone || 'UTC';

    return (response?.value || []).map((cal) => ({
      id: cal.id,
      name: cal.name,
      primary: cal.isDefaultCalendar || false,
      timezone,
    }));
  }

  private async getOutlookEvent(
    calendarId: string,
    eventId: string
  ): Promise<CalendarEvent | null> {
    const response = await this.outlookRequest<OutlookEventResponse>(
      'GET',
      `/me/calendars/${calendarId}/events/${eventId}`
    );

    if (!response) return null;
    return this.normalizeOutlookEvent(response, calendarId);
  }

  private async listOutlookEvents(
    calendarId: string,
    options: {
      timeMin: Date;
      timeMax: Date;
      query?: string;
      maxResults?: number;
    }
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      startDateTime: options.timeMin.toISOString(),
      endDateTime: options.timeMax.toISOString(),
      $top: (options.maxResults || 250).toString(),
      $orderby: 'start/dateTime',
    });

    if (options.query) {
      params.set('$filter', `contains(subject, '${options.query}')`);
    }

    const response = await this.outlookRequest<{ value: OutlookEventResponse[] }>(
      'GET',
      `/me/calendars/${calendarId}/calendarView?${params.toString()}`
    );

    return (response?.value || []).map((e) => this.normalizeOutlookEvent(e, calendarId));
  }

  private async createOutlookEvent(
    calendarId: string,
    request: CreateEventRequest
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      subject: request.title,
      body: request.description
        ? { contentType: 'HTML', content: request.description }
        : undefined,
      location: request.location ? { displayName: request.location } : undefined,
      start: {
        dateTime: request.start.toISOString().replace('Z', ''),
        timeZone: request.timezone || this.config.defaultTimezone || 'UTC',
      },
      end: {
        dateTime: request.end.toISOString().replace('Z', ''),
        timeZone: request.timezone || this.config.defaultTimezone || 'UTC',
      },
      attendees: request.attendees?.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: a.optional ? 'optional' : 'required',
      })),
    };

    if (request.conferenceType === 'teams') {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = 'teamsForBusiness';
    }

    const response = await this.outlookRequest<OutlookEventResponse>(
      'POST',
      `/me/calendars/${calendarId}/events`,
      body
    );

    return this.normalizeOutlookEvent(response!, calendarId);
  }

  private async updateOutlookEvent(
    calendarId: string,
    eventId: string,
    request: UpdateEventRequest
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};

    if (request.title) body.subject = request.title;
    if (request.description) {
      body.body = { contentType: 'HTML', content: request.description };
    }
    if (request.location) body.location = { displayName: request.location };
    if (request.start) {
      body.start = {
        dateTime: request.start.toISOString().replace('Z', ''),
        timeZone: this.config.defaultTimezone || 'UTC',
      };
    }
    if (request.end) {
      body.end = {
        dateTime: request.end.toISOString().replace('Z', ''),
        timeZone: this.config.defaultTimezone || 'UTC',
      };
    }
    if (request.attendees) {
      body.attendees = request.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: a.optional ? 'optional' : 'required',
      }));
    }

    const response = await this.outlookRequest<OutlookEventResponse>(
      'PATCH',
      `/me/calendars/${calendarId}/events/${eventId}`,
      body
    );

    return this.normalizeOutlookEvent(response!, calendarId);
  }

  private async deleteOutlookEvent(
    calendarId: string,
    eventId: string,
    _sendNotifications: boolean
  ): Promise<void> {
    await this.outlookRequest(
      'DELETE',
      `/me/calendars/${calendarId}/events/${eventId}`
    );
  }

  private async getOutlookFreeBusy(options: {
    calendarIds: string[];
    timeMin: Date;
    timeMax: Date;
  }): Promise<Map<string, FreeBusySlot[]>> {
    // For Outlook, we need to use the getSchedule endpoint
    const response = await this.outlookRequest<{
      value: Array<{
        scheduleId: string;
        scheduleItems: Array<{
          start: { dateTime: string };
          end: { dateTime: string };
          status: string;
        }>;
      }>;
    }>('POST', '/me/calendar/getSchedule', {
      schedules: options.calendarIds,
      startTime: {
        dateTime: options.timeMin.toISOString(),
        timeZone: 'UTC',
      },
      endTime: {
        dateTime: options.timeMax.toISOString(),
        timeZone: 'UTC',
      },
    });

    const result = new Map<string, FreeBusySlot[]>();

    for (const schedule of response?.value || []) {
      result.set(
        schedule.scheduleId,
        (schedule.scheduleItems || []).map((item) => ({
          start: new Date(item.start.dateTime),
          end: new Date(item.end.dateTime),
          status: item.status === 'busy' ? 'busy' : 'free',
        }))
      );
    }

    return result;
  }

  private async createTeamsMeeting(
    calendarId: string,
    eventId: string
  ): Promise<ConferenceData> {
    const response = await this.outlookRequest<OutlookEventResponse>(
      'PATCH',
      `/me/calendars/${calendarId}/events/${eventId}`,
      {
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
      }
    );

    return this.normalizeOutlookConference(response!);
  }

  private async outlookRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    await this.refreshTokenIfNeeded();

    const url = `https://graph.microsoft.com/v1.0${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Outlook Calendar API error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) return null;
    return (await response.json()) as T;
  }

  private normalizeOutlookEvent(data: OutlookEventResponse, calendarId: string): CalendarEvent {
    return {
      id: uuid(),
      externalId: data.id,
      calendarId,
      title: data.subject || '',
      description: data.body?.content,
      location: data.location?.displayName,
      start: new Date(data.start?.dateTime || ''),
      end: new Date(data.end?.dateTime || ''),
      timezone: data.start?.timeZone || 'UTC',
      allDay: data.isAllDay || false,
      organizer: {
        email: data.organizer?.emailAddress?.address || '',
        name: data.organizer?.emailAddress?.name,
        responseStatus: 'accepted',
        organizer: true,
      },
      attendees: (data.attendees || []).map((a) => ({
        email: a.emailAddress?.address || '',
        name: a.emailAddress?.name,
        responseStatus: this.normalizeOutlookResponse(a.status?.response),
        optional: a.type === 'optional',
      })),
      conferenceData: data.onlineMeeting ? this.normalizeOutlookConference(data) : undefined,
      reminders: [], // Outlook handles reminders differently
      status: data.isCancelled ? 'cancelled' : 'confirmed',
      visibility: data.sensitivity === 'private' ? 'private' : 'public',
      htmlLink: data.webLink,
      created: new Date(data.createdDateTime || ''),
      updated: new Date(data.lastModifiedDateTime || ''),
    };
  }

  private normalizeOutlookConference(data: OutlookEventResponse): ConferenceData {
    return {
      type: 'teams',
      conferenceId: data.onlineMeeting?.joinUrl,
      entryPoints: data.onlineMeeting?.joinUrl
        ? [
            {
              entryPointType: 'video',
              uri: data.onlineMeeting.joinUrl,
              label: 'Join Teams Meeting',
            },
          ]
        : [],
    };
  }

  private normalizeOutlookResponse(
    response?: string
  ): CalendarAttendee['responseStatus'] {
    const mapping: Record<string, CalendarAttendee['responseStatus']> = {
      accepted: 'accepted',
      declined: 'declined',
      tentativelyAccepted: 'tentative',
      notResponded: 'needsAction',
    };
    return mapping[response || ''] || 'needsAction';
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private async refreshTokenIfNeeded(): Promise<void> {
    if (this.config.credentials.expiresAt > new Date()) {
      return;
    }

    console.log('[CalendarClient] Refreshing OAuth token...');
    // In production, would call OAuth refresh endpoint
  }
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

interface GoogleEventResponse {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  organizer?: { email: string; displayName?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
    optional?: boolean;
  }>;
  conferenceData?: GoogleConferenceData;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
  status: string;
  visibility?: string;
  htmlLink?: string;
  created: string;
  updated: string;
}

interface GoogleConferenceData {
  conferenceId?: string;
  entryPoints?: Array<{
    entryPointType: string;
    uri: string;
    label?: string;
    pin?: string;
  }>;
  createRequest?: {
    requestId: string;
    status?: { statusCode: string };
  };
}

interface OutlookEventResponse {
  id: string;
  subject?: string;
  body?: { content?: string; contentType?: string };
  location?: { displayName?: string };
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  organizer?: { emailAddress?: { address?: string; name?: string } };
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string };
    type?: string;
    status?: { response?: string };
  }>;
  onlineMeeting?: { joinUrl?: string };
  isCancelled?: boolean;
  sensitivity?: string;
  webLink?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: CalendarClient | null = null;

export function initializeCalendarClient(config: CalendarConfig): CalendarClient {
  instance = new CalendarClient(config);
  return instance;
}

export function getCalendarClient(): CalendarClient {
  if (!instance) {
    throw new Error('CalendarClient not initialized. Call initializeCalendarClient first.');
  }
  return instance;
}
