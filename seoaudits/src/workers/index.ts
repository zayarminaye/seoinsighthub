/**
 * BullMQ Worker Entry Point
 *
 * Run separately from the Next.js dev server:
 *   npm run worker
 *
 * This process connects to Redis and processes audit jobs.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  // Dynamic import AFTER dotenv has loaded env vars
  // (static imports are hoisted above dotenv.config)
  const { startWorkers } = await import('../services/queue/workers');

  console.log('Starting BullMQ workers...');
  const workers = startWorkers();

  async function shutdown() {
    console.log('Shutting down workers...');
    await workers.orchestratorWorker.close();
    await workers.citationsWorker.close();
    console.log('Workers stopped.');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
