import { describe, expect, it } from "vitest";
import { latestAgentMessage, selectPreferredVoice, speechPlaybackErrorMessage } from "./speech";

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
});
