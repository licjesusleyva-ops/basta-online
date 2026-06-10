const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

const rooms = {}
const intervals = {} // Aquí guardaremos los relojes de cada sala
const letters = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'

const categories = ['Nombre', 'Apellido', 'Ciudad o país', 'Animal', 'Color', 'Fruta o comida', 'Cosa', 'Marca']

function randomLetter() {
  return letters[Math.floor(Math.random() * letters.length)]
}

function getRoom(room) {
  if (!rooms[room]) {
    rooms[room] = {
      players: [],
      letter: 'A',
      phase: 'waiting', 
      answers: {},
      scores: {},
      votes: {},
      timer: 60 // 60 segundos iniciales
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
    
    // Limpiamos cualquier reloj viejo activo
    if (intervals[cleanRoom]) clearInterval(intervals[cleanRoom])

    gameRoom.letter = randomLetter()
    gameRoom.phase = 'playing'
    gameRoom.answers = {}
    gameRoom.scores = {}
    gameRoom.votes = {}
    gameRoom.timer = 60 // Reiniciamos reloj a 1 minuto

    // Iniciamos el conteo regresivo de 1 minuto en el servidor
    intervals[cleanRoom] = setInterval(() => {
      const currentRoom = rooms[cleanRoom]
      if (currentRoom && currentRoom.phase === 'playing') {
        currentRoom.timer--
        if (currentRoom.timer <= 0) {
          clearInterval(intervals[cleanRoom])
          currentRoom.phase = 'voting' // Se acabó el tiempo, a votar
        }
        io.to(cleanRoom).emit('room-state', currentRoom)
      } else {
        clearInterval(intervals[cleanRoom])
      }
    }, 1000)

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
    
    if (intervals[cleanRoom]) clearInterval(intervals[cleanRoom]) // Detenemos el reloj
    gameRoom.phase = 'voting'
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('submit-votes', ({ room, votes }) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const gameRoom = getRoom(cleanRoom)
    
    gameRoom.votes[socket.id] = votes

    // Si ya votaron todos, hacemos el escrutinio
    if (Object.keys(gameRoom.votes).length >= gameRoom.players.length) {
      const scores = {}
      
      Object.entries(gameRoom.answers).forEach(([targetId, payload]) => {
        let points = 0
        
        // Evaluamos cada categoría de forma independiente
        categories.forEach(category => {
          const answer = payload.answers?.[category]
          if (!answer || !String(answer).trim()) return // Si está vacía, no suma pero no rompe las demás

          let yes = 0
          let no = 0

          // Contamos los votos de la comunidad
          Object.values(gameRoom.votes).forEach(playerVotes => {
            const vote = playerVotes[targetId]?.[category]
            if (vote === true) yes++
            if (vote === false) no++
          })

          // Regla por defecto: ¿Empieza con la letra correcta?
          let isValid = String(answer).trim().toUpperCase().startsWith(gameRoom.letter)
          
          // La democracia manda: si hay votos, ganan las mayorías
          if (no > yes) isValid = false
          if (yes > no) isValid = true

          if (isValid) points += 100
        })
        
        scores[targetId] = points
        const player = gameRoom.players.find(p => p.id === targetId)
        if (player) player.total += points
      })

      gameRoom.scores = scores
      gameRoom.phase = 'results'
    }
    
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('disconnect', () => {
    const room = socket.data.room
    if (!room || !rooms[room]) return
    rooms[room].players = rooms[room].players.filter(p => p.id !== socket.id)
    delete rooms[room].answers[socket.id]
    delete rooms[room].scores[socket.id]
    io.to(room).emit('room-state', rooms[room])
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Servidor Basta listo en puerto ${PORT}`)
})