export type SpeakableMessage = {
  id: number | string;
  speaker: string;
  body: string;
};

export type BrowserVoice = {
  name: string;
  lang: string;
  default?: boolean;
};

export function latestAgentMessage(messages: SpeakableMessage[]) {
  return [...messages].reverse().find(message => message.speaker === "agent") ?? null;
}

export function selectPreferredVoice<T extends BrowserVoice>(voices: T[], preferredLocale = "en-GB") {
  const normalizedLocale = preferredLocale.toLowerCase();
  const language = normalizedLocale.split("-")[0];
  return voices.find(voice => voice.lang.toLowerCase() === normalizedLocale)
    ?? voices.find(voice => voice.lang.toLowerCase().startsWith(`${language}-`))
    ?? voices.find(voice => voice.default)
    ?? voices[0]
    ?? null;
}

export function speechPlaybackErrorMessage(errorCode: string, availableVoiceCount: number) {
  if (availableVoiceCount === 0 || errorCode === "synthesis-failed") {
    return "No text-to-speech voice is available on this browser or device. Install an English system voice or try Chrome or Edge on desktop.";
  }
  if (errorCode === "not-allowed") {
    return "Your browser blocked spoken replies. Click the voice button to retry, and allow audio playback if prompted.";
  }
  return "The spoken reply could not be played. You can retry with the voice button or continue using the transcript.";
}
