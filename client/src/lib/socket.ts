import { io, Socket } from 'socket.io-client'
import { API_URL } from './config'

let socket: Socket | null = null

export function connectSocket(token: string) {
  if (socket) return socket
  socket = io(API_URL, { auth: { token } })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}