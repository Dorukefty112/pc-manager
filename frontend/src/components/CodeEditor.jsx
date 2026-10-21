import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'

// Dosya uzantısına göre dil paketini yalnızca gerektiğinde yükle
async function languageFor(filename) {
  const name = filename.toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop() : ''
  if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'].includes(ext)) {
    const { javascript } = await import('@codemirror/lang-javascript')
    return javascript({ jsx: ext.includes('x'), typescript: ext.startsWith('t') })
  }
  if (ext === 'py') return (await import('@codemirror/lang-python')).python()
  if (ext === 'json') return (await import('@codemirror/lang-json')).json()
  if (['yml', 'yaml'].includes(ext) || name.endsWith('compose.yml')) return (await import('@codemirror/lang-yaml')).yaml()
  if (['md', 'markdown'].includes(ext)) return (await import('@codemirror/lang-markdown')).markdown()
  if (['html', 'htm', 'vue', 'svelte'].includes(ext)) return (await import('@codemirror/lang-html')).html()
  if (['css', 'scss', 'less'].includes(ext)) return (await import('@codemirror/lang-css')).css()
  return null
}

export default function CodeEditor({ value, filename, onChange, onSave }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const handlers = useRef({ onChange, onSave })
  handlers.current = { onChange, onSave }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const lang = await languageFor(filename || '')
      if (cancelled) return
      viewRef.current = new EditorView({
        doc: value,
        parent: hostRef.current,
        extensions: [
          basicSetup,
          keymap.of([
            indentWithTab,
            { key: 'Mod-s', preventDefault: true, run: () => { handlers.current.onSave?.(); return true } },
          ]),
          oneDark,
          EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace" } }),
          EditorView.updateListener.of(u => { if (u.docChanged) handlers.current.onChange?.(u.state.doc.toString()) }),
          ...(lang ? [lang] : []),
        ],
      })
    })()
    return () => { cancelled = true; viewRef.current?.destroy(); viewRef.current = null }
    // value yalnızca ilk açılışta kullanılır; sonraki değişiklikler editörün kendisinden gelir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename])

  return <div ref={hostRef} style={{ height: '100%', overflow: 'hidden', borderRadius: 10 }} />
}
