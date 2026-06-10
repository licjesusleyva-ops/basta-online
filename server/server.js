const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

const rooms = {}
const intervals = {} 
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
      timer: 60
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
    
    if (intervals[cleanRoom]) clearInterval(intervals[cleanRoom])

    gameRoom.letter = randomLetter()
    gameRoom.phase = 'playing'
    gameRoom.answers = {}
    gameRoom.scores = {}
    gameRoom.votes = {}
    gameRoom.timer = 60 

    intervals[cleanRoom] = setInterval(() => {
      const currentRoom = rooms[cleanRoom]
      if (currentRoom && currentRoom.phase === 'playing') {
        currentRoom.timer--
        if (currentRoom.timer <= 0) {
          clearInterval(intervals[cleanRoom])
          currentRoom.phase = 'voting' 
        }
        io.to(cleanRoom).emit('room-state', currentRoom)
      } else {
        clearInterval(intervals[cleanRoom])
      }
    }, 1000)

    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  // NUEVO: Reiniciar ronda a la fuerza
  socket.on('restart-round', (room) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const gameRoom = getRoom(cleanRoom)
    if (intervals[cleanRoom]) clearInterval(intervals[cleanRoom])
    gameRoom.phase = 'waiting'
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
    
    if (intervals[cleanRoom]) clearInterval(intervals[cleanRoom]) 
    gameRoom.phase = 'voting'
    io.to(cleanRoom).emit('room-state', gameRoom)
  })

  socket.on('submit-votes', ({ room, votes }) => {
    const cleanRoom = String(room || '').trim().toUpperCase()
    const gameRoom = getRoom(cleanRoom)
    
    gameRoom.votes[socket.id] = votes

    if (Object.keys(gameRoom.votes).length >= gameRoom.players.length) {
      const scores = {}
      const validAnswersByCategory = {} 

      // 1. Validar y agrupar respuestas idénticas
      categories.forEach(category => {
        validAnswersByCategory[category] = {}
        
        Object.entries(gameRoom.answers).forEach(([targetId, payload]) => {
          const answer = payload.answers?.[category]
          if (!answer || !String(answer).trim()) return 

          let yes = 0
          let no = 0

          Object.values(gameRoom.votes).forEach(playerVotes => {
            const vote = playerVotes[targetId]?.[category]
            if (vote === true) yes++
            if (vote === false) no++
          })

          let isValid = String(answer).trim().toUpperCase().startsWith(gameRoom.letter)
          if (no > yes) isValid = false
          if (yes > no) isValid = true

          if (isValid) {
            // Normalizamos para comparar (ej. "Mexico" == "MEXICO")
            const normalizedAnswer = String(answer).trim().toLowerCase()
            if (!validAnswersByCategory[category][normalizedAnswer]) {
              validAnswersByCategory[category][normalizedAnswer] = []
            }
            validAnswersByCategory[category][normalizedAnswer].push(targetId)
          }
        })
      })

      // 2. Repartir y dividir los puntos
      Object.keys(gameRoom.answers).forEach(id => scores[id] = 0)

      categories.forEach(category => {
        Object.values(validAnswersByCategory[category]).forEach(playerIds => {
          // Si son 2 jugadores, 100/2 = 50 pts c/u
          const points = Math.floor(100 / playerIds.length) 
          playerIds.forEach(id => {
            scores[id] += points
          })
        })
      })

      // 3. Sumar al total general
      Object.entries(scores).forEach(([targetId, points]) => {
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
    if (rooms[room].votes) delete rooms[room].votes[socket.id]
    io.to(room).emit('room-state', rooms[room])
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Servidor Basta listo en puerto ${PORT}`)
})