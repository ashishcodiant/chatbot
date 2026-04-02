import { SESClient } from "@aws-sdk/client-ses";

const SES_REGION = process.env.AWS_REGION || "us-east-1";

export const sesClient = new SESClient({
  region: SES_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});
