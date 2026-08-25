import createContentApp from './ContentApp'
// import './styles.css'

console.log('[From the page context] Hello from content_scripts!')

/**
 * Extension.js content_script entrypoint. The framework calls this on
 * injection and calls the returned function on HMR/teardown to clean up.
 * Do not invoke it yourself.
 */
export default function initial() {
  const rootDiv = document.createElement('div')
  rootDiv.setAttribute('data-extension-root', 'true')
  // Isolate the host from page styles (e.g. example.com ships div{opacity:.8},
  // which would otherwise fade the whole widget): the shadow DOM only protects
  // descendants; the host element itself still takes page CSS.
  rootDiv.style.cssText = 'all: initial !important'
  document.body.appendChild(rootDiv)

  // Injecting content_scripts inside a shadow dom
  // prevents conflicts with the host page's styles.
  // This way, styles from the extension won't leak into the host page.
  const shadowRoot = rootDiv.attachShadow({mode: 'open'})

  const styleElement = document.createElement('style')
  shadowRoot.appendChild(styleElement)

  fetchCSS().then((response) => (styleElement.textContent = response))

  // Render ContentApp inside shadow root
  const container = createContentApp()
  shadowRoot.appendChild(container)

  return () => {
    rootDiv.remove()
  }
}

function getValueByClassName(className: string): string | null {
  const selector = className.startsWith('.') ? className : `.${className}`
  const el = document.querySelector(selector)
  if (!el) return null
  const formEl = el as HTMLInputElement
  return typeof formEl.value === 'string' ? formEl.value : el.textContent?.trim() ?? null
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'getValuesByClassName') return
  sendResponse(Object.fromEntries(
    message.classNames.map((c: string) => [c, getValueByClassName(c)])
  ))
})

async function fetchCSS() {
  const cssUrl = new URL('./styles.css', import.meta.url)
  const response = await fetch(cssUrl)
  const text = await response.text()
  return response.ok ? text : Promise.reject(text)
}
