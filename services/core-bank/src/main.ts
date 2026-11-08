import { loadEnv } from '@gas/shared/env';
import { createCoreBankApp } from './server.ts';

loadEnv();
const port = Number(process.env.CORE_BANK_PORT || 4100);
const { app } = createCoreBankApp({ serviceKey: process.env.CORE_BANK_SERVICE_KEY || '' });
app.listen(port, '127.0.0.1', () => console.log(`core-bank listening on ${port}`));
