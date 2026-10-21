import { useEffect } from 'react'

// The chatbot ID is public widget configuration, not an API secret.
const BOT_ID = (import.meta.env.VITE_CONFERBOT_BOT_ID || '').trim()
console.log('[Neko] Conferbot bot ID:', BOT_ID)
const SCRIPT_ID = 'conferbot-js'
const SCRIPT_URL = 'https://cdn.conferbot.com/dist/v1/widget.min.js'

/** Loads Conferbot once for the signed-in Neko app. Does not replace Neko chat. */
export default function ConferbotWidget() {
  useEffect(() => {
    if (!BOT_ID || !/^[a-f0-9]{24}$/i.test(BOT_ID)) {
      if (BOT_ID) console.warn('Neko Conferbot: VITE_CONFERBOT_BOT_ID must be the 24-character chatbot ID from Conferbot.')
      return
    }

    // StrictMode can mount effects twice in development; reuse the same loader promise.
    if (!window.__nekoConferbotLoads) window.__nekoConferbotLoads = {}
    if (!window.__nekoConferbotLoads[BOT_ID]) {
      window.__nekoConferbotLoads[BOT_ID] = new Promise((resolve, reject) => {
        if (typeof window.ConferbotWidget === 'function') {
          resolve()
          return
        }

        let script = document.getElementById(SCRIPT_ID)
        if (script) {
          script.addEventListener('load', resolve, { once: true })
          script.addEventListener('error', reject, { once: true })
          return
        }

        script = document.createElement('script')
        script.id = SCRIPT_ID
        script.src = SCRIPT_URL
        script.async = true
        script.charset = 'UTF-8'
        script.onload = resolve
        script.onerror = () => reject(new Error('Could not load Conferbot widget script'))
        document.head.appendChild(script)
      }).then(() => {
        if (typeof window.ConferbotWidget !== 'function') {
          throw new Error('Conferbot widget script loaded without exposing its initializer')
        }
        if (window.__nekoConferbotInitializedFor !== BOT_ID) {
          window.ConferbotWidget(BOT_ID, 'live_chat')
          window.__nekoConferbotInitializedFor = BOT_ID
        }
      }).catch(error => {
        delete window.__nekoConferbotLoads[BOT_ID]
        console.error('Neko Conferbot integration failed to initialize.', error)
      })
    }
  }, [])

  return null
}
