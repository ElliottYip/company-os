import { en, type CompanyOSMessageKey } from "./en.ts";
import { zhCN } from "./zh-CN.ts";

export type CompanyOSLocale = "en" | "zh-CN";

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const COMPANY_OS_LOCALE_STORAGE_KEY = "company-os.locale.v1";
export const SUPPORTED_LOCALES: readonly CompanyOSLocale[] = ["en", "zh-CN"];

const dictionaries: Readonly<Record<CompanyOSLocale, Readonly<Record<CompanyOSMessageKey, string>>>> = {
  en,
  "zh-CN": zhCN,
};

let activeLocale: CompanyOSLocale = "en";

export function normalizeLocale(value: string | null | undefined): CompanyOSLocale {
  return value?.toLocaleLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function readStoredLocale(
  storage: LocaleStorage | undefined,
  browserLanguage?: string,
): CompanyOSLocale {
  if (!storage) return normalizeLocale(browserLanguage);
  try {
    const stored = storage.getItem(COMPANY_OS_LOCALE_STORAGE_KEY);
    return stored === "en" || stored === "zh-CN"
      ? stored
      : normalizeLocale(browserLanguage);
  } catch {
    return normalizeLocale(browserLanguage);
  }
}

export function setActiveLocale(
  locale: CompanyOSLocale,
  storage?: LocaleStorage,
): void {
  activeLocale = locale;
  try {
    storage?.setItem(COMPANY_OS_LOCALE_STORAGE_KEY, locale);
  } catch {
    // A blocked storage boundary must not prevent the product from rendering.
  }
}

export function getActiveLocale(): CompanyOSLocale {
  return activeLocale;
}

export function t(key: CompanyOSMessageKey): string {
  const value = dictionaries[activeLocale][key];
  if (!value) throw new Error(`Missing Company OS translation: ${key}`);
  return value;
}
