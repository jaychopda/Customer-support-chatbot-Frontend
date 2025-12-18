"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";
import type { ChatStatus, Message, Chat } from "../types/chat";

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
  const [userId, setUserId] = useState<string | null>(null);
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
        if (last && last.id === data.message.id) {
          return prev;
        }
        return [...prev, data.message];
      });
    };

    const handleClosed = () => {
      setChatStatus("CLOSED");
    };

    const handleClosedByAdmin = (data: { chatId: string; reason: string; message: string }) => {
      if (data.chatId === chatId) {
        setChatStatus("CLOSED");
        alert(`This chat has been closed by an administrator.\nReason: ${data.reason || "Not specified"}`);
      }
    };

    const handleUserBanned = (payload: { message: string }) => {
      alert(payload.message || "You are banned from sending messages");
    };

    const handleError = (payload: any) => {
      console.warn("chat-error", payload);
      alert(payload.message || "An error occurred");
    };

    socket.off("receive-message");
    socket.off("chat-closed");
    socket.off("chat-closed-by-admin");
    socket.off("user-banned");
    socket.off("chat-error");

    socket.on("receive-message", handleReceive);
    socket.on("chat-closed", handleClosed);
    socket.on("chat-closed-by-admin", handleClosedByAdmin);
    socket.on("user-banned", handleUserBanned);
    socket.on("chat-error", handleError);

    return () => {
      socket.off("receive-message", handleReceive);
      socket.off("chat-closed", handleClosed);
      socket.off("chat-closed-by-admin", handleClosedByAdmin);
      socket.off("user-banned", handleUserBanned);
      socket.off("chat-error", handleError);
    };
  }, [chatId]);

  /* ---------------- AUTO SCROLL ---------------- */
  useEffect(() => {
    if (scrollRef.current && open) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }, [messages, open]);

  const restoreChat = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/${id}`);
      if (!res.ok) throw new Error("Chat not found");
      const data = await res.json();
      const chat: Chat = data.chat;
      setChatId(chat.id);
      setChatStatus(chat.status ?? "ACTIVE");
      setUserName(chat.user?.name || "");
      setUserId(chat.userId);
      setMessages(data.messages || []);
      writeCookie(CHAT_COOKIE, chat.id);
      socket.emit("join-chat", chat.id);
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
      const chat: Chat = data?.chat;
      if (!chat?.id) throw new Error("Unable to start chat");

      setChatId(chat.id);
      setUserId(chat.userId);
      setUserName(nameDraft);
      setChatStatus("ACTIVE");
      setMessages([]);
      writeCookie(CHAT_COOKIE, chat.id);
      socket.emit("join-chat", chat.id);
      setNameDraft("");
    } catch (err) {
      console.error(err);
      alert("Failed to start chat. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    if (!chatId || !userId) {
      setOpen(true);
      setChatStatus("IDLE");
      return;
    }

    socket.emit("send-message", {
      chatId,
      content: input.trim(),
      userId,
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
    setUserId(null);
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
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: status === "online" 
            ? "linear-gradient(135deg, #0ea5e9, #2563eb)" 
            : "linear-gradient(135deg, #64748b, #475569)",
          color: "#ffffff",
          fontSize: 28,
          border: "none",
          cursor: "pointer",
          boxShadow: status === "online"
            ? "0 12px 32px rgba(14, 165, 233, 0.4)"
            : "0 8px 20px rgba(0,0,0,0.2)",
          transition: "all 0.3s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
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
            width: 380,
            height: 600,
            maxWidth: "calc(100vw - 40px)",
            maxHeight: "calc(100vh - 120px)",
            background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            overflow: "hidden",
            fontFamily: '"Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            zIndex: 999,
            animation: "slideUp 0.3s ease",
          }}
        >
          <div
            style={{
              padding: "16px 18px",
              background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 4px 12px rgba(30, 64, 175, 0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: status === "online" ? "#22c55e" : "#ef4444",
                  boxShadow: status === "online" ? "0 0 8px #22c55e" : "none",
                }}
              />
              <span>Customer Support</span>
            </div>
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
                ref={scrollRef}
                style={{
                  flex: 1,
                  padding: 16,
                  overflowY: "auto",
                  background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
                  scrollBehavior: "smooth",
                }}
              >
                {loading && (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#6b7280",
                      marginTop: 40,
                      fontSize: 14,
                    }}
                  >
                    Loading...
                  </div>
                )}
                {messages.length === 0 && !loading && (
                  <div
                    style={{
                      textAlign: "center",
                      color: "#64748b",
                      marginTop: 60,
                      fontSize: 15,
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>
                      {userName ? `Hi ${userName}!` : "Hello!"}
                    </div>
                    <div>How can we help you today?</div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent:
                        msg.sender === "USER" ? "flex-end" : "flex-start",
                      marginBottom: 12,
                      animation: "fadeIn 0.3s ease",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "10px 14px",
                        borderRadius: msg.sender === "USER" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        fontSize: 14,
                        lineHeight: 1.5,
                        background:
                          msg.sender === "USER"
                            ? "linear-gradient(135deg, #2563eb, #3b82f6)"
                            : "#ffffff",
                        color: msg.sender === "USER" ? "#ffffff" : "#1e293b",
                        boxShadow:
                          msg.sender === "USER"
                            ? "0 4px 12px rgba(37, 99, 235, 0.3)"
                            : "0 2px 8px rgba(0,0,0,0.1)",
                        border: msg.sender === "USER" ? "none" : "1px solid #e2e8f0",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  display: "flex",
                  gap: 10,
                  borderTop: "1px solid #e2e8f0",
                  background: "#ffffff",
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={isClosed ? "Chat closed" : "Type a message..."}
                  disabled={isClosed || loading}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    fontSize: 14,
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    outline: "none",
                    color: "#1e293b",
                    transition: "all 0.2s ease",
                    background: isClosed ? "#f1f5f9" : "#ffffff",
                  }}
                  onFocus={(e) => {
                    if (!isClosed) {
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={isClosed || loading || !input.trim()}
                  style={{
                    padding: "10px 20px",
                    background: isClosed || loading || !input.trim()
                      ? "#cbd5e1"
                      : "linear-gradient(135deg, #2563eb, #3b82f6)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 12,
                    cursor: isClosed || loading || !input.trim() ? "not-allowed" : "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                    boxShadow: isClosed || loading || !input.trim()
                      ? "none"
                      : "0 4px 12px rgba(37, 99, 235, 0.3)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isClosed && !loading && input.trim()) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 6px 16px rgba(37, 99, 235, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {loading ? "..." : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
