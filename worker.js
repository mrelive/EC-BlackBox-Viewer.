import { dequeueJob } from './api/_lib/jobStore.js';
import { runJob } from './api/_lib/jobProcessor.js';

let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop() {
  console.log('[worker] started');

  while (!shuttingDown) {
    try {
      const jobId = await dequeueJob(5);
      if (!jobId) continue;

      console.log(`[worker] processing ${jobId}`);
      await runJob(jobId);
      console.log(`[worker] done ${jobId}`);
    } catch (error) {
      console.error('[worker] job error', error);
      if (error?.name === 'JobStoreConfigError') {
        process.exitCode = 1;
        shuttingDown = true;
        break;
      }
      await wait(1000);
    }
  }

  console.log('[worker] stopped');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

loop().catch((error) => {
  console.error('[worker] fatal error', error);
  process.exitCode = 1;
});
