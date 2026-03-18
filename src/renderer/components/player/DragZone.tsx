import React, { useState, useCallback, useRef, useEffect } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { videoEngine } from '../../video/videoEngine'

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.ts', '.m2ts', '.mts', '.mpg', '.mpeg', '.ogv',
])

const SUPPORTED_SUBTITLE_EXTENSIONS = new Set([
  '.srt', '.ass', '.ssa', '.sub', '.vtt', '.idx', '.sup', '.smi',
])

interface RecentFile {
  filePath: string
  fileName: string
  position: number
  duration: number
  timestamp: number
}

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

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "maintenant"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  return `${days}j`
}

/* ── Styles ──────────────────────────────────────────────────────────── */

const CSS = `
  @keyframes dz-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes dz-glow {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
  .dz-recent-card {
    transition: background 0.2s, transform 0.15s, border-color 0.2s;
  }
  .dz-recent-card:hover {
    background: rgba(255,255,255,0.05) !important;
    border-color: rgba(255,255,255,0.1) !important;
    transform: translateY(-1px);
  }
  .dz-recent-card:hover .dz-play-icon {
    opacity: 1 !important;
    color: var(--accent, rgb(59,130,246)) !important;
  }
  .dz-open-btn {
    transition: all 0.2s;
  }
  .dz-open-btn:hover {
    background: var(--accent, rgb(59,130,246)) !important;
    border-color: var(--accent, rgb(59,130,246)) !important;
    color: #fff !important;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--accent, rgb(59,130,246)) 30%, transparent);
  }
`

interface DragZoneProps {
  onOpenWatchTogether?: () => void
}

