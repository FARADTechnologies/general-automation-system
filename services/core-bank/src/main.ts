import { loadEnv } from '@gas/shared/env';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCoreBankApp } from './server.ts';

loadEnv();
const port = Number(process.env.CORE_BANK_PORT || 4100);
const { app } = createCoreBankApp({ serviceKey: process.env.CORE_BANK_SERVICE_KEY || '', kbDir: resolve(dirname(fileURLToPath(import.meta.url)), '../../../domains/bank/kb') });
app.listen(port, '127.0.0.1', () => console.log(`core-bank listening on ${port}`));
