/**
 * Cine-Sync Relay Server — Watch Together à distance
 *
 * Déployer sur Deno Deploy :
 * 1. Push ce fichier sur GitHub
 * 2. Va sur https://dash.deno.com → New Project → Link GitHub repo
 * 3. Entry point : relay-server/server.ts
 * 4. Copie l'URL du déploiement (ex: cine-sync-relay.deno.dev)
 * 5. Colle cette URL dans l'app Cine-Sync → Watch Together → En ligne
 */

interface Client {
  socket: WebSocket
  name: string
}

interface Room {
  code: string
  clients: Map<WebSocket, Client>
  createdAt: number
}

const rooms = new Map<string, Room>()

// Génère un code de room court (6 chars)
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // pas de I/O/0/1 pour éviter la confusion
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function getUniqueCode(): string {
  let code = generateCode()
  let attempts = 0
  while (rooms.has(code) && attempts < 100) {
    code = generateCode()
    attempts++
  }
  return code
}

function broadcastToRoom(room: Room, message: string, exclude?: WebSocket): void {
  for (const [ws, _client] of room.clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  }
}

function getRoomUsers(room: Room): string[] {
  return Array.from(room.clients.values()).map(c => c.name)
}

function cleanupRoom(code: string): void {
  const room = rooms.get(code)
  if (room && room.clients.size === 0) {
    rooms.delete(code)
    console.log(`[relay] room ${code} deleted (empty)`)
  }
}

function handleWebSocket(ws: WebSocket, roomCode: string): void {
  const room = rooms.get(roomCode)
  if (!room) {
    ws.close(4004, 'Room not found')
    return
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string)

      switch (msg.type) {
        case 'join': {
          const name = msg.name || 'Guest'
          room.clients.set(ws, { socket: ws, name })
          console.log(`[relay] ${name} joined room ${roomCode} (${room.clients.size} users)`)

          // Envoyer la liste des users à tous
          const users = getRoomUsers(room)
          broadcastToRoom(room, JSON.stringify({ type: 'users', users }))

          // Notifier les autres du join
          broadcastToRoom(room, JSON.stringify({ type: 'join', name }), ws)

          // Demander l'état actuel au premier client (le "host" de facto)
          const firstClient = room.clients.entries().next().value
          if (firstClient && firstClient[0] !== ws) {
            firstClient[0].send(JSON.stringify({ type: 'state-request' }))
          }
          break
        }

        case 'sync': {
          // Relayer à tous les autres
          broadcastToRoom(room, JSON.stringify(msg), ws)
          break
        }

        case 'chat': {
          // Injecter le nom de l'envoyeur
          const client = room.clients.get(ws)
          msg.from = client?.name || 'Guest'
          broadcastToRoom(room, JSON.stringify(msg))
          break
        }

        case 'state': {
          // Relayer l'état (réponse au state-request) à tous sauf l'envoyeur
          broadcastToRoom(room, JSON.stringify(msg), ws)
          break
        }
      }
    } catch {
      // Message malformé, ignorer
    }
  }

  ws.onclose = () => {
    const client = room.clients.get(ws)
    const name = client?.name || 'Guest'
    room.clients.delete(ws)
    console.log(`[relay] ${name} left room ${roomCode} (${room.clients.size} users)`)

    // Notifier les autres
    broadcastToRoom(room, JSON.stringify({ type: 'leave', name }))
    broadcastToRoom(room, JSON.stringify({ type: 'users', users: getRoomUsers(room) }))

    // Supprimer la room si vide
    cleanupRoom(roomCode)
  }

  ws.onerror = () => {
    // Le onclose sera appelé après
  }
}

Deno.serve({ port: 8000 }, (req) => {
  const url = new URL(req.url)

  // CORS headers pour les requêtes HTTP
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // POST /room — créer une room
  if (req.method === 'POST' && url.pathname === '/room') {
    const code = getUniqueCode()
    rooms.set(code, {
      code,
      clients: new Map(),
      createdAt: Date.now(),
    })
    console.log(`[relay] room ${code} created (${rooms.size} total rooms)`)
    return new Response(JSON.stringify({ code }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // GET /room/:code — vérifier si une room existe
  if (req.method === 'GET' && url.pathname.startsWith('/room/')) {
    const code = url.pathname.split('/')[2]?.toUpperCase()
    const room = rooms.get(code || '')
    if (room) {
      return new Response(JSON.stringify({ code, users: room.clients.size }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // WebSocket /ws/:code — rejoindre une room
  if (url.pathname.startsWith('/ws/')) {
    const code = url.pathname.split('/')[2]?.toUpperCase()
    if (!code || !rooms.has(code)) {
      return new Response('Room not found', { status: 404 })
    }

    const { socket, response } = Deno.upgradeWebSocket(req)
    handleWebSocket(socket, code)
    return response
  }

  // GET / — health check
  if (url.pathname === '/') {
    return new Response(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      uptime: Math.floor(performance.now() / 1000),
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  return new Response('Not found', { status: 404 })
})
