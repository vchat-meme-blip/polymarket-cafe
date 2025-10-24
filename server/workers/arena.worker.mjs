import { register } from 'tsx/esm/api';

register();
await import('./arena.worker.ts');
