import { io, Socket } from "socket.io-client";

declare global {
  var __socketInstance: Socket | undefined;
}

const SOCKET_URL = "http://localhost:5000";

const getSocketInstance = (): Socket => {
  if (typeof window === "undefined") {
    return null as any;
  }

  if (global.__socketInstance) {
    if (global.__socketInstance.connected) {
      return global.__socketInstance;
    }
    global.__socketInstance.disconnect();
    global.__socketInstance.removeAllListeners();
  }

  const socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ["websocket", "polling"],
    forceNew: false,
  });

  global.__socketInstance = socket;

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
  });

  return socket;
};

export const socket = getSocketInstance();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (global.__socketInstance) {
      global.__socketInstance.disconnect();
      global.__socketInstance = undefined;
    }
  });
}
