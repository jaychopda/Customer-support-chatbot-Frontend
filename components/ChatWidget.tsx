"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";

type ChatStatus = "ACTIVE" | "CLOSED" | "IDLE";

interface Message {
  content: string;
  sender: "USER" | "ADMIN";
}

const API_BASE = "http://localhost:5000";
const CHAT_COOKIE = "chat_session_id";

const readCookie = (key: string) => {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${key}=`))
    ?.split("=")[1] || null;
};

const writeCookie = (key: string, value: string, days = 30) => {
  if (typeof document === "undefined") return;
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  document.cookie = `${key}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
};

const clearCookie = (key: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [status, setStatus] = useState<"online" | "offline">("offline");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("IDLE");
  const [userName, setUserName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ---------------- RESTORE SESSION ---------------- */
  useEffect(() => {
    const existingId = readCookie(CHAT_COOKIE);
    if (existingId) {
      restoreChat(existingId);
    }
  }, []);

  /* ---------------- SOCKET ---------------- */
  useEffect(() => {
    socket.on("connect", () => setStatus("online"));
    socket.on("disconnect", () => setStatus("offline"));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  useEffect(() => {
    const handleReceive = (data: { chatId: string; message: Message }) => {
      if (!chatId) {
        setChatId(data.chatId);
        writeCookie(CHAT_COOKIE, data.chatId);
        socket.emit("join-chat", data.chatId);
        setChatStatus("ACTIVE");
      }

      if (data.chatId !== chatId) return;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        // Drop exact duplicate (same sender + content)
        if (last && last.content === data.message.content && last.sender === data.message.sender) {
          return prev;
        }
        return [...prev, data.message];
      });
    };

    const handleClosed = () => setChatStatus("CLOSED");
    const handleError = (payload: any) => console.warn("chat-error", payload);

    // Ensure only one handler of each kind is attached
    socket.off("receive-message");
    socket.off("chat-closed");
    socket.off("chat-error");

    socket.on("receive-message", handleReceive);
    socket.on("chat-closed", handleClosed);
    socket.on("chat-error", handleError);

    return () => {
      socket.off("receive-message", handleReceive);
      socket.off("chat-closed", handleClosed);
      socket.off("chat-error", handleError);
    };
  }, [chatId]);

  /* ---------------- AUTO SCROLL ---------------- */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const restoreChat = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/${id}`);
      if (!res.ok) throw new Error("Chat not found");
      const data = await res.json();
      setChatId(data.chat.id);
      setChatStatus(data.chat.status ?? "ACTIVE");
      setUserName(data.chat.user?.name || "");
      setMessages(data.messages || []);
      writeCookie(CHAT_COOKIE, data.chat.id);
      socket.emit("join-chat", data.chat.id);
    } catch (err) {
      console.error(err);
      clearCookie(CHAT_COOKIE);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async () => {
    if (!nameDraft.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft }),
      });

      const data = await res.json();
      const newId = data?.chat?.id;
      if (!newId) throw new Error("Unable to start chat");

      setChatId(newId);
      setUserName(nameDraft);
      setChatStatus("ACTIVE");
      setMessages([]);
      writeCookie(CHAT_COOKIE, newId);
      socket.emit("join-chat", newId);
      setNameDraft("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- SEND MESSAGE ---------------- */
  const sendMessage = () => {
    if (!input.trim()) return;
    if (!chatId) {
      setOpen(true);
      setChatStatus("IDLE");
      return;
    }

    socket.emit("send-message", {
      chatId,
      content: input,
      sender: "USER",
    });

    setInput("");
  };

  const closeChat = async () => {
    if (!chatId) return;
    await fetch(`${API_BASE}/chat/${chatId}/close`, { method: "POST" });
    setChatStatus("CLOSED" as ChatStatus);
  };

  const startNewChat = () => {
    clearCookie(CHAT_COOKIE);
    setChatId(null);
    setMessages([]);
    setChatStatus("IDLE" as ChatStatus);
    setUserName("");
    setOpen(true);
  };

  const showNameGate = chatStatus === "IDLE" || !chatId;
  const isClosed = chatStatus === "CLOSED";
  const isActive = chatStatus === "ACTIVE";

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "#2563eb",
          color: "#ffffff",
          fontSize: 24,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 8px 25px rgba(0,0,0,0.3)",
        }}
      >
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 90,
            right: 20,
            width: 360,
            height: 500,
            background: "#ffffff",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 15px 45px rgba(0,0,0,0.35)",
            overflow: "hidden",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              background: "#1e40af",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Customer Support ({status})</span>
            <div style={{ display: "flex", gap: 8 }}>
              {isActive && (
                <button
                  onClick={closeChat}
                  style={{
                    fontSize: 12,
                    background: "#0f172a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              )}
              {isClosed && (
                <button
                  onClick={startNewChat}
                  style={{
                    fontSize: 12,
                    background: "#22c55e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  New Chat
                </button>
              )}
            </div>
          </div>

          {showNameGate ? (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <h4 style={{ margin: 0 }}>Welcome! Tell us your name</h4>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                style={{
                  padding: "10px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                }}
                disabled={loading}
              />
              <button
                onClick={startChat}
                style={{
                  padding: "10px 12px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
                disabled={loading || !nameDraft.trim()}
              >
                {loading ? "Starting..." : "Start chat"}
              </button>
            </div>
          ) : isClosed ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <p style={{ marginBottom: 12 }}>This chat is closed.</p>
              <button
                onClick={startNewChat}
                style={{
                  padding: "10px 12px",
                  background: "#22c55e",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Start new chat
              </button>
            </div>
          ) : (
            <>
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  padding: 12,
                  overflowY: "auto",
                  background: "#f3f4f6",
                }}
              >
                {messages.length === 0 && !loading && (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#6b7280",
                      marginTop: 40,
                      fontSize: 14,
                    }}
                  >
                    👋 {userName ? `${userName}, ` : ""}how can we help you today?
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent:
                        msg.sender === "USER" ? "flex-end" : "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        fontSize: 14,
                        lineHeight: 1.4,
                        background:
                          msg.sender === "USER" ? "#2563eb" : "#e5e7eb",
                        color:
                          msg.sender === "USER" ? "#ffffff" : "#111827",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  padding: 10,
                  display: "flex",
                  gap: 8,
                  borderTop: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={isClosed ? "Chat closed" : "Type a message..."}
                  disabled={isClosed}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    fontSize: 14,
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    outline: "none",
                    color: "#111827",
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={isClosed}
                  style={{
                    padding: "8px 14px",
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    cursor: isClosed ? "not-allowed" : "pointer",
                    fontSize: 14,
                    opacity: isClosed ? 0.6 : 1,
                  }}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
