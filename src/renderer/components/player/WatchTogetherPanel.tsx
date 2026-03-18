import React, { useState, useEffect, useCallback, useRef } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { videoEngine } from '../../video/videoEngine'
import { useOsd } from './OsdNotification'

interface SyncAction {
  type: 'sync' | 'state'
  action?: 'pause' | 'play' | 'seek'
  time?: number
  playing?: boolean
}

type SyncRole = 'host' | 'client' | 'relay' | null
type View = 'lobby' | 'create' | 'join'

interface ChatMessage {
  from: string
  text: string
}

interface WatchTogetherPanelProps {
  onClose: () => void
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hue = Math.abs(h) % 360
  return `hsl(${hue}, 55%, 55%)`
}

/* ── Avatar ──────────────────────────────────────────────────────────── */

function Avatar({ name, size = 28 }: { name: string; size?: number }): React.ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: hashColor(name),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.95)',
        letterSpacing: '-0.02em',
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  )
}

/* ── Animated pulse ring ─────────────────────────────────────────────── */

function PulseRing(): React.ReactElement {
  return (
    <div style={{ position: 'relative', width: 10, height: 10 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'rgb(74, 222, 128)',
      }} />
      <div style={{
        position: 'absolute', inset: -3, borderRadius: '50%',
        border: '1.5px solid rgba(74, 222, 128, 0.4)',
        animation: 'wt-pulse 2s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes wt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0; transform: scale(1.8); }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════ */

export function WatchTogetherPanel({ onClose }: WatchTogetherPanelProps): React.ReactElement {
  const osdShow = useOsd((s) => s.show)
  const [view, setView] = useState<View>('lobby')
  const [role, setRole] = useState<SyncRole>(null)
  const [users, setUsers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const ignoreSync = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Shared
  const [pseudo, setPseudo] = useState('')

  // LAN
  const [joinHost, setJoinHost] = useState('')
  const [joinPort, setJoinPort] = useState('9876')
  const [hostPort, setHostPort] = useState('9876')
  const [localIP, setLocalIP] = useState<string | null>(null)

  // Online
  const [serverUrl, setServerUrl] = useState('https://cine-sync-relay.deno.dev')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)

  // Create mode selection
  const [createMode, setCreateMode] = useState<'lan' | 'online' | null>(null)

  // ── Sync listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!role) return

    const cleanupAction = window.mpvBridge.onSyncAction((raw) => {
      const msg = raw as SyncAction
      ignoreSync.current = true
      if (msg.type === 'sync') {
        switch (msg.action) {
          case 'pause': videoEngine.pause(); osdShow('Pause (sync)'); break
          case 'play': videoEngine.play(); osdShow('Lecture (sync)'); break
          case 'seek':
            if (msg.time !== undefined) { videoEngine.seek(msg.time, 'absolute'); osdShow('Seek (sync)') }
            break
        }
      } else if (msg.type === 'state') {
        if (msg.time !== undefined) videoEngine.seek(msg.time, 'absolute')
        if (msg.playing) videoEngine.play(); else videoEngine.pause()
      }
      setTimeout(() => { ignoreSync.current = false }, 500)
    })

    const cleanupUsers = window.mpvBridge.onSyncUsers((u) => setUsers(u))
    const cleanupJoined = window.mpvBridge.onSyncUserJoined((name) => osdShow(`${name} a rejoint`))
    const cleanupLeft = window.mpvBridge.onSyncUserLeft((name) => osdShow(`${name} a quitté`))
    const cleanupDisconnected = window.mpvBridge.onSyncDisconnected(() => {
      osdShow('Déconnecté de la session')
      setRole(null); setUsers([]); setChatMessages([]); setRoomCode('')
      setView('lobby'); setCreateMode(null)
    })
    const cleanupChat = window.mpvBridge.onSyncChat((msg) => {
      setChatMessages((prev) => [...prev, { from: msg.from, text: msg.text }])
    })
    const cleanupStateReq = window.mpvBridge.onSyncStateRequest(() => {
      const { isPlaying, timePos } = usePlayerStore.getState()
      window.mpvBridge.syncSendState(isPlaying, timePos)
    })

    return () => {
      cleanupAction(); cleanupUsers(); cleanupJoined(); cleanupLeft()
      cleanupDisconnected(); cleanupChat(); cleanupStateReq()
    }
  }, [role, osdShow])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  useEffect(() => {
    if (!role) return
    const store = usePlayerStore
    let prevPlaying = store.getState().isPlaying
    let prevTime = store.getState().timePos
    const unsub = store.subscribe((state) => {
      if (ignoreSync.current) return
      if (state.isPlaying !== prevPlaying) {
        prevPlaying = state.isPlaying
        window.mpvBridge.syncSend(state.isPlaying ? 'play' : 'pause')
      }
      const timeDelta = Math.abs(state.timePos - prevTime)
      if (timeDelta > 2 && state.timePos > 0) window.mpvBridge.syncSend('seek', state.timePos)
      prevTime = state.timePos
    })
    return unsub
  }, [role])

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleHostLAN = useCallback(async () => {
    setError(null)
    try {
      const res = await window.mpvBridge.syncHost(parseInt(hostPort) || 9876)
      if ((res as { ok: boolean }).ok) {
        setRole('host'); setUsers(['Hôte']); setChatMessages([])
        osdShow('Session créée')
        const ip = await window.mpvBridge.syncGetLocalIP()
        setLocalIP(ip)
      }
    } catch { setError('Impossible de créer la session') }
  }, [hostPort, osdShow])

  const handleJoinLAN = useCallback(async () => {
    if (!joinHost.trim()) { setError('Entrez une adresse IP'); return }
    setError(null)
    try {
      const res = await window.mpvBridge.syncJoin(joinHost.trim(), parseInt(joinPort) || 9876, pseudo.trim() || 'Guest')
      if ((res as { ok: boolean }).ok) { setRole('client'); setChatMessages([]); osdShow('Connecté') }
    } catch { setError('Connexion impossible') }
  }, [joinHost, joinPort, pseudo, osdShow])

  const handleCreateRoom = useCallback(async () => {
    setError(null); setLoading(true)
    try {
      const res = await window.mpvBridge.relayCreate(serverUrl.trim(), pseudo.trim() || 'Host')
      setRole('relay'); setRoomCode(res.code); setChatMessages([]); osdShow(`Room ${res.code}`)
    } catch { setError('Impossible de créer la room') }
    finally { setLoading(false) }
  }, [serverUrl, pseudo, osdShow])

  const handleJoinRoom = useCallback(async () => {
    if (!joinCode.trim()) { setError('Entrez un code'); return }
    setError(null); setLoading(true)
    try {
      await window.mpvBridge.relayJoin(serverUrl.trim(), joinCode.trim().toUpperCase(), pseudo.trim() || 'Guest')
      setRole('relay'); setRoomCode(joinCode.trim().toUpperCase()); setChatMessages([]); osdShow('Connecté')
    } catch { setError('Room introuvable') }
    finally { setLoading(false) }
  }, [serverUrl, joinCode, pseudo, osdShow])

  const handleDisconnect = useCallback(async () => {
    await window.mpvBridge.syncStop()
    setRole(null); setUsers([]); setChatMessages([]); setLocalIP(null); setRoomCode('')
    setView('lobby'); setCreateMode(null); osdShow('Session terminée')
  }, [osdShow])

  const handleSendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    window.mpvBridge.syncSendChat(text)
    setChatInput('')
  }, [chatInput])

  const handleSmartJoin = useCallback(async () => {
    const code = joinCode.trim().toUpperCase()
    // If it looks like an IP address → LAN join
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(code)) {
      const parts = code.split(':')
      setJoinHost(parts[0])
      if (parts[1]) setJoinPort(parts[1])
      // Trigger LAN join
      setError(null)
      try {
        const res = await window.mpvBridge.syncJoin(parts[0], parseInt(parts[1] || '9876'), pseudo.trim() || 'Guest')
        if ((res as { ok: boolean }).ok) { setRole('client'); setChatMessages([]); osdShow('Connecté') }
      } catch { setError('Connexion impossible') }
    } else if (code.length >= 4) {
      // Otherwise → room code (online)
      await handleJoinRoom()
    } else {
      setError('Entrez un code room ou une adresse IP')
    }
  }, [joinCode, pseudo, osdShow, handleJoinRoom])

  /* ════════════════════════════════════════════════════════════════════ */

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 44,
    right: 16,
    zIndex: 30,
    width: 360,
    borderRadius: 14,
    background: 'rgba(8, 8, 12, 0.92)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  }

  return (
    <div style={panelStyle} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {role && <PulseRing />}
          <span style={{
            color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600,
            letterSpacing: '0.01em',
          }}>
            Watch Together
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          margin: '10px 14px 0', padding: '8px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
          color: 'rgba(252,165,165,0.9)', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {!role ? (
        /* ══════════════════════════════════════════════════════════════ */
        /* ── LOBBY (not connected) ─────────────────────────────────── */
        /* ══════════════════════════════════════════════════════════════ */
        <div style={{ padding: '16px 18px 20px' }}>

          {/* Pseudo — always visible */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Pseudo
            </div>
            <input
              type="text"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="Ton nom..."
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {view === 'lobby' && (
            <>
              {/* Two big action buttons */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <button
                  onClick={() => { setView('create'); setError(null) }}
                  style={{
                    flex: 1, padding: '14px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 15%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent, rgb(59,130,246))" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}>Créer</span>
                </button>

                <button
                  onClick={() => { setView('join'); setError(null) }}
                  style={{
                    flex: 1, padding: '14px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round">
                      <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
                    </svg>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}>Rejoindre</span>
                </button>
              </div>
            </>
          )}

          {/* ── CREATE view ─────────────────────────────────────────── */}
          {view === 'create' && (
            <div>
              <button
                onClick={() => { setView('lobby'); setCreateMode(null); setError(null) }}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  fontSize: 11, cursor: 'pointer', marginBottom: 12, padding: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                Retour
              </button>

              {!createMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={() => setCreateMode('lan')}
                    style={{
                      padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2" strokeLinecap="round"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" /></svg>
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500 }}>Réseau local</div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 }}>Même WiFi</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setCreateMode('online')}
                    style={{
                      padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--accent, rgb(59,130,246)) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent, rgb(59,130,246))" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
                    </div>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500 }}>En ligne</div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 }}>Via serveur relais</div>
                    </div>
                  </button>
                </div>
              ) : createMode === 'lan' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text" value={hostPort} onChange={(e) => setHostPort(e.target.value)} placeholder="Port"
                    style={{
                      width: 72, padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, outline: 'none',
                      fontFamily: 'ui-monospace, monospace', textAlign: 'center',
                    }}
                  />
                  <button
                    onClick={handleHostLAN}
                    style={{
                      flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none',
                      background: 'var(--accent, rgb(59,130,246))', color: '#fff', fontSize: 13,
                      fontWeight: 500, cursor: 'pointer', transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    Créer la session
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="URL du serveur relais"
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 11, outline: 'none',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  />
                  <button
                    onClick={handleCreateRoom}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none',
                      background: 'var(--accent, rgb(59,130,246))', color: '#fff', fontSize: 13,
                      fontWeight: 500, cursor: loading ? 'wait' : 'pointer', transition: 'opacity 0.15s',
                      opacity: loading ? 0.6 : 1,
                    }}
                  >
                    {loading ? 'Création...' : 'Créer une room'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── JOIN view ──────────────────────────────────────────── */}
          {view === 'join' && (
            <div>
              <button
                onClick={() => { setView('lobby'); setError(null) }}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  fontSize: 11, cursor: 'pointer', marginBottom: 12, padding: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                Retour
              </button>

              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Code room ou adresse IP
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSmartJoin(); e.stopPropagation() }}
                  placeholder="ABC123 ou 192.168.1.10:9876"
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none',
                    fontFamily: 'ui-monospace, monospace', letterSpacing: '0.08em', textAlign: 'center',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  autoFocus
                />
                <button
                  onClick={handleSmartJoin}
                  disabled={loading}
                  style={{
                    padding: '10px 18px', borderRadius: 8, border: 'none',
                    background: 'var(--accent, rgb(59,130,246))', color: '#fff', fontSize: 13,
                    fontWeight: 500, cursor: loading ? 'wait' : 'pointer', transition: 'opacity 0.15s',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Go
                </button>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 8, textAlign: 'center' }}>
                Entre un code room (en ligne) ou une IP:port (LAN)
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════ */
        /* ── CONNECTED ─────────────────────────────────────────────── */
        /* ══════════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', height: 420, maxHeight: '70vh' }}>

          {/* ── Room info bar ────────────────────────────────────────── */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {/* LAN: show IP */}
            {role === 'host' && localIP && (
              <div
                onClick={() => { navigator.clipboard.writeText(`${localIP}:${hostPort}`); osdShow('Copié') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Adresse</div>
                  <div style={{ color: '#fff', fontSize: 14, fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>{localIP}:{hostPort}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              </div>
            )}

            {/* Online: show room code BIG */}
            {role === 'relay' && roomCode && (
              <div
                onClick={() => { navigator.clipboard.writeText(roomCode); osdShow('Code copié') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Code room</div>
                  <div style={{
                    color: '#fff', fontSize: 22, fontFamily: 'ui-monospace, monospace',
                    fontWeight: 700, letterSpacing: '0.2em', marginTop: 2,
                  }}>{roomCode}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              </div>
            )}

            {role === 'client' && (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Connecté au réseau local</div>
            )}
          </div>

          {/* ── Participants ──────────────────────────────────────────── */}
          {users.length > 0 && (
            <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Participants
                </span>
                <span style={{
                  background: 'rgba(255,255,255,0.08)', borderRadius: 10,
                  padding: '1px 7px', fontSize: 10, color: 'rgba(255,255,255,0.4)',
                }}>{users.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {users.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', borderRadius: 20, background: 'rgba(255,255,255,0.04)' }}>
                    <Avatar name={u} size={22} />
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{u}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Chat (always visible when connected) ─────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
              {chatMessages.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>
                  Pas encore de messages
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <Avatar name={msg.from} size={22} />
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600 }}>{msg.from}</span>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 1, lineHeight: 1.4 }}>{msg.text}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div style={{
              padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', gap: 8,
            }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); e.stopPropagation() }}
                placeholder="Message..."
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, outline: 'none',
                }}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: chatInput.trim() ? 'var(--accent, rgb(59,130,246))' : 'rgba(255,255,255,0.04)',
                  color: chatInput.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
                  fontSize: 13, cursor: chatInput.trim() ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            </div>
          </div>

          {/* ── Disconnect ───────────────────────────────────────────── */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={handleDisconnect}
              style={{
                width: '100%', padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                background: 'rgba(239,68,68,0.08)', color: 'rgba(252,165,165,0.9)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            >
              Quitter la session
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
