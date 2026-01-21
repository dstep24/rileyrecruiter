/**
 * Riley Recruiter - Main Entry Point
 *
 * A near-autonomous AI recruiting agent built on the Two-Loop Paradigm.
 */

import 'dotenv/config';
import { createApp } from './api/app.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma.js';
import { getQueueManager, resetQueueManager } from './infrastructure/queue/TaskQueue.js';
import { initializeWorkers } from './infrastructure/queue/workers.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// =============================================================================
// STARTUP
// =============================================================================

async function start() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   ██████╗ ██╗██╗     ███████╗██╗   ██╗                            ║
║   ██╔══██╗██║██║     ██╔════╝╚██╗ ██╔╝                            ║
║   ██████╔╝██║██║     █████╗   ╚████╔╝                             ║
║   ██╔══██╗██║██║     ██╔══╝    ╚██╔╝                              ║
║   ██║  ██║██║███████╗███████╗   ██║                               ║
║   ╚═╝  ╚═╝╚═╝╚══════╝╚══════╝   ╚═╝                               ║
║                                                                    ║
║   Autonomous AI Recruiting Agent                                   ║
║   Two-Loop Paradigm Implementation                                 ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝
  `);

  console.log(`Environment: ${NODE_ENV}`);
  console.log('Starting Riley Recruiter...\n');

  // Connect to database
  console.log('Connecting to database...');
  await connectDatabase();

  // Initialize queue manager (connects to Redis)
  console.log('Initializing queue manager...');
  getQueueManager();

  // Initialize background workers (follow-up scheduler, etc.)
  console.log('Initializing background workers...');
  await initializeWorkers();

  // Create and start Express app
  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`\nRiley Recruiter API running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API base: http://localhost:${PORT}/api\n`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      console.log('HTTP server closed');

      try {
        // Close queue connections
        console.log('Closing queue connections...');
        resetQueueManager();

        // Disconnect database
        console.log('Disconnecting from database...');
        await disconnectDatabase();

        console.log('Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force exit after timeout
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// =============================================================================
// RUN
// =============================================================================

start().catch((error) => {
  console.error('Failed to start Riley Recruiter:', error);
  process.exit(1);
});
