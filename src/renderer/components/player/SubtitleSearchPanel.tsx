import React, { useState, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { useOsd } from './OsdNotification'

interface SubResult {
  id: string
  fileName: string
  language: string
  rating: number
  downloadCount: number
  fileId: number
  release: string
}

const LANG_FLAGS: Record<string, string> = {
  fr: 'FR',
  en: 'EN',
  es: 'ES',
  de: 'DE',
  it: 'IT',
  pt: 'PT',
  ar: 'AR',
  ja: 'JA',
  ko: 'KO',
  zh: 'ZH',
}

interface SubtitleSearchPanelProps {
  onClose: () => void
}

export function SubtitleSearchPanel({ onClose }: SubtitleSearchPanelProps): React.ReactElement {
  const fileName = usePlayerStore((s) => s.fileName)
  const filePath = usePlayerStore((s) => s.filePath)
  const osdShow = useOsd((s) => s.show)

  const [query, setQuery] = useState(fileName?.replace(/\.[^.]+$/, '') ?? '')
  const [results, setResults] = useState<SubResult[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const res = await window.mpvBridge.searchSubtitles(query.trim(), filePath ?? undefined)
      setResults(res as SubResult[])
      if ((res as SubResult[]).length === 0) {
        setError('Aucun sous-titre trouvé')
      }
    } catch {
      setError('Erreur de recherche')
    } finally {
      setLoading(false)
    }
  }, [query, filePath])

  const handleDownload = useCallback(async (sub: SubResult) => {
    setDownloading(sub.fileId)
    try {
      await window.mpvBridge.downloadSubtitle(sub.fileId)
      osdShow(`Sous-titres chargés : ${sub.language.toUpperCase()}`)
      onClose()
    } catch {
      setError('Erreur de téléchargement')
    } finally {
      setDownloading(null)
    }
  }, [osdShow, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
    e.stopPropagation()
  }, [handleSearch])

  return (
    <div
      className="absolute top-10 right-4 z-30 rounded-lg overflow-hidden flex flex-col"
      style={{
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(12px)',
        width: '400px',
        maxHeight: '70vh',
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">
          Recherche de sous-titres
        </span>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 px-3 py-2 border-b border-white/10">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nom du film..."
          className="flex-1 bg-white/10 text-white text-sm px-3 py-1.5 rounded outline-none focus:bg-white/15 placeholder:text-white/30"
          autoFocus
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm rounded transition-colors"
        >
          {loading ? '...' : 'Chercher'}
        </button>
      </div>

      {/* Results */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: '50vh' }}>
        {error && (
          <div className="px-3 py-3 text-white/40 text-xs text-center">{error}</div>
        )}

        {results.map((sub) => (
          <div
            key={`${sub.id}-${sub.fileId}`}
            className="flex items-start gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
            onClick={() => handleDownload(sub)}
          >
            <div className="flex-shrink-0 mt-0.5">
              <span className="inline-block px-1.5 py-0.5 bg-white/10 text-white/70 text-[10px] font-bold rounded uppercase">
                {LANG_FLAGS[sub.language] ?? sub.language}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/80 text-xs truncate">{sub.fileName}</div>
              {sub.release && sub.release !== sub.fileName && (
                <div className="text-white/40 text-[10px] truncate mt-0.5">{sub.release}</div>
              )}
              <div className="flex gap-3 mt-1 text-white/30 text-[10px]">
                <span>{sub.downloadCount.toLocaleString()} DL</span>
                {sub.rating > 0 && <span>Note : {sub.rating.toFixed(1)}</span>}
              </div>
            </div>
            <div className="flex-shrink-0">
              {downloading === sub.fileId ? (
                <span className="text-blue-400 text-xs">...</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" className="text-white/30">
                  <path d="M8 2v8M5 7l3 3 3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-white/10 text-white/20 text-[10px] text-center">
        Powered by OpenSubtitles.com
      </div>
    </div>
  )
}
