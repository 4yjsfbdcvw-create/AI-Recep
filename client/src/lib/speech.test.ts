import { describe, expect, it } from "vitest";
import { createAudioDataUrl, latestAgentMessage, selectPreferredVoice, speechPlaybackErrorMessage } from "./speech";
import { voiceProviderGuidance } from "@shared/voice";

describe("browser voice response helpers", () => {
  it("selects the newest agent reply instead of repeating the customer utterance", () => {
    const result = latestAgentMessage([
      { id: 1, speaker: "agent", body: "Welcome" },
      { id: 2, speaker: "customer", body: "I need an appointment" },
      { id: 3, speaker: "agent", body: "What date works for you?" },
    ]);
    expect(result).toEqual({ id: 3, speaker: "agent", body: "What date works for you?" });
  });

  it("prefers an exact British English voice and safely falls back", () => {
    const voices = [
      { name: "Default", lang: "en-US", default: true },
      { name: "Clara UK", lang: "en-GB", default: false },
    ];
    expect(selectPreferredVoice(voices, "en-GB")?.name).toBe("Clara UK");
    expect(selectPreferredVoice([], "en-GB")).toBeNull();
  });

  it("gives actionable feedback when the device has no speech voice", () => {
    expect(speechPlaybackErrorMessage("synthesis-failed", 0)).toContain("Install an English system voice");
    expect(speechPlaybackErrorMessage("not-allowed", 2)).toContain("blocked spoken replies");
  });

  it("creates a safe playable data URL for generated ElevenLabs audio", () => {
    expect(createAudioDataUrl("audio/mpeg", "YWJj")).toBe("data:audio/mpeg;base64,YWJj");
    expect(createAudioDataUrl("text/html", "YWJj")).toBe("data:audio/mpeg;base64,YWJj");
    expect(() => createAudioDataUrl("audio/mpeg", "")).toThrow("empty");
  });

  it("distinguishes provider quota exhaustion from temporary unavailability", () => {
    expect(voiceProviderGuidance("quota_exceeded insufficient credits").issue).toBe("quota");
    expect(voiceProviderGuidance("upstream timeout").issue).toBe("unavailable");
  });
});
