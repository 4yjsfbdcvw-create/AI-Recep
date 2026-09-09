export const DEFAULT_ELEVENLABS_VOICE = {
  id: "Xb7hH8MSUJpSbSDYk0k2",
  name: "Alice — Clear, professional British",
} as const;

export const DEFAULT_ELEVENLABS_MODEL = "eleven_flash_v2_5";

export type ReceptionVoiceOption = {
  id: string;
  name: string;
  description: string;
  accent: string;
  category: string;
};

export type VoiceProviderIssue = "quota" | "authentication" | "rate_limit" | "unavailable";

export function classifyVoiceProviderIssue(message: string): VoiceProviderIssue {
  const normalized = message.toLowerCase();
  if (/quota|credit|billing|payment|required balance|character limit/.test(normalized)) return "quota";
  if (/api key|authentication|unauthori[sz]ed|permission|forbidden/.test(normalized)) return "authentication";
  if (/rate.?limit|too many requests|concurrency/.test(normalized)) return "rate_limit";
  return "unavailable";
}

export function voiceProviderGuidance(message: string) {
  const issue = classifyVoiceProviderIssue(message);
  if (issue === "quota") return {
    issue,
    title: "ElevenLabs quota exhausted",
    detail: "Add ElevenLabs credits or raise the key’s usage limit. Clara will use the device voice fallback and keep the transcript available.",
  };
  if (issue === "authentication") return {
    issue,
    title: "ElevenLabs access needs attention",
    detail: "Check that the server key is active and has Voices Read and Text to Speech permissions. Clara will use the device voice fallback.",
  };
  if (issue === "rate_limit") return {
    issue,
    title: "ElevenLabs is temporarily busy",
    detail: "Speech requests are being limited. Retry shortly; Clara will use the device voice fallback in the meantime.",
  };
  return {
    issue,
    title: "ElevenLabs is temporarily unavailable",
    detail: "Retry shortly or continue with the transcript. Clara will use the device voice fallback when one is installed.",
  };
}
