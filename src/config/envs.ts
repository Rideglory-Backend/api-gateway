import * as joi from 'joi'

interface EnvVars {
    PORT: number;
    VEHICLES_MS_PORT: number;
    VEHICLES_MS_HOST: string;
    EVENTS_MS_PORT: number;
    EVENTS_MS_HOST: string;
    USERS_MS_PORT: number;
    USERS_MS_HOST: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_SERVICE_ACCOUNT_JSON?: string;
}

const envSchema = joi.object({
    PORT: joi.number().required(),
    VEHICLES_MS_PORT: joi.number().required(),
    VEHICLES_MS_HOST: joi.string().required(),
    EVENTS_MS_PORT: joi.number().required(),
    EVENTS_MS_HOST: joi.string().required(),
    USERS_MS_PORT: joi.number().required(),
    USERS_MS_HOST: joi.string().required(),
    FIREBASE_PROJECT_ID: joi.string().optional(),
    FIREBASE_SERVICE_ACCOUNT_JSON: joi.string().optional(),
}).unknown(true)

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
    firebaseProjectId: envVars.FIREBASE_PROJECT_ID,
    firebaseServiceAccountJson: envVars.FIREBASE_SERVICE_ACCOUNT_JSON,
}

