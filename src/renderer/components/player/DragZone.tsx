import React, { useState, useCallback, useRef } from 'react'
import { usePlayerStore } from '../../store/playerStore'

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.ts', '.m2ts', '.mts', '.mpg', '.mpeg', '.ogv',
])

const SUPPORTED_SUBTITLE_EXTENSIONS = new Set([
  '.srt', '.ass', '.ssa', '.sub', '.vtt', '.idx', '.sup', '.smi',
])

function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return ''
  return filePath.substring(dot).toLowerCase()
}

function isVideoFile(filePath: string): boolean {
  return SUPPORTED_VIDEO_EXTENSIONS.has(getExtension(filePath))
}

function isSubtitleFile(filePath: string): boolean {
  return SUPPORTED_SUBTITLE_EXTENSIONS.has(getExtension(filePath))
}

export function DragZone(): React.ReactElement {
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const fileName = usePlayerStore(s => s.fileName)
  const mpvError = usePlayerStore(s => s.mpvError)
  const loadPlaylist = usePlayerStore(s => s.loadPlaylist)
  const dragCounter = useRef(0)

  const handleFiles = useCallback(async (files: { path: string; name: string }[]) => {
    setLoadError(null)

    const videoPaths: string[] = []
    const subtitlePaths: string[] = []

    for (const file of files) {
      const filePath = file.path || file.name
      if (!filePath) continue

      if (isVideoFile(filePath)) {
        videoPaths.push(filePath)
      } else if (isSubtitleFile(filePath)) {
        subtitlePaths.push(filePath)
      }
    }

    // Load subtitle files
    for (const subPath of subtitlePaths) {
      try {
        await window.mpvBridge.addSubtitle(subPath)
        console.log('[DragZone] subtitle added:', subPath)
      } catch (err) {
        console.error('[DragZone] failed to add subtitle:', err)
        setLoadError(`Erreur sous-titre: ${String(err)}`)
      }
    }

    // Load video files as playlist
    if (videoPaths.length > 0) {
      loadPlaylist(videoPaths)
    } else if (subtitlePaths.length === 0) {
      // No supported files found
      const names = files.map(f => f.name || f.path).join(', ')
      setLoadError(`Format non supporté : ${names}`)
    }
  }, [loadPlaylist])

  const handleOpenDialog = useCallback(async () => {
    setLoadError(null)
    try {
      const paths = await window.mpvBridge.openFiles()
      if (paths.length > 0) {
        loadPlaylist(paths)
      }
    } catch (err) {
      setLoadError(`Erreur dialog: ${String(err)}`)
    }
  }, [loadPlaylist])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)

    const droppedFiles = Array.from(e.dataTransfer.files).map(file => ({
      path: (file as File & { path?: string }).path ?? '',
      name: file.name,
    }))

    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles)
    }
  }, [handleFiles])

  const dragHandlers = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  }

  // ── Video playing — invisible drop target ───────────────────────────────
  if (fileName && !mpvError) {
    return (
      <div className="absolute inset-0" {...dragHandlers}>
        {isDragOver && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', zIndex: 10 }}
          >
            <div
              style={{
                padding: '14px 28px',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.85)',
                fontSize: '13px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              Relâcher pour ouvrir
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      {...dragHandlers}
    >
      {/* IPC/load error banner */}
      {loadError && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: '6px',
            padding: '8px 16px',
            color: 'rgba(252,165,165,0.9)',
            fontSize: '12px',
            fontFamily: 'ui-monospace, monospace',
            maxWidth: '480px',
            textAlign: 'center',
            zIndex: 50,
          }}
        >
          {loadError}
        </div>
      )}

      {mpvError ? (
        // ── mpv not found / launch error ──
        <div className="text-center" style={{ maxWidth: '400px', padding: '0 24px' }}>
          <div
            className="flex items-center justify-center mx-auto"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              marginBottom: '20px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="rgba(248,113,113,1)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p style={{ color: 'rgba(248,113,113,0.9)', fontSize: '14px', fontWeight: 500, marginBottom: '10px' }}>
            mpv introuvable
          </p>
          <p style={{
            color: 'rgba(255,255,255,0.35)',
            fontSize: '11px',
            lineHeight: '1.7',
            whiteSpace: 'pre-line',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '6px',
            padding: '10px 14px',
          }}>
            {mpvError}
          </p>
        </div>
      ) : (
        // ── Normal drop zone ──
        <div className="flex flex-col items-center" style={{ opacity: isDragOver ? 1 : 0.7, transition: 'opacity 0.2s' }}>
          {/* Circle — pointer-events-none so drag events pass through to parent */}
          <div
            className="select-none pointer-events-none"
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              border: isDragOver
                ? '1px solid rgba(255,255,255,0.45)'
                : '1px solid rgba(255,255,255,0.14)',
              background: isDragOver ? 'rgba(255,255,255,0.04)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '28px',
              boxShadow: isDragOver ? '0 0 32px rgba(255,255,255,0.06)' : 'none',
              transition: 'all 0.25s ease',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ marginLeft: '3px' }}>
              <path
                d="M6 4.5L20 12L6 19.5V4.5Z"
                fill={isDragOver ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)'}
                style={{ transition: 'fill 0.25s' }}
              />
            </svg>
          </div>

          {/* Open file button — primary action */}
          <button
            onClick={handleOpenDialog}
            style={{
              padding: '10px 28px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.85)',
              fontSize: '13px',
              letterSpacing: '0.06em',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              cursor: 'pointer',
              marginBottom: '20px',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.3)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)'
            }}
          >
            Ouvrir un fichier
          </button>

          {/* Drag hint */}
          <p
            className="select-none pointer-events-none"
            style={{
              color: isDragOver ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              transition: 'color 0.2s',
            }}
          >
            {isDragOver ? 'Relâchez ici' : 'ou glissez des fichiers · MKV · MP4 · AVI · SRT · ASS'}
          </p>
        </div>
      )}
    </div>
  )
}
