import { register } from 'tsx/esm/api';

register();
await import('./dashboard.worker.ts');
