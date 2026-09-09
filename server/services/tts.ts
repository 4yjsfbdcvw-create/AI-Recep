import { DEFAULT_ELEVENLABS_MODEL, DEFAULT_ELEVENLABS_VOICE, type ReceptionVoiceOption, voiceProviderGuidance } from "../../shared/voice";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io";

type ElevenLabsVoiceResponse = {
  voices?: Array<{
    voice_id?: string;
    name?: string;
    description?: string;
    category?: string;
    labels?: Record<string, string>;
  }>;
};

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs speech is not configured.");
  return key;
}

export function buildSpeechRequest(text: string) {
  const clean = text.trim();
  if (!clean) throw new Error("Speech text is required.");
  if (clean.length > 2_000) throw new Error("Speech text exceeds the 2,000 character limit.");
  return {
    text: clean,
    model_id: DEFAULT_ELEVENLABS_MODEL,
    voice_settings: {
      stability: 0.55,
      similarity_boost: 0.78,
      style: 0.12,
      use_speaker_boost: true,
      speed: 1,
    },
  };
}

export async function readElevenLabsError(response: Response) {
  try {
    const payload = await response.json() as { detail?: { message?: string; status?: string; code?: string } | string };
    const raw = typeof payload.detail === "string"
      ? payload.detail
      : [payload.detail?.message, payload.detail?.status, payload.detail?.code].filter(Boolean).join(" ");
    const guidance = voiceProviderGuidance(raw || `ElevenLabs request failed (${response.status}).`);
    return `${guidance.title}. ${guidance.detail}`;
  } catch {
    return voiceProviderGuidance(`ElevenLabs request failed (${response.status}).`).detail;
  }
}

export async function listFemaleReceptionVoices(): Promise<ReceptionVoiceOption[]> {
  const params = new URLSearchParams({
    page_size: "30",
    gender: "female",
    language: "en",
    include_total_count: "false",
  });
  const response = await fetch(`${ELEVENLABS_API_URL}/v2/voices?${params}`, {
    headers: { "xi-api-key": apiKey() },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(await readElevenLabsError(response));
  const payload = await response.json() as ElevenLabsVoiceResponse;
  const voices = (payload.voices ?? []).flatMap(voice => {
    if (!voice.voice_id || !voice.name) return [];
    return [{
      id: voice.voice_id,
      name: voice.name,
      description: voice.description || "Natural female English voice",
      accent: voice.labels?.accent || "English",
      category: voice.category || "voice",
    }];
  });
  const preferredOrder = [DEFAULT_ELEVENLABS_VOICE.id, "pFZP5JQG7iQjIQuC4Bku", "EXAVITQu4vr4xnSDxMaL"];
  return voices.sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.id);
    const rightIndex = preferredOrder.indexOf(right.id);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.name.localeCompare(right.name);
  });
}

export async function generateElevenLabsSpeech(text: string, voiceId: string = DEFAULT_ELEVENLABS_VOICE.id) {
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(voiceId)) throw new Error("Invalid ElevenLabs voice identifier.");
  const response = await fetch(`${ELEVENLABS_API_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(buildSpeechRequest(text)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(await readElevenLabsError(response));
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error("ElevenLabs returned an empty audio response.");
  return {
    audioBase64: bytes.toString("base64"),
    mimeType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
    provider: "elevenlabs" as const,
    voiceId,
    modelId: DEFAULT_ELEVENLABS_MODEL,
  };
}
