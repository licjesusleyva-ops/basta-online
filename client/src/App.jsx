import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

// Recuerda cambiar esta IP cuando subamos el juego a internet
const socket = io('http://172.16.116.19:3001')

const categories = ['Nombre', 'Apellido', 'Ciudad o país', 'Animal', 'Color', 'Fruta o comida', 'Cosa', 'Marca']

function makeRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase()
}

function App() {
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [joined, setJoined] = useState(false)
  const [state, setState] = useState({ players: [], letter: 'A', phase: 'waiting', answers: {}, scores: {} })
  const [answers, setAnswers] = useState({})
  const [myVotes, setMyVotes] = useState({})
  const [hasVoted, setHasVoted] = useState(false)

  useEffect(() => {
    socket.on('room-state', data => {
      setState(data)
      if (data.phase === 'playing') {
        setHasVoted(false)
        setMyVotes({})
      }
    })
    return () => socket.off('room-state')
  }, [])

  const joinRoom = () => {
    const roomCode = (room || makeRoomCode()).toUpperCase()
    setRoom(roomCode)
    socket.emit('join-room', { room: roomCode, name: name || 'Jugador' })
    setJoined(true)
  }

  const startGame = () => {
    setAnswers({})
    socket.emit('start-game', room)
  }

  const submitAnswers = () => socket.emit('submit-answers', { room, answers })

  const basta = () => {
    submitAnswers()
    socket.emit('basta', room)
  }

  const handleVote = (targetId, category, isYes) => {
    setMyVotes(prev => ({
      ...prev,
      [targetId]: { ...(prev[targetId] || {}), [category]: isYes }
    }))
  }

  const sendVotes = () => {
    socket.emit('submit-votes', { room, votes: myVotes })
    setHasVoted(true)
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Basta Online</h1>
        <p>Juego en red de velocidad mental</p>
      </div>

      {!joined && (
        <div className="card">
          <h2>Entrar a una partida</h2>
          <div className="input-group">
            <input placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} />
            <input placeholder="Código de sala (vacío para crear)" value={room} onChange={e => setRoom(e.target.value.toUpperCase())} />
          </div>
          <div className="btn-group">
            <button onClick={joinRoom}>Entrar / Crear Sala</button>
          </div>
        </div>
      )}

      {joined && (
        <>
          <div className="card">
            <h2>Sala: {room}</h2>
            <div className="players-container">
              {state.players.map(player => (
                <span className="badge" key={player.id}>{player.name}: {player.total} pts</span>
              ))}
            </div>
          </div>

          {/* FASE DE JUEGO */}
          {(state.phase === 'waiting' || state.phase === 'playing') && (
            <div className="card">
              {state.phase === 'waiting' ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <h2>Esperando para iniciar</h2>
                  <button className="secondary" onClick={startGame}>Generar Letra y Empezar</button>
                </div>
              ) : (
                <>
                  <div className="letter-container"><div className="letter">{state.letter}</div></div>
                  <div className="grid">
                    {categories.map(cat => (
                      <div className="input-group" key={cat}>
                        <label>{cat}</label>
                        <input
                          placeholder={`Con ${state.letter}...`}
                          value={answers[cat] || ''}
                          onChange={e => setAnswers({ ...answers, [cat]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="btn-group">
                    <button onClick={submitAnswers}>Guardar (Sin gritar Basta)</button>
                    <button className="danger" onClick={basta}>¡BASTA PARA TODOS!</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* FASE DE VOTACIÓN */}
          {state.phase === 'voting' && (
            <div className="card">
              <h2>Fase de Votación</h2>
              {hasVoted ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <h3>Tus votos han sido enviados.</h3>
                  <p style={{color: '#94a3b8'}}>Esperando a que los demás terminen de votar...</p>
                </div>
              ) : (
                <>
                  <p>Evalúa las respuestas de tus oponentes. Tu voto decide si ganan puntos o no.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {Object.entries(state.answers || {}).map(([targetId, payload]) => {
                      if (targetId === socket.id) return null // No te votas a ti mismo
                      return (
                        <div key={targetId} style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px' }}>
                          <h3 style={{ color: '#facc15', marginTop: 0 }}>Respuestas de {payload.player}</h3>
                          {categories.map(cat => {
                            const answer = payload.answers[cat]
                            if (!answer) return null
                            const vote = myVotes[targetId]?.[cat]
                            return (
                              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', padding: '8px 0' }}>
                                <div><strong>{cat}:</strong> <span style={{fontSize: '1.1rem'}}>{answer}</span></div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                  <button 
                                    style={{ padding: '8px 12px', margin: 0, background: vote === true ? '#10b981' : '#334155' }}
                                    onClick={() => handleVote(targetId, cat, true)}>✅</button>
                                  <button 
                                    style={{ padding: '8px 12px', margin: 0, background: vote === false ? '#ef4444' : '#334155' }}
                                    onClick={() => handleVote(targetId, cat, false)}>❌</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                  <div className="btn-group" style={{ marginTop: '20px' }}>
                    <button className="secondary" onClick={sendVotes}>Enviar Mis Votos</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* FASE DE RESULTADOS */}
          {state.phase === 'results' && (
            <div className="card">
              <h2>Resultados de la Ronda</h2>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Jugador</th>
                      <th>Respuestas (Las que sobrevivieron)</th>
                      <th>Puntos Ganados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(state.answers || {}).map(([id, payload]) => (
                      <tr key={id}>
                        <td><strong>{payload.player}</strong></td>
                        <td>{Object.entries(payload.answers || {}).map(([k, v]) => v ? `${k}: ${v}` : '').filter(Boolean).join(' • ')}</td>
                        <td><strong style={{color: '#10b981', fontSize: '1.2rem'}}>+{state.scores?.[id] || 0}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="btn-group">
                <button className="secondary" onClick={startGame}>Siguiente Ronda (Nueva Letra)</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App