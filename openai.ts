import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("❌ OPENAI_API_KEY is not set.");
  process.exit(1);
}

const client = new OpenAI({ apiKey });

async function main() {
  try {
    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      input: "Reply with exactly: API key works!",
    });

    console.log("✅ API key works!");
    console.log("Response:", response.output_text);
  } catch (error: any) {
    console.error("❌ API request failed.");

    if (error?.status) {
      console.error("HTTP status:", error.status);
    }

    console.error("Error:", error?.message ?? error);
    process.exit(1);
  }
}

main();

