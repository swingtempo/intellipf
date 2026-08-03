import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

let initialized = false

export function initI18n() {
  if (initialized) return i18n
  initialized = true
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  return i18n
}
