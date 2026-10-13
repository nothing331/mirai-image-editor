import { appendFileSync, readFileSync } from "node:fs";

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url !== "https://api.resend.com/emails") return realFetch(input, options);
  if (process.env.RESEND_API_KEY !== "local-email-test-key" || !process.env.ACCESS_EMAIL_TEST_LOG || !process.env.ACCESS_EMAIL_TEST_RESPONSE) {
    throw new Error("The email test interceptor requires isolated test configuration.");
  }
  const status = Number(readFileSync(process.env.ACCESS_EMAIL_TEST_RESPONSE, "utf8"));
  appendFileSync(process.env.ACCESS_EMAIL_TEST_LOG, JSON.stringify({ status, message: JSON.parse(options.body), key: options.headers["Idempotency-Key"] }) + "\n");
  return status === 200 ? Response.json({ id: "local-test-email-id" }) : Response.json({ name: "local_test_failure" }, { status });
};
