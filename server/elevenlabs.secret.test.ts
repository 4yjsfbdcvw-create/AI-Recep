import { describe, expect, it } from "vitest";

describe("ElevenLabs API credential", () => {
  it("authenticates with the model and voice permissions required by the app", async () => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    expect(apiKey, "ELEVENLABS_API_KEY must be configured").toBeTruthy();

    const headers = { "xi-api-key": apiKey! };
    const [modelsResponse, voicesResponse] = await Promise.all([
      fetch("https://api.elevenlabs.io/v1/models", { headers, signal: AbortSignal.timeout(15_000) }),
      fetch("https://api.elevenlabs.io/v2/voices?page_size=1&gender=female&language=en&include_total_count=false", { headers, signal: AbortSignal.timeout(15_000) }),
    ]);

    expect(modelsResponse.status, await modelsResponse.text()).toBe(200);
    expect(voicesResponse.status, await voicesResponse.text()).toBe(200);
  }, 20_000);
});
