import React, { useState, useEffect, useCallback, useRef } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { useOsd } from './OsdNotification'

interface SyncAction {
  type: 'sync' | 'state'
  action?: 'pause' | 'play' | 'seek'
  time?: number
  playing?: boolean
}

type SyncRole = 'host' | 'client' | null

interface ChatMessage {
  from: string
  text: string
}

interface WatchTogetherPanelProps {
  onClose: () => void
}

export function WatchTogetherPanel({ onClose }: WatchTogetherPanelProps): React.ReactElement {
  const osdShow = useOsd((s) => s.show)
  const [role, setRole] = useState<SyncRole>(null)
  const [users, setUsers] = useState<string[]>([])
  const [joinHost, setJoinHost] = useState('')
  const [joinPort, setJoinPort] = useState('9876')
  const [joinName, setJoinName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hostPort, setHostPort] = useState('9876')
  const [localIP, setLocalIP] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const ignoreSync = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Listen for sync actions from remote
  useEffect(() => {
    if (!role) return

    const cleanupAction = window.mpvBridge.onSyncAction((raw) => {
      const msg = raw as SyncAction
      ignoreSync.current = true

      if (msg.type === 'sync') {
        switch (msg.action) {
          case 'pause':
            window.mpvBridge.pause()
            osdShow('Pause (sync)')
            break
          case 'play':
            window.mpvBridge.play()
            osdShow('Lecture (sync)')
            break
          case 'seek':
            if (msg.time !== undefined) {
              window.mpvBridge.seek(msg.time, 'absolute')
              osdShow(`Seek (sync)`)
            }
            break
        }
      } else if (msg.type === 'state') {
        if (msg.time !== undefined) {
          window.mpvBridge.seek(msg.time, 'absolute')
        }
        if (msg.playing) window.mpvBridge.play()
        else window.mpvBridge.pause()
      }

      setTimeout(() => { ignoreSync.current = false }, 500)
    })

    const cleanupUsers = window.mpvBridge.onSyncUsers((u) => setUsers(u))

    const cleanupJoined = window.mpvBridge.onSyncUserJoined((name) => {
      osdShow(`${name} a rejoint`)
    })

    const cleanupLeft = window.mpvBridge.onSyncUserLeft((name) => {
      osdShow(`${name} a quitté`)
    })

    const cleanupDisconnected = window.mpvBridge.onSyncDisconnected(() => {
      osdShow('Déconnecté de la session')
      setRole(null)
      setUsers([])
      setChatMessages([])
    })

    const cleanupChat = window.mpvBridge.onSyncChat((msg) => {
      setChatMessages((prev) => [...prev, { from: msg.from, text: msg.text }])
    })

    return () => {
      cleanupAction()
      cleanupUsers()
      cleanupJoined()
      cleanupLeft()
      cleanupDisconnected()
      cleanupChat()
    }
  }, [role, osdShow])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Intercept local playback actions to broadcast to sync
  useEffect(() => {
    if (!role) return

    const store = usePlayerStore
    let prevPlaying = store.getState().isPlaying
    let prevTime = store.getState().timePos

    const unsub = store.subscribe((state) => {
      if (ignoreSync.current) return

      // Detect pause/play changes
      if (state.isPlaying !== prevPlaying) {
        prevPlaying = state.isPlaying
        window.mpvBridge.syncSend(state.isPlaying ? 'play' : 'pause')
      }

      // Detect seeks (time jumps > 2s)
      const timeDelta = Math.abs(state.timePos - prevTime)
      if (timeDelta > 2 && state.timePos > 0) {
        window.mpvBridge.syncSend('seek', state.timePos)
      }
      prevTime = state.timePos
    })

    return unsub
  }, [role])

  const handleHost = useCallback(async () => {
    setError(null)
    try {
      const res = await window.mpvBridge.syncHost(parseInt(hostPort) || 9876)
      if ((res as { ok: boolean }).ok) {
        setRole('host')
        setUsers(['Hôte'])
        setChatMessages([])
        osdShow('Session créée — en attente de connexions')
        const ip = await window.mpvBridge.syncGetLocalIP()
        setLocalIP(ip)
      }
    } catch {
      setError('Impossible de créer la session')
    }
  }, [hostPort, osdShow])

  const handleJoin = useCallback(async () => {
    if (!joinHost.trim()) { setError('Entrez une adresse IP'); return }
    setError(null)
    try {
      const res = await window.mpvBridge.syncJoin(
        joinHost.trim(),
        parseInt(joinPort) || 9876,
        joinName.trim() || 'Guest'
      )
      if ((res as { ok: boolean }).ok) {
        setRole('client')
        setChatMessages([])
        osdShow('Connecté à la session')
      }
    } catch {
      setError('Impossible de se connecter')
    }
  }, [joinHost, joinPort, joinName, osdShow])

  const handleDisconnect = useCallback(async () => {
    await window.mpvBridge.syncStop()
    setRole(null)
    setUsers([])
    setChatMessages([])
    setLocalIP(null)
    osdShow('Session terminée')
  }, [osdShow])

  const handleSendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    window.mpvBridge.syncSendChat(text)
    setChatInput('')
  }, [chatInput])

  return (
    <div
      className="absolute top-10 right-4 z-30 rounded-lg overflow-hidden"
      style={{
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(12px)',
        width: '340px',
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">
          Watch Together
        </span>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/20 text-red-300 text-xs">{error}</div>
      )}

      {!role ? (
        <div className="p-3 space-y-4">
          {/* Host section */}
          <div>
            <div className="text-white/50 text-[10px] uppercase tracking-wider mb-2">Créer une session</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value)}
                placeholder="Port"
                className="w-20 bg-white/10 text-white text-sm px-2 py-1.5 rounded outline-none focus:bg-white/15 placeholder:text-white/30"
              />
              <button
                onClick={handleHost}
                className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors"
              >
                Héberger
              </button>
            </div>
          </div>

          <div className="border-t border-white/10" />

          {/* Join section */}
          <div>
            <div className="text-white/50 text-[10px] uppercase tracking-wider mb-2">Rejoindre une session</div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinHost}
                  onChange={(e) => setJoinHost(e.target.value)}
                  placeholder="Adresse IP"
                  className="flex-1 bg-white/10 text-white text-sm px-2 py-1.5 rounded outline-none focus:bg-white/15 placeholder:text-white/30"
                />
                <input
                  type="text"
                  value={joinPort}
                  onChange={(e) => setJoinPort(e.target.value)}
                  placeholder="Port"
                  className="w-20 bg-white/10 text-white text-sm px-2 py-1.5 rounded outline-none focus:bg-white/15 placeholder:text-white/30"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Ton pseudo"
                  className="flex-1 bg-white/10 text-white text-sm px-2 py-1.5 rounded outline-none focus:bg-white/15 placeholder:text-white/30"
                />
                <button
                  onClick={handleJoin}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                >
                  Rejoindre
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {/* Connected state */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-medium">
              {role === 'host' ? 'Session active (hôte)' : 'Connecté'}
            </span>
          </div>

          {role === 'host' && localIP && (
            <div className="bg-white/5 rounded px-2 py-1.5">
              <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
                Partagez cette adresse
              </div>
              <div
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => {
                  navigator.clipboard.writeText(`${localIP}:${hostPort}`)
                  osdShow('Adresse copiée')
                }}
              >
                <span className="text-white/90 text-sm font-mono">
                  {localIP}:{hostPort}
                </span>
                <span className="text-white/30 text-[10px] group-hover:text-white/60 transition-colors">
                  copier
                </span>
              </div>
            </div>
          )}

          {/* Users list */}
          {users.length > 0 && (
            <div>
              <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
                Participants ({users.length})
              </div>
              {users.map((u, i) => (
                <div key={i} className="text-white/70 text-xs py-0.5 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
                  {u}
                </div>
              ))}
            </div>
          )}

          {/* Chat section */}
          <div className="border-t border-white/10 pt-2">
            <button
              onClick={() => setChatOpen((v) => !v)}
              className="flex items-center gap-1.5 text-white/40 text-[10px] uppercase tracking-wider hover:text-white/60 transition-colors w-full"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className={`transition-transform ${chatOpen ? 'rotate-90' : ''}`}
              >
                <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              Chat
              {chatMessages.length > 0 && (
                <span className="ml-auto text-white/20">{chatMessages.length}</span>
              )}
            </button>

            {chatOpen && (
              <div className="mt-2 space-y-2">
                {/* Message list */}
                <div
                  className="overflow-y-auto space-y-1"
                  style={{ maxHeight: '150px' }}
                >
                  {chatMessages.length === 0 && (
                    <div className="text-white/20 text-[10px] text-center py-2">
                      Aucun message
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className="text-xs">
                      <span className="text-blue-400/80 font-medium">{msg.from}</span>
                      <span className="text-white/60 ml-1.5">{msg.text}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat input */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendChat()
                      e.stopPropagation()
                    }}
                    placeholder="Message..."
                    className="flex-1 bg-white/10 text-white text-xs px-2 py-1.5 rounded outline-none focus:bg-white/15 placeholder:text-white/30"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim()}
                    className="px-2 py-1.5 bg-blue-600/80 hover:bg-blue-500 disabled:bg-white/5 disabled:text-white/20 text-white text-xs rounded transition-colors"
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded transition-colors"
          >
            Déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
