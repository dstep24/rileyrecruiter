/**
 * Calendar Integration Module
 *
 * Unified interface for calendar providers:
 * - Google Calendar
 * - Microsoft Outlook Calendar
 *
 * Features:
 * - Event CRUD operations
 * - Free/busy queries
 * - Available slot finding
 * - Video conferencing (Meet/Teams)
 */

export {
  CalendarClient,
  CalendarConfig,
  CalendarOAuthCredentials,
  CalendarEvent,
  CalendarAttendee,
  ConferenceData,
  EventReminder,
  RecurrenceRule,
  EventStatus,
  FreeBusySlot,
  CreateEventRequest,
  UpdateEventRequest,
  initializeCalendarClient,
  getCalendarClient,
} from './CalendarClient.js';
