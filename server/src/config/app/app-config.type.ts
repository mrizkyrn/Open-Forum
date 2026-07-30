export type AppConfig = {
  environment: string;
  port: number;
  apiPrefix: string;
  clientUrl: string;
  uploadDir: string;
  cors: {
    origin: string;
    credentials: boolean;
  };
};
