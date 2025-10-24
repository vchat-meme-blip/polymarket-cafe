import { register } from 'tsx/esm/api';

register();
await import('./market-watcher.worker.ts');
