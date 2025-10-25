import { Worker } from 'worker_threads';

declare global {
  namespace Express {
    interface Request {
      arenaWorker?: Worker;
      resolutionWorker?: Worker;
      autonomyWorker?: Worker;
      dashboardWorker?: Worker;
      marketWatcherWorker?: Worker;
    }
  }
}

// This export is needed to make this file a module
export {};
