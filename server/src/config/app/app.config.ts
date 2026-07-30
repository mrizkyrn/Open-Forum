import { registerAs } from '@nestjs/config';
import { AppConfig } from './app-config.type';

export const appConfig = registerAs('app', (): AppConfig => {
  const environment = process.env.NODE_ENV;
  const port = process.env.PORT;
  const apiPrefix = process.env.API_PREFIX;
  const clientUrl = process.env.CLIENT_URL;
  const uploadDir = process.env.UPLOAD_DIR;
  const corsOrigin = process.env.CORS_ORIGIN;
  const corsCredentials = process.env.CORS_CREDENTIALS === 'true';

  if (!environment) {
    throw new Error('App configuration is incomplete. Required environment variables: NODE_ENV');
  }

  if (!port) {
    throw new Error('App configuration is incomplete. Required environment variables: PORT');
  }

  const portNumber = parseInt(port, 10);
  if (isNaN(portNumber) || portNumber <= 0) {
    throw new Error('Invalid PORT configuration. Must be a positive number.');
  }

  if (!apiPrefix) {
    throw new Error('App configuration is incomplete. Required environment variables: API_PREFIX');
  }

  if (!clientUrl) {
    throw new Error('App configuration is incomplete. Required environment variables: CLIENT_URL');
  }

  if (!uploadDir) {
    throw new Error('App configuration is incomplete. Required environment variables: UPLOAD_DIR');
  }

  if (!corsOrigin) {
    throw new Error('App configuration is incomplete. Required environment variables: CORS_ORIGIN');
  }

  return {
    environment,
    port: portNumber,
    apiPrefix,
    clientUrl,
    uploadDir: uploadDir,
    cors: {
      origin: corsOrigin,
      credentials: corsCredentials,
    },
  };
});
