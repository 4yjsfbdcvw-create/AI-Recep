import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ELEVENLABS_MODEL, DEFAULT_ELEVENLABS_VOICE } from "../../shared/voice";
import { buildSpeechRequest, generateElevenLabsSpeech, listFemaleReceptionVoices } from "./tts";

describe("ElevenLabs TTS adapter", () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-server-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  });

  it("builds a bounded low-latency conversational speech request", () => {
    const request = buildSpeechRequest("  Welcome to Harbour Dental.  ");
    expect(request.text).toBe("Welcome to Harbour Dental.");
    expect(request.model_id).toBe(DEFAULT_ELEVENLABS_MODEL);
    expect(request.voice_settings).toMatchObject({ use_speaker_boost: true, speed: 1 });
    expect(() => buildSpeechRequest(" ")).toThrow("required");
    expect(() => buildSpeechRequest("x".repeat(2_001))).toThrow("2,000");
  });

  it("places the preferred professional British voice first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ voices: [
      { voice_id: "other-voice-id", name: "Other", category: "premade", labels: { accent: "american" }, description: "Other voice" },
      { voice_id: DEFAULT_ELEVENLABS_VOICE.id, name: "Alice", category: "premade", labels: { accent: "british" }, description: "Professional voice" },
    ] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const voices = await listFemaleReceptionVoices();

    expect(voices[0]).toMatchObject({ id: DEFAULT_ELEVENLABS_VOICE.id, accent: "british" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("gender=female"), expect.objectContaining({ headers: { "xi-api-key": "test-server-key" } }));
  });

  it("returns playable MP3 data without exposing the API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([73, 68, 51, 4]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateElevenLabsSpeech("How may I help?", DEFAULT_ELEVENLABS_VOICE.id);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(result).toMatchObject({ mimeType: "audio/mpeg", provider: "elevenlabs", voiceId: DEFAULT_ELEVENLABS_VOICE.id });
    expect(result.audioBase64).toBe("SUQzBA==");
    expect(options.headers).toMatchObject({ "xi-api-key": "test-server-key", Accept: "audio/mpeg" });
    expect(options.body).not.toContain("test-server-key");
  });

  it("rejects malformed voice identifiers before making a provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateElevenLabsSpeech("Hello", "../../unsafe")).rejects.toThrow("Invalid ElevenLabs voice identifier");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns provider credit exhaustion into explicit quota guidance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { status: "quota_exceeded", message: "Your account has insufficient credits" } }), { status: 401, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateElevenLabsSpeech("Hello", DEFAULT_ELEVENLABS_VOICE.id)).rejects.toThrow("quota exhausted");
  });
});
