import { SendEmailCommand } from "@aws-sdk/client-ses";
import { sesClient } from "../lib/ses-client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function testSES() {
  const sender = process.env.SES_SENDER_EMAIL;
  const recipient = process.env.SES_SENDER_EMAIL; // Test by sending to yourself

  if (!sender) {
    console.error("❌ SES_SENDER_EMAIL is not defined in .env.local");
    return;
  }

  console.log(`🚀 Testing SES by sending from ${sender} to ${recipient}...`);

  const command = new SendEmailCommand({
    Destination: {
      ToAddresses: [recipient || ""],
    },
    Message: {
      Body: {
        Text: { Data: "Hello from Looply AI! This is a test email via AWS SES." },
        Html: { Data: "<h1>Hello from Looply AI!</h1><p>This is a test email via AWS SES.</p>" },
      },
      Subject: { Data: "Looply AI - SES Test Email" },
    },
    Source: sender,
  });

  try {
    const result = await sesClient.send(command);
    console.log("✅ SES Test Successful! Message ID:", result.MessageId);
  } catch (error) {
    console.error("❌ SES Test Failed:", error);
  }
}

testSES();
