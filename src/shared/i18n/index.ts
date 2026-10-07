'use client';
import { useSyncExternalStore } from 'react';
import { en, ru, type TranslationKey } from './translations';
export type Language = 'ru' | 'en';
let language: Language = 'ru';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
export function setLanguage(value: Language) {
	language = value;
	try {
		localStorage.setItem('worms-language', value);
	} catch {
		/* Language remains usable without storage. */
	}
	document.documentElement.lang = value;
	listeners.forEach((listener) => {
		listener();
	});
}
export function initializeLanguage() {
	try {
		setLanguage(localStorage.getItem('worms-language') === 'en' ? 'en' : 'ru');
	} catch {
		setLanguage('ru');
	}
}
export function useI18n() {
	const locale = useSyncExternalStore(
		subscribe,
		() => language,
		() => 'ru' as Language
	);
	return {
		language: locale,
		setLanguage,
		t: (key: TranslationKey) => (locale === 'ru' ? ru : en)[key],
	};
}
