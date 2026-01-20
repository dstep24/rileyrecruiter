/**
 * Inner Loop Tasks - Recruiting Task Implementations
 *
 * Each task type implements the generate-validate-learn cycle
 * using Guidelines and Criteria.
 */

// Base task and registry
export {
  BaseTask,
  TaskContext,
  TaskGenerationResult,
  TaskValidationResult,
  ValidationIssue,
  TaskLearning,
  registerTask,
  getTaskImplementation,
  getRegisteredTaskTypes,
} from './BaseTask.js';

// Task implementations (auto-register on import)
export { OutreachTask, LinkedInMessageTask } from './OutreachTask.js';
export { ScreeningTask, AssessmentTask } from './ScreeningTask.js';
export { SchedulingTask, ReminderTask } from './SchedulingTask.js';
export { SourcingTask, CandidateImportTask } from './SourcingTask.js';
