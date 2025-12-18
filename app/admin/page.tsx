"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "../../lib/socket";

interface Chat {
  id: string;
  lastMessage?: string;
  updatedAt?: string;
  status: "ACTIVE" | "CLOSED";
  userName?: string;
}

interface Message {
  content: string;
  sender: "USER" | "ADMIN";
}

export default function AdminPanel() {
  const [activeChats, setActiveChats] = useState<Chat[]>([]);
  const [closedChats, setClosedChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"online" | "offline" | "connecting">("connecting");
  const [analytics, setAnalytics] = useState({ activeCount: 0, closedCount: 0, totalCount: 0 });
  const [tab, setTab] = useState<"ACTIVE" | "CLOSED">("ACTIVE");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ---------------- SOCKET CONNECTION ---------------- */
  useEffect(() => {
    const handleConnect = () => setStatus("online");
    const handleDisconnect = () => setStatus("offline");
    
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    setStatus(socket.connected ? "online" : "connecting");

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  /* ---------------- AUTO SCROLL ---------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---------------- LOAD CHATS ---------------- */
  useEffect(() => {
    const mapChat = (c: any): Chat => ({
      id: c.id,
      lastMessage: c.lastMessage || "No messages yet",
      updatedAt: c.updatedAt,
      status: c.status,
      userName: c.user?.name,
    });

    const load = async () => {
      const [activeRes, closedRes, analyticsRes] = await Promise.all([
        fetch("http://localhost:5000/admin/chats?status=ACTIVE"),
        fetch("http://localhost:5000/admin/chats?status=CLOSED"),
        fetch("http://localhost:5000/admin/analytics"),
      ]);

      const [activeData, closedData, analyticsData] = await Promise.all([
        activeRes.json(),
        closedRes.json(),
        analyticsRes.json(),
      ]);

      setActiveChats(activeData.map(mapChat));
      setClosedChats(closedData.map(mapChat));
      setAnalytics(analyticsData);
    };

    load();
  }, []);

  /* ---------------- LOAD MESSAGES ---------------- */
  const openChat = async (chat: Chat) => {
    setActiveChat(chat);
    socket.emit("join-chat", chat.id);

    const res = await fetch(
      `http://localhost:5000/admin/chats/${chat.id}/messages`
    );
    const data = await res.json();
    setMessages(data);
  };

  /* ---------------- SOCKET RECEIVE ---------------- */
  useEffect(() => {
    const updatePreview = (chatId: string, content: string) => {
      setActiveChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, lastMessage: content, updatedAt: new Date().toISOString() }
            : c
        )
      );

      setClosedChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, lastMessage: content, updatedAt: new Date().toISOString() }
            : c
        )
      );
    };

    const handler = (data: any) => {
      if (activeChat && data.chatId === activeChat.id) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          // Drop exact duplicate (same sender + content)
          if (last && last.content === data.message.content && last.sender === data.message.sender) {
            return prev;
          }
          return [...prev, data.message];
        });
      }
      updatePreview(data.chatId, data.message.content);
    };

    // Remove any existing listener before registering new one
    socket.off("receive-message");
    socket.on("receive-message", handler);

    return () => {
      socket.off("receive-message", handler);
    };
  }, [activeChat]);

  /* ---------------- SEND ADMIN MESSAGE ---------------- */
  const sendMessage = () => {
    if (!input.trim() || !activeChat || activeChat.status === "CLOSED") return;

    socket.emit("send-message", {
      chatId: activeChat.id,
      content: input,
      sender: "ADMIN",
    });

    setInput("");
  };

  const closeChatFromAdmin = async () => {
    if (!activeChat || activeChat.status === "CLOSED") return;

    await fetch(`http://localhost:5000/admin/chats/${activeChat.id}/close`, {
      method: "POST",
    });

    const closedChat: Chat = { ...activeChat, status: "CLOSED" };
    setActiveChat(closedChat);
    setActiveChats((prev) => prev.filter((c) => c.id !== activeChat.id));
    setClosedChats((prev) => [closedChat, ...prev]);
    setAnalytics((prev) => ({
      ...prev,
      activeCount: Math.max(prev.activeCount - 1, 0),
      closedCount: prev.closedCount + 1,
    }));
  };

  const statusColor = status === "online" ? "#16a34a" : status === "connecting" ? "#f59e0b" : "#ef4444";
  const statusLabel = status === "online" ? "Online" : status === "connecting" ? "Connecting" : "Offline";

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">CS</div>
          <div>
            <div className="logo-title">Support Admin</div>
            <div className="logo-subtitle">Management Console</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-item active">
            <span className="nav-icon">💬</span>
            <span>Live Chats</span>
            {activeChats.length > 0 && <span className="badge">{activeChats.length}</span>}
          </div>
          <div className="nav-item">
            <span className="nav-icon">📊</span>
            <span>Analytics</span>
          </div>
          <div className="nav-item">
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </div>
        </nav>

        <div className="status-panel">
          <div className="status-label">System Status</div>
          <div className="status-row">
            <span className="status-dot" style={{ background: statusColor }} />
            <span>{statusLabel}</span>
          </div>
          <div className="status-row" style={{ marginTop: 10 }}>
            <span>Active chats:</span>
            <strong style={{ marginLeft: "auto" }}>{analytics.activeCount}</strong>
          </div>
          <div className="status-row">
            <span>Closed chats:</span>
            <strong style={{ marginLeft: "auto" }}>{analytics.closedCount}</strong>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="topbar-title">{tab === "ACTIVE" ? "Active Conversations" : "Closed Conversations"}</h1>
            <p className="topbar-subtitle">
              {tab === "ACTIVE"
                ? `${activeChats.length} active chat${activeChats.length !== 1 ? "s" : ""}`
                : `${closedChats.length} closed chat${closedChats.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="topbar-actions">
            <button className="icon-button">🔔</button>
            <button className="icon-button">👤</button>
          </div>
        </header>

        <div className="content">
          {/* Chat List */}
          <section className="chat-list">
            <div className="chat-list-header">
              <div className="tab-switcher">
                <button
                  className={`tab ${tab === "ACTIVE" ? "tab-active" : ""}`}
                  onClick={() => setTab("ACTIVE")}
                >
                  Active ({activeChats.length})
                </button>
                <button
                  className={`tab ${tab === "CLOSED" ? "tab-active" : ""}`}
                  onClick={() => setTab("CLOSED")}
                >
                  Closed ({closedChats.length})
                </button>
              </div>
              <input
                type="search"
                placeholder="Search conversations..."
                className="search-input"
              />
            </div>

            <div className="chat-scroll">
              {(tab === "ACTIVE" ? activeChats : closedChats).length === 0 ? (
                <div className="empty-chats">
                  <div className="empty-icon">💬</div>
                  <div className="empty-title">No {tab === "ACTIVE" ? "active" : "closed"} chats</div>
                  <div className="empty-text">Conversations will appear here</div>
                </div>
              ) : (
                (tab === "ACTIVE" ? activeChats : closedChats).map((chat) => (
                  <div
                    key={chat.id}
                    className={`chat-card ${
                      activeChat?.id === chat.id ? "selected" : ""
                    }`}
                    onClick={() => openChat(chat)}
                  >
                    <div className="chat-avatar">U</div>
                    <div className="chat-info">
                      <div className="chat-header-row">
                        <span className="chat-user">{chat.userName || `User #${chat.id.slice(0, 6)}`}</span>
                        <span className="chat-time">{chat.updatedAt ? new Date(chat.updatedAt).toLocaleTimeString() : ""}</span>
                      </div>
                      <div className="chat-preview">{chat.lastMessage || "No messages yet"}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Chat Window */}
          <section className="chat-window">
            {activeChat ? (
              <>
                <div className="chat-window-header">
                  <div className="window-user">
                    <div className="window-avatar">U</div>
                    <div>
                      <div className="window-name">{activeChat.userName || `User #${activeChat.id.slice(0, 8)}`}</div>
                      <div className="window-status">{activeChat.status === "CLOSED" ? "Closed" : "Active now"}</div>
                    </div>
                  </div>
                  <div className="window-actions">
                    <button className="icon-button-sm" title="User details">ℹ️</button>
                    <button
                      className="icon-button-sm"
                      title="Close chat"
                      onClick={closeChatFromAdmin}
                      disabled={activeChat.status === "CLOSED"}
                    >
                      ✖️
                    </button>
                  </div>
                </div>

                <div className="messages">
                  {messages.length === 0 ? (
                    <div className="empty-messages">
                      <div className="empty-icon">💭</div>
                      <div className="empty-title">No messages yet</div>
                      <div className="empty-text">Start the conversation</div>
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div
                        key={i}
                        className={
                          m.sender === "ADMIN"
                            ? "bubble bubble-admin"
                            : "bubble bubble-user"
                        }
                      >
                        {m.content}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="input-box">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type your response..."
                    className="message-input"
                    disabled={status === "offline" || activeChat.status === "CLOSED"}
                  />
                  <button 
                    onClick={sendMessage} 
                    className="send-button"
                    disabled={status === "offline" || !input.trim() || activeChat.status === "CLOSED"}
                  >
                    Send
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-selection">
                <div className="empty-icon">💬</div>
                <div className="empty-title">Select a conversation</div>
                <div className="empty-text">Choose a chat from the list to start responding</div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Styles */}
      <style jsx>{`
        .layout {
          display: flex;
          height: 100vh;
          font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #0b1220;
          color: #e2e8f0;
        }

        /* ===== SIDEBAR ===== */
        .sidebar {
          width: 280px;
          background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          padding: 24px 20px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .logo-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #1f2937, #0ea5e9);
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 18px;
          color: #e0f2fe;
          box-shadow: 0 12px 30px rgba(14, 165, 233, 0.3);
        }

        .logo-title {
          font-weight: 800;
          font-size: 16px;
          color: #f8fafc;
        }

        .logo-subtitle {
          font-size: 12px;
          color: #94a3b8;
        }

        .nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 180ms ease;
          color: #cbd5e1;
          font-weight: 600;
          font-size: 14px;
          position: relative;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #f8fafc;
        }

        .nav-item.active {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(37, 99, 235, 0.15));
          color: #7dd3fc;
          box-shadow: 0 8px 24px rgba(14, 165, 233, 0.2);
        }

        .nav-icon {
          font-size: 18px;
        }

        .badge {
          margin-left: auto;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 999px;
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.4);
        }

        .status-panel {
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          margin-top: 16px;
        }

        .status-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .status-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: #e2e8f0;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
        }

        /* ===== MAIN AREA ===== */
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .topbar {
          background: linear-gradient(135deg, rgba(46, 64, 108, 0.95), rgba(30, 64, 175, 0.85));
          backdrop-filter: blur(12px);
          padding: 20px 28px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .topbar-title {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #f8fafc;
        }

        .topbar-subtitle {
          margin: 4px 0 0;
          font-size: 13px;
          color: #cbd5e1;
        }

        .topbar-actions {
          display: flex;
          gap: 10px;
        }

        .icon-button {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          cursor: pointer;
          transition: all 160ms ease;
          font-size: 18px;
        }

        .icon-button:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-1px);
        }

        .icon-button-sm {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          cursor: pointer;
          transition: all 160ms ease;
          font-size: 14px;
        }

        .icon-button-sm:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        /* ===== CONTENT LAYOUT ===== */
        .content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* ===== CHAT LIST ===== */
        .chat-list {
          width: 360px;
          background: #0f172a;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
        }

        .chat-list-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .tab-switcher {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }

        .tab {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          transition: all 140ms ease;
        }

        .tab-active {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(37, 99, 235, 0.25));
          border-color: rgba(59, 130, 246, 0.6);
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
        }

        .search-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 11px 14px;
          color: #e5e7eb;
          font-size: 14px;
          outline: none;
          transition: all 160ms ease;
        }

        .search-input:focus {
          border-color: rgba(56, 189, 248, 0.6);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
        }

        .search-input::placeholder {
          color: #94a3b8;
        }

        .chat-scroll {
          flex: 1;
          overflow-y: auto;
        }

        .chat-scroll::-webkit-scrollbar {
          width: 6px;
        }

        .chat-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 999px;
        }

        .chat-card {
          display: flex;
          gap: 12px;
          padding: 14px 16px;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          transition: all 160ms ease;
        }

        .chat-card:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .chat-card.selected {
          background: linear-gradient(90deg, rgba(14, 165, 233, 0.12), rgba(37, 99, 235, 0.08));
          border-left: 3px solid #0ea5e9;
        }

        .chat-avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #334155, #475569);
          display: grid;
          place-items: center;
          font-weight: 700;
          color: #cbd5e1;
          flex-shrink: 0;
        }

        .chat-info {
          flex: 1;
          min-width: 0;
        }

        .chat-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .chat-user {
          font-weight: 700;
          font-size: 14px;
          color: #f8fafc;
        }

        .chat-time {
          font-size: 12px;
          color: #94a3b8;
        }

        .chat-preview {
          font-size: 13px;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty-chats {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 24px;
          text-align: center;
        }

        /* ===== CHAT WINDOW ===== */
        .chat-window {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.05), transparent 25%),
            radial-gradient(circle at 80% 0%, rgba(129, 140, 248, 0.08), transparent 30%),
            #0b1220;
        }

        .chat-window-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .window-user {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .window-avatar {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #334155, #475569);
          display: grid;
          place-items: center;
          font-weight: 700;
          color: #cbd5e1;
        }

        .window-name {
          font-weight: 700;
          font-size: 15px;
          color: #f8fafc;
        }

        .window-status {
          font-size: 13px;
          color: #16a34a;
        }

        .window-actions {
          display: flex;
          gap: 8px;
        }

        .messages {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .messages::-webkit-scrollbar {
          width: 6px;
        }

        .messages::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 999px;
        }

        .bubble {
          max-width: 65%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
          animation: slideIn 200ms ease;
        }

        .bubble-user {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #e5e7eb;
          align-self: flex-start;
        }

        .bubble-admin {
          background: linear-gradient(135deg, #2563eb, #38bdf8);
          color: #f8fafc;
          align-self: flex-end;
          box-shadow: 0 12px 30px rgba(37, 99, 235, 0.35);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .input-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(8px);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .message-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px 16px;
          color: #e5e7eb;
          font-size: 14px;
          outline: none;
          transition: all 160ms ease;
        }

        .message-input:focus {
          border-color: rgba(56, 189, 248, 0.8);
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
        }

        .message-input::placeholder {
          color: #94a3b8;
        }

        .message-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .send-button {
          min-width: 90px;
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          border: none;
          color: #f8fafc;
          border-radius: 12px;
          padding: 12px 20px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 150ms ease;
          box-shadow: 0 12px 30px rgba(14, 165, 233, 0.35);
        }

        .send-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 16px 36px rgba(14, 165, 233, 0.45);
        }

        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        /* ===== EMPTY STATES ===== */
        .empty-selection,
        .empty-messages {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          padding: 40px;
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.3;
        }

        .empty-title {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          margin-bottom: 8px;
        }

        .empty-text {
          font-size: 14px;
          color: #94a3b8;
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 1024px) {
          .sidebar {
            width: 240px;
          }
          
          .chat-list {
            width: 300px;
          }
        }

        @media (max-width: 768px) {
          .sidebar {
            display: none;
          }

          .chat-list {
            width: 100%;
            max-width: 320px;
          }
        }
      `}</style>
    </div>
  );
}
