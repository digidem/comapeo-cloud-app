import type { Locale } from '@/stores/locale-store';

import enMessages from './messages/en.json';
import esMessages from './messages/es.json';
import ptMessages from './messages/pt.json';

type FlatMessages = Record<string, string>;

function flattenEnMessages(
  msgs: Record<string, { defaultMessage: string }>,
): FlatMessages {
  const flat: FlatMessages = {};
  for (const [key, value] of Object.entries(msgs)) {
    flat[key] = value.defaultMessage;
  }
  return flat;
}

const MESSAGE_CACHE: Record<string, FlatMessages> = {
  en: flattenEnMessages(
    enMessages as Record<string, { defaultMessage: string }>,
  ),
  pt: ptMessages as unknown as FlatMessages,
  es: esMessages as unknown as FlatMessages,
};

export function getMessages(locale: string): FlatMessages {
  return MESSAGE_CACHE[locale] ?? MESSAGE_CACHE['en']!;
}

export const SUPPORTED_LOCALES: Locale[] = ['en', 'pt', 'es'];
