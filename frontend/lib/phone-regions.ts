export type PhoneRegion = {
  code: string;
  name: string;
  dial: string;
  flag: string;
  digits: number;
  placeholder: string;
};

export const PHONE_REGIONS: PhoneRegion[] = [
  { code: "TN", name: "Tunisie", dial: "+216", flag: "🇹🇳", digits: 8, placeholder: "00 000 000" },
  { code: "DZ", name: "Algérie", dial: "+213", flag: "🇩🇿", digits: 9, placeholder: "000 00 00 00" },
  { code: "MA", name: "Maroc", dial: "+212", flag: "🇲🇦", digits: 9, placeholder: "000 00 00 00" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷", digits: 9, placeholder: "0 00 00 00 00" },
  { code: "EG", name: "Égypte", dial: "+20", flag: "🇪🇬", digits: 10, placeholder: "000 000 0000" },
  { code: "SA", name: "Arabie Saoudite", dial: "+966", flag: "🇸🇦", digits: 9, placeholder: "00 000 0000" },
  { code: "AE", name: "Émirats", dial: "+971", flag: "🇦🇪", digits: 9, placeholder: "00 000 0000" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦", digits: 8, placeholder: "0000 0000" },
  { code: "LB", name: "Liban", dial: "+961", flag: "🇱🇧", digits: 8, placeholder: "00 000 000" },
  { code: "DE", name: "Allemagne", dial: "+49", flag: "🇩🇪", digits: 10, placeholder: "000 0000000" },
  { code: "GB", name: "Royaume-Uni", dial: "+44", flag: "🇬🇧", digits: 10, placeholder: "0000 000000" },
  { code: "US", name: "États-Unis", dial: "+1", flag: "🇺🇸", digits: 10, placeholder: "000 000 0000" },
];

export function findRegion(code: string): PhoneRegion {
  return PHONE_REGIONS.find((r) => r.code === code) ?? PHONE_REGIONS[0];
}

export function buildFullPhone(dial: string, local: string): string {
  const digits = local.replace(/\D/g, "");
  const dialDigits = dial.replace(/\D/g, "");
  return `${dialDigits}${digits}`;
}

export function parsePhoneValue(value: string, defaultRegion = "TN"): { regionCode: string; local: string } {
  const digits = value.replace(/\D/g, "");
  if (!digits) return { regionCode: defaultRegion, local: "" };

  const sorted = [...PHONE_REGIONS].sort((a, b) => b.dial.length - a.dial.length);
  for (const region of sorted) {
    const dialDigits = region.dial.replace(/\D/g, "");
    if (digits.startsWith(dialDigits)) {
      return { regionCode: region.code, local: digits.slice(dialDigits.length) };
    }
  }
  return { regionCode: defaultRegion, local: digits };
}

export function isPhoneComplete(regionCode: string, local: string): boolean {
  const region = findRegion(regionCode);
  const digits = local.replace(/\D/g, "");
  return digits.length === region.digits;
}

export function formatLocalPhone(local: string, maxDigits: number): string {
  return local.replace(/\D/g, "").slice(0, maxDigits);
}

export function digitsMaskPlaceholder(digits: number): string {
  return "*".repeat(digits);
}

export function flagImageUrl(regionCode: string): string {
  return `https://flagcdn.com/h20/${regionCode.toLowerCase()}.png`;
}
