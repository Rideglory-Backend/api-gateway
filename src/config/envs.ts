import * as joi from 'joi'

interface EnvVars {
    PORT: number;
    VEHICLES_MS_PORT: number;
    VEHICLES_MS_HOST: string;
    EVENTS_MS_PORT: number;
    EVENTS_MS_HOST: string;
}

const envSchema = joi.object({
    PORT: joi.number().required(),
    VEHICLES_MS_PORT: joi.number().required(),
    VEHICLES_MS_HOST: joi.string().required(),
    EVENTS_MS_PORT: joi.number().required(),
    EVENTS_MS_HOST: joi.string().required(),
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
}

