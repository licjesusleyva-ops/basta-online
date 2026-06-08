const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

const rooms = {}
const letters = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'

function randomLetter() {
  return letters[Math.floor(Math.random() * letters.length)]
}

function getRoom(room) {
  if (!rooms[room]) {
    rooms[room] = {
      players: [],
      letter: 'A',
      phase: 'waiting', // Fases: 'waiting', 'playing', 'voting', 'results'
      answers: {},
      scores: {},
      votes: {} // Aquí guardaremos los votos de todos
    }
  }
  return rooms[room]
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ room, name }) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const cleanName = String(name || 'Jugador').trim()
    if (!cleanRoom) return

    socket.join(cleanRoom)
    socket.data.room = cleanRoom
    socket.data.name = cleanName

    const gameRoom = getRoom(cleanRoom)
    if (!gameRoom.players.find(p => p.id === socket.id)) {
      gameRoom.players.push({ id: socket.id, name: cleanName, total: 0 })
    }
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('start-game', (room) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const gameRoom = getRoom(cleanRoom)
    gameRoom.letter = randomLetter()
    gameRoom.phase = 'playing'
    gameRoom.answers = {}
    gameRoom.scores = {}
    gameRoom.votes = {}
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('submit-answers', ({ room, answers }) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const gameRoom = getRoom(cleanRoom)
    if (!socket.data.name) return

    gameRoom.answers[socket.id] = { player: socket.data.name, answers }
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('basta', (room) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const gameRoom = getRoom(cleanRoom)
    gameRoom.phase = 'voting' // Pasamos a la fase de votación
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('submit-votes', ({ room, votes }) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const gameRoom = getRoom(cleanRoom)
    
    // Guardamos los votos de este jugador
    gameRoom.votes[socket.id] = votes

    // Verificamos si ya votaron todos los jugadores de la sala
    if (Object.keys(gameRoom.votes).length >= gameRoom.players.length) {
      const scores = {}
      
      // Contamos los votos palabra por palabra
      Object.entries(gameRoom.answers).forEach(([targetId, payload]) => {
        let points = 0
        Object.entries(payload.answers || {}).forEach(([category, answer]) => {
          if (!answer || !String(answer).trim()) return // Sin respuesta = 0 pts

          let yes = 0
          let no = 0

          // Recorremos los votos de los demás
          Object.values(gameRoom.votes).forEach(playerVotes => {
            const vote = playerVotes[targetId]?.[category]
            if (vote === true) yes++
            if (vote === false) no++
          })

          // Lógica base: ¿Empieza con la letra correcta?
          let isValid = String(answer).trim().toUpperCase().startsWith(gameRoom.letter)
          
          // La democracia manda: Los votos sobrescriben la regla anterior
          if (no > yes) isValid = false
          if (yes > no) isValid = true

          if (isValid) points += 100
        })
        
        scores[targetId] = points
        const player = gameRoom.players.find(p => p.id === targetId)
        if (player) player.total += points
      })

      gameRoom.scores = scores
      gameRoom.phase = 'results' // Pasamos a los resultados finales
    }
    
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('disconnect', () => {
    const room = socket.data.room
    if (!room || !rooms[room]) return
    rooms[room].players = rooms[room].players.filter(p => p.id !== socket.id)
    delete rooms[room].answers[socket.id]
    delete rooms[room].scores[socket.id]
    if (rooms[room].votes) delete rooms[room].votes[socket.id]
    io.to(room).emit('room-state', rooms[room])
  })
})

server.listen(3001, () => {
  console.log('Servidor Basta Online iniciado en http://localhost:3001')
})