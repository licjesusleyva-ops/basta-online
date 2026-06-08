# Basta Online

Juego tipo **Basta / Stop** para jugar en red usando React + Node.js + Socket.io.

## Requisitos

Instala Node.js desde la página oficial.

## Cómo ejecutar

Abre dos terminales.

### 1. Servidor

```bash
cd server
npm install
npm start
```

### 2. Cliente

```bash
cd client
npm install
npm run dev
```

Después abre la dirección que te muestra Vite, normalmente:

```txt
http://localhost:5173
```

## Para jugar en red local

Si están en la misma red WiFi, cambia en `client/src/App.jsx` esta línea:

```js
const socket = io('http://localhost:3001')
```

por la IP de la computadora donde corre el servidor, por ejemplo:

```js
const socket = io('http://192.168.1.50:3001')
```

## Próximo paso

Para jugar por internet se puede subir:

- Cliente: Vercel
- Servidor: Render o Railway