export function DragZone({ onOpenWatchTogether }: DragZoneProps = {}): React.ReactElement {
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const fileName = usePlayerStore(s => s.fileName)
  const mpvError = usePlayerStore(s => s.mpvError)
  const loadPlaylist = usePlayerStore(s => s.loadPlaylist)
  const dragCounter = useRef(0)

  useEffect(() => {
    if (!fileName && !mpvError) {
      window.mpvBridge.getRecentFiles().then(setRecentFiles).catch(() => {})
    }
  }, [fileName, mpvError])

  const handleFiles = useCallback(async (files: { path: string; name: string }[]) => {
    setLoadError(null)
    const videoPaths: string[] = []
    const subtitlePaths: string[] = []

    for (const file of files) {
      const filePath = file.path || file.name
      if (!filePath) continue
      if (isVideoFile(filePath)) videoPaths.push(filePath)
      else if (isSubtitleFile(filePath)) subtitlePaths.push(filePath)
    }

    for (const subPath of subtitlePaths) {
      try {
        const { content, fileName: subName } = await window.mpvBridge.readSubtitleFile(subPath)
        await videoEngine.addSubtitle(content, subName, 'fr')
      } catch (err) {
        setLoadError(`Erreur sous-titre: ${String(err)}`)
      }
    }

    if (videoPaths.length > 0) loadPlaylist(videoPaths)
    else if (subtitlePaths.length === 0) {
      setLoadError(`Format non supporté`)
    }
  }, [loadPlaylist])

  const handleOpenDialog = useCallback(async () => {
    setLoadError(null)
    try {
      const paths = await window.mpvBridge.openFiles()
      if (paths.length > 0) loadPlaylist(paths)
    } catch (err) { setLoadError(`Erreur: ${String(err)}`) }
  }, [loadPlaylist])

  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false) }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current = 0; setIsDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files).map(file => ({
      path: (file as File & { path?: string }).path ?? '', name: file.name,
    }))
    if (droppedFiles.length > 0) handleFiles(droppedFiles)
  }, [handleFiles])

  const dragHandlers = { onDragEnter: handleDragEnter, onDragLeave: handleDragLeave, onDragOver: handleDragOver, onDrop: handleDrop }

  // ── Video playing — invisible drop target
  if (fileName && !mpvError) {
    return (
      <div className="absolute inset-0" {...dragHandlers}>
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', zIndex: 10 }}>
            <div style={{
              padding: '20px 40px', borderRadius: 16,
              border: '2px dashed var(--accent, rgb(59,130,246))',
              color: '#fff', fontSize: 14, fontWeight: 500,
              background: 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 8%, transparent)',
            }}>
              Relâcher pour ouvrir
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Empty state
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" {...dragHandlers}>
      <style>{CSS}</style>

      {/* Error banner */}
      {loadError && (
        <div style={{
          position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10, padding: '8px 18px', color: 'rgba(252,165,165,0.9)',
          fontSize: 12, zIndex: 50, backdropFilter: 'blur(12px)',
        }}>
          {loadError}
        </div>
      )}

      {mpvError ? (
        <div className="text-center" style={{ maxWidth: 400, padding: '0 24px', animation: 'dz-fade-in 0.3s ease' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.8)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p style={{ color: 'rgba(248,113,113,0.9)', fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Erreur</p>
          <p style={{
            color: 'rgba(255,255,255,0.3)', fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-line',
            fontFamily: 'ui-monospace, monospace', background: 'rgba(255,255,255,0.02)',
            borderRadius: 8, padding: '10px 14px',
          }}>{mpvError}</p>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          opacity: isDragOver ? 1 : 0.85, transition: 'opacity 0.3s',
          animation: 'dz-fade-in 0.4s ease',
          maxWidth: 520, width: '100%', padding: '0 32px',
        }}>
          {/* App name */}
          <div style={{
            color: 'rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 32,
          }}>
            Cine-Sync
          </div>

          {/* Drop zone area */}
          <div style={{
            width: '100%', padding: '40px 24px',
            borderRadius: 16, border: isDragOver
              ? '2px dashed var(--accent, rgb(59,130,246))'
              : '1px solid rgba(255,255,255,0.04)',
            background: isDragOver
              ? 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 5%, transparent)'
              : 'rgba(255,255,255,0.015)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            transition: 'all 0.3s ease',
          }}>
            {/* Play icon */}
            <div className="select-none pointer-events-none" style={{
              width: 64, height: 64, borderRadius: 20, marginBottom: 24,
              background: isDragOver
                ? 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 15%, transparent)'
                : 'rgba(255,255,255,0.03)',
              border: isDragOver
                ? '1px solid color-mix(in srgb, var(--accent, rgb(59,130,246)) 30%, transparent)'
                : '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" style={{ marginLeft: 2 }}>
                <path d="M7 4.5v15l13-7.5z"
                  fill={isDragOver ? 'var(--accent, rgb(59,130,246))' : 'rgba(255,255,255,0.2)'}
                  style={{ transition: 'fill 0.3s' }}
                />
              </svg>
            </div>

            {/* Open button */}
            <button onClick={handleOpenDialog} className="dz-open-btn" style={{
              padding: '11px 32px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', marginBottom: 14,
            }}>
              Ouvrir un fichier
            </button>

            {/* Drag hint */}
            <p className="select-none pointer-events-none" style={{
              color: isDragOver ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
              fontSize: 11, transition: 'color 0.2s',
            }}>
              {isDragOver ? 'Relâchez pour ouvrir' : 'ou glissez un fichier ici'}
            </p>
          </div>

          {/* Watch Together button on home screen */}
          {onOpenWatchTogether && (
            <button
              onClick={onOpenWatchTogether}
              className="dz-open-btn"
              style={{
                marginTop: 16, padding: '9px 20px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
                color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
              Watch Together
            </button>
          )}

          {/* Recent files */}
          {recentFiles.length > 0 && (
            <div style={{ marginTop: 28, width: '100%' }}>
              <div className="select-none pointer-events-none" style={{
                color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10,
              }}>
                Reprendre
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentFiles.slice(0, 5).map((file, i) => {
                  const progressPct = file.duration > 0 ? Math.min((file.position / file.duration) * 100, 100) : 0
                  return (
                    <button
                      key={file.filePath}
                      onClick={() => loadPlaylist([file.filePath])}
                      className="dz-recent-card"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.02)',
                        cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden',
                        animationDelay: `${i * 60}ms`, animation: 'dz-fade-in 0.3s ease backwards',
                      }}
                    >
                      {/* Progress bar at bottom */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, height: 2,
                        width: `${progressPct}%`,
                        background: 'var(--accent-muted, rgba(59,130,246,0.5))',
                        borderRadius: '0 1px 0 0',
                      }} />

                      {/* Play icon */}
                      <div className="dz-play-icon" style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: 'rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.15)', opacity: 0.6,
                        transition: 'all 0.2s',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24">
                          <path d="M8 5.5L18 12L8 18.5V5.5Z" fill="currentColor" />
                        </svg>
                      </div>

                      {/* File info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {file.fileName}
                        </div>
                        <div style={{
                          color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 2,
                          fontFamily: 'ui-monospace, monospace',
                        }}>
                          {formatDuration(file.position)} / {formatDuration(file.duration)}
                        </div>
                      </div>

                      {/* Time ago */}
                      <div style={{
                        color: 'rgba(255,255,255,0.12)', fontSize: 10,
                        fontFamily: 'ui-monospace, monospace', flexShrink: 0,
                      }}>
                        {formatTimeAgo(file.timestamp)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
