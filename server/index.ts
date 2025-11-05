/// <reference types="node" />

import { startServer as main } from './startup.js';

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(console.error);
}
