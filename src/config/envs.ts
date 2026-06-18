import * as joi from 'joi';

interface EnvVars {
  PORT: number;
  VEHICLES_MS_PORT: number;
  VEHICLES_MS_HOST: string;
  EVENTS_MS_PORT: number;
  EVENTS_MS_HOST: string;
  USERS_MS_PORT: number;
  USERS_MS_HOST: string;
  MAINTENANCES_MS_PORT: number;
  MAINTENANCES_MS_HOST: string;
  NOTIFICATIONS_MS_PORT: number;
  NOTIFICATIONS_MS_HOST: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  MAPBOX_ACCESS_TOKEN?: string;
  GOOGLE_PLACES_API_KEY?: string;
  DATABASE_URL: string;
  SENTRY_DSN?: string;
  SENTRY_TRACES_SAMPLE_RATE?: number;
}

const envSchema = joi
  .object({
    PORT: joi.number().required(),
    VEHICLES_MS_PORT: joi.number().required(),
    VEHICLES_MS_HOST: joi.string().required(),
    EVENTS_MS_PORT: joi.number().required(),
    EVENTS_MS_HOST: joi.string().required(),
    USERS_MS_PORT: joi.number().required(),
    USERS_MS_HOST: joi.string().required(),
    MAINTENANCES_MS_PORT: joi.number().required(),
    MAINTENANCES_MS_HOST: joi.string().required(),
    NOTIFICATIONS_MS_PORT: joi.number().required(),
    NOTIFICATIONS_MS_HOST: joi.string().required(),
    FIREBASE_PROJECT_ID: joi.string().optional(),
    FIREBASE_SERVICE_ACCOUNT_JSON: joi.string().optional(),
    MAPBOX_ACCESS_TOKEN: joi.string().optional(),
    GOOGLE_PLACES_API_KEY: joi.string().optional(),
    DATABASE_URL: joi.string().required(),
    SENTRY_DSN: joi.string().uri().optional(),
    SENTRY_TRACES_SAMPLE_RATE: joi.number().min(0).max(1).optional(),
  })
  .unknown(true);

const { error, value } = envSchema.validate(process.env);

if (error) {
  throw new Error(`ENV config validation error: ${error.message}`);
}

const envVars: EnvVars = value;

export const envs = {
  port: envVars.PORT,
  vehiclesMsPort: envVars.VEHICLES_MS_PORT,
  vehiclesMsHost: envVars.VEHICLES_MS_HOST,
  eventsMsPort: envVars.EVENTS_MS_PORT,
  eventsMsHost: envVars.EVENTS_MS_HOST,
  usersMsPort: envVars.USERS_MS_PORT,
  usersMsHost: envVars.USERS_MS_HOST,
  maintenancesMsPort: envVars.MAINTENANCES_MS_PORT,
  maintenancesMsHost: envVars.MAINTENANCES_MS_HOST,
  notificationsMsPort: envVars.NOTIFICATIONS_MS_PORT,
  notificationsMsHost: envVars.NOTIFICATIONS_MS_HOST,
  firebaseProjectId: envVars.FIREBASE_PROJECT_ID,
  firebaseServiceAccountJson: envVars.FIREBASE_SERVICE_ACCOUNT_JSON,
  mapboxAccessToken: envVars.MAPBOX_ACCESS_TOKEN,
  googlePlacesApiKey: envVars.GOOGLE_PLACES_API_KEY,
  databaseUrl: envVars.DATABASE_URL,
  sentryDsn: envVars.SENTRY_DSN,
  sentryTracesSampleRate: envVars.SENTRY_TRACES_SAMPLE_RATE,
};
