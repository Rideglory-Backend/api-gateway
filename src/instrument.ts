// Must be the FIRST import in main.ts — before @nestjs/core, so Sentry puede
// instrumentar NestJS correctamente.
// Cargamos dotenv AQUÍ (respeta DOTENV_CONFIG_PATH) porque instrument.ts corre
// antes del `import 'dotenv/config'` de main.ts; sin esto, en dev el SENTRY_DSN
// del .env todavía no está en process.env e initSentry recibiría dsn=undefined.
// En prod las env vars son reales del entorno → dotenv es inocuo (idempotente).
// NOTE: no importar `envs` aquí — su joi corre en module-load y crashea temprano.
import 'dotenv/config';
import { initSentry } from '@rideglory/common-lib';

const sentryDsn = process.env['SENTRY_DSN'];
const sentryRate = process.env['SENTRY_TRACES_SAMPLE_RATE'];

initSentry('api-gateway', sentryDsn, {
  tracesSampleRate: sentryRate ? Number(sentryRate) : undefined,
});
