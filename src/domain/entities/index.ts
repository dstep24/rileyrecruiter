/**
 * Domain Entities - Riley Recruiter
 *
 * Core domain types implementing the Two-Loop Paradigm:
 * - Guidelines (G): Agent CAN update autonomously
 * - Criteria (C): Agent CANNOT update (prevents reward hacking)
 * - Tasks: Sandbox vs Effectful operations
 * - Candidates, Conversations, etc.
 */

// Guidelines (G) - "How to Recruit"
export * from './Guidelines.js';

// Criteria (C) - "What Good Recruiting Looks Like"
export * from './Criteria.js';

// Tasks - Core of the Two-Loop System
export * from './Task.js';

// Candidates
export * from './Candidate.js';

// Tenants (Multi-tenant foundation)
export * from './Tenant.js';

// Conversations
export * from './Conversation.js';

// Inner Loop
export * from './InnerLoop.js';
