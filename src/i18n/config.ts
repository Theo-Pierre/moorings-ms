export const supportedLocales = [
  "en-US",
  "en-GB",
  "es-ES",
  "fr-FR",
  "af-ZA",
  "zh-CN",
  "hi-IN",
] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en-US";

export const localeDisplayNames: Record<Locale, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "es-ES": "Español",
  "fr-FR": "Français",
  "af-ZA": "Afrikaans",
  "zh-CN": "中文",
  "hi-IN": "हिन्दी",
};
