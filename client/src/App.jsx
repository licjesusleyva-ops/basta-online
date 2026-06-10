import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const socket = io('https://basta-online.onrender.com')

const categories = ['Nombre', 'Apellido', 'Ciudad o país', 'Animal', 'Color', 'Fruta o comida', 'Cosa', 'Marca']

function makeRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase()
}

function App() {
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [joined, setJoined] = useState(false)
  const [state, setState] = useState({ players: [], letter: 'A', phase: 'waiting', answers: {}, scores: {}, timer: 60 })
  const [answers, setAnswers] = useState({})
  const [myVotes, setMyVotes] = useState({})
  const [hasVoted, setHasVoted] = useState(false)

  useEffect(() => {
    socket.on('room-state', data => {
      setState(prevState => {
        if (prevState.phase !== 'playing' && data.phase === 'playing') {
          setAnswers({})
          setHasVoted(false)
          setMyVotes({})
        }
        return data
      })
    })
    return () => socket.off('room-state')
  }, [])

  const joinRoom = () => {
    const roomCode = (room || makeRoomCode()).toUpperCase()
    setRoom(roomCode)
    socket.emit('join-room', { room: roomCode, name: name || 'Jugador' })
    setJoined(true)
  }

  const startGame = () => socket.emit('start-game', room)
  const restartRound = () => socket.emit('restart-round', room)

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

  // Ordenar jugadores y asignar medallas
  const sortedPlayers = [...state.players].sort((a, b) => b.total - a.total)

  // Validar si el botón BASTA debe estar activo
  const isBastaDisabled = categories.some(cat => !answers[cat] || !answers[cat].trim())

  return (
    <div className="container">
      <div className="header">
        <h1>Basta Online</h1>
        <p>Inspirado en Stopots • Juego en Red</p>
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
              {sortedPlayers.map((player, index) => {
                let medal = ''
                if (player.total > 0) {
                  if (index === 0) medal = '🥇 '
                  else if (index === 1) medal = '🥈 '
                  else if (index === 2) medal = '🥉 '
                }
                return (
                  <span className="badge" key={player.id}>
                    {medal}{player.name}: {player.total} pts
                  </span>
                )
              })}
            </div>
          </div>

          {/* FASE DE JUEGO */}
          {(state.phase === 'waiting' || state.phase === 'playing') && (
            <div className="card">
              {state.phase === 'waiting' ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <h2>Esperando para iniciar</h2>
                  <button className="secondary" onClick={startGame}>Empezar Nueva Ronda</button>
                </div>
              ) : (
                <>
                  {/* Botones Superiores: Basta y Reiniciar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '15px' }}>
                    <button 
                      className="danger" 
                      onClick={basta} 
                      disabled={isBastaDisabled}
                      style={{ 
                        margin: 0, 
                        flex: '1',
                        opacity: isBastaDisabled ? 0.4 : 1, 
                        cursor: isBastaDisabled ? 'not-allowed' : 'pointer' 
                      }}
                    >
                      {isBastaDisabled ? '⚠️ LLENA TODO PARA GRITAR BASTA' : '¡BASTA PARA TODOS!'}
                    </button>
                    <button className="secondary" onClick={restartRound} style={{ margin: 0 }}>
                      🔄 Reiniciar Ronda
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
                    <div className="letter" style={{ textAlign: 'left', fontSize: '80px' }}>{state.letter}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', background: state.timer <= 10 ? '#ef4444' : '#1e293b', padding: '10px 20px', borderRadius: '12px', transition: '0.3s' }}>
                      ⏱️ {state.timer}s
                    </div>
                  </div>
                  
                  <div className="grid">
                    {categories.map(cat => (
                      <div className="input-group" key={cat}>
                        <label>{cat}</label>
                        <input
                          placeholder={`Con ${state.letter}...`}
                          value={answers[cat] || ''}
                          onChange={e => {
                            const newAnswers = { ...answers, [cat]: e.target.value }
                            setAnswers(newAnswers)
                            socket.emit('submit-answers', { room, answers: newAnswers })
                          }}
                        />
                      </div>
                    ))}
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
                  <p style={{color: '#94a3b8'}}>Esperando a que los demás terminen de calificar...</p>
                </div>
              ) : (
                <>
                  <p>Califica las respuestas de la sala. ¡Sean justos!</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {Object.entries(state.answers || {}).map(([targetId, payload]) => {
                      const isMe = targetId === socket.id
                      return (
                        <div key={targetId} style={{ background: isMe ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', border: isMe ? '1px solid #3b82f6' : 'none' }}>
                          <h3 style={{ color: isMe ? '#3b82f6' : '#facc15', marginTop: 0 }}>
                            Respuestas de {payload.player} {isMe && '(Tú)'}
                          </h3>
                          {categories.map(cat => {
                            const answer = payload.answers?.[cat]
                            if (!answer || !answer.trim()) return null
                            const vote = myVotes[targetId]?.[cat]
                            return (
                              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', padding: '8px 0' }}>
                                <div><strong>{cat}:</strong> <span style={{fontSize: '1.1rem', marginLeft: '10px'}}>{answer}</span></div>
                                
                                {!isMe ? (
                                  <div style={{ display: 'flex', gap: '5px' }}>
                                    <button 
                                      style={{ padding: '6px 12px', margin: 0, background: vote === true ? '#10b981' : '#334155' }}
                                      onClick={() => handleVote(targetId, cat, true)}>✅</button>
                                    <button 
                                      style={{ padding: '6px 12px', margin: 0, background: vote === false ? '#ef4444' : '#334155' }}
                                      onClick={() => handleVote(targetId, cat, false)}>❌</button>
                                  </div>
                                ) : (
                                  <span style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>Tuya</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                  <div className="btn-group" style={{ marginTop: '25px' }}>
                    <button className="secondary" onClick={sendVotes}>Enviar Mis Calificaciones</button>
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
                      <th>Palabras Validadas</th>
                      <th>Puntos de la Ronda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(state.answers || {}).map(([id, payload]) => (
                      <tr key={id}>
                        <td><strong>{payload.player}</strong></td>
                        <td>
                          {Object.entries(payload.answers || {})
                            .map(([k, v]) => v ? `${k}: ${v}` : '')
                            .filter(Boolean)
                            .join(' • ')}
                        </td>
                        <td><strong style={{color: '#10b981', fontSize: '1.2rem'}}>+{state.scores?.[id] || 0}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="btn-group" style={{ marginTop: '20px' }}>
                <button className="secondary" onClick={startGame}>Siguiente Ronda</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App