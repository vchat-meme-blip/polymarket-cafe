import { register } from 'tsx/esm/api';

register();
await import('./resolution.worker.ts');
