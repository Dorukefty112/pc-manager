import { createContext, useState, useEffect, useContext } from 'react'
import { api, isAuthenticated } from '../api'

const I18nContext = createContext()

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('pcmanager_lang') || 'tr')
  const [translations, setTranslations] = useState({})

  useEffect(() => {
    localStorage.setItem('pcmanager_lang', lang)
    import(`../locales/${lang}.json`).then(mod => {
      setTranslations(mod.default || {})
    }).catch(() => setTranslations({}))

    if (isAuthenticated()) {
      api(`/api/settings`)
        .then(cfg => {
          if (cfg.general?.language && cfg.general.language !== lang) {
            // backend config overrides
          }
        })
        .catch(() => {})
    }
  }, [lang])

  const setLang = (l) => {
    setLangState(l)
    if (isAuthenticated()) {
      api('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ general: { language: l } })
      }).catch(() => {})
    }
  }

  const t = (key) => translations[key] || key

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
