"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socket } from "../../lib/socket";
import type { Chat, Message, ChatStatus } from "../../types/chat";

type View = "chats" | "analytics" | "users" | "settings" | "reports";

interface Settings {
  maxChatsPerUser: number;
  autoCloseTimeout: number;
  enableNotifications: boolean;
  maintenanceMode: boolean;
  maxMessageLength: number;
  enableAutoResponse: boolean;
  autoResponseMessage: string | null;
}

interface Analytics {
  overview: {
    activeCount: number;
    closedCount: number;
    totalCount: number;
    totalUsers: number;
    totalMessages: number;
  };
  metrics: {
    avgResolutionTime: number;
    resolutionRate: number;
    avgMessagesPerChat: string;
    chatsPerUser: string;
  };
  trends: {
    monthlyChats: number;
    weeklyChats: number;
    monthlyGrowth: string;
  };
}

export default function AdminPanel() {
  const router = useRouter();
  const [view, setView] = useState<View>("chats");
  const [activeChats, setActiveChats] = useState<Chat[]>([]);
  const [closedChats, setClosedChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"online" | "offline" | "connecting">("connecting");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState<"ACTIVE" | "CLOSED">("ACTIVE");
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_BASE = "http://localhost:5000/admin";

  useEffect(() => {
    let mounted = true;
    let redirecting = false;
    
    const checkAuth = async () => {
      if (redirecting) return;
      
      try {
        const res = await fetch("http://localhost:5000/auth/me", {
          credentials: "include",
        });
        if (!mounted) return;
        
        if (res.ok) {
          try {
            const data = await res.json();
            if (data.admin) {
              setAdminInfo(data.admin);
              setIsAuthenticated(true);
            } else {
              if (!redirecting) {
                redirecting = true;
                setIsRedirecting(true);
                setIsAuthenticated(false);
                router.push("/admin/login");
              }
            }
          } catch (parseError) {
            console.error("Failed to parse auth response:", parseError);
            if (!redirecting) {
              redirecting = true;
              setIsRedirecting(true);
              setIsAuthenticated(false);
              router.push("/admin/login");
            }
          }
        } else {
          if (!redirecting) {
            redirecting = true;
            setIsRedirecting(true);
            setIsAuthenticated(false);
            router.push("/admin/login");
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        if (mounted && !redirecting) {
          redirecting = true;
          setIsRedirecting(true);
          setIsAuthenticated(false);
          router.push("/admin/login");
        }
      }
    };
    
    checkAuth();
    
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch("http://localhost:5000/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      router.push("/admin/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    const handleConnect = () => setStatus("online");
    const handleDisconnect = () => setStatus("offline");
    
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    setStatus(socket.connected ? "online" : "connecting");

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const mapChat = (c: any): Chat => ({
      id: c.id,
      lastMessage: c.lastMessage || c.messages?.[0]?.content || null,
      updatedAt: c.updatedAt,
      status: c.status as ChatStatus,
      userId: c.userId,
      user: c.user,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
    });

    const load = async () => {
      try {
        if (view === "chats") {
          const [activeRes, closedRes, analyticsRes] = await Promise.all([
            fetch(`${API_BASE}/chats?status=ACTIVE&array=true`, { credentials: "include" }),
            fetch(`${API_BASE}/chats?status=CLOSED&array=true`, { credentials: "include" }),
            fetch(`${API_BASE}/analytics`, { credentials: "include" }),
          ]);

          if (activeRes.status === 401 || closedRes.status === 401 || analyticsRes.status === 401) {
            if (!isRedirecting) {
              setIsRedirecting(true);
              setIsAuthenticated(false);
              router.push("/admin/login");
            }
            return;
          }

          if (!activeRes.ok || !closedRes.ok || !analyticsRes.ok) {
            const errorText = await activeRes.text().catch(() => "");
            console.error("Failed to fetch data:", { 
              activeRes: activeRes.status, 
              closedRes: closedRes.status, 
              analyticsRes: analyticsRes.status,
              error: errorText
            });
            return;
          }

          let activeData, closedData, analyticsData;
          try {
            [activeData, closedData, analyticsData] = await Promise.all([
              activeRes.json(),
              closedRes.json(),
              analyticsRes.json(),
            ]);
          } catch (parseError) {
            console.error("Failed to parse JSON:", parseError);
            return;
          }

          if (activeData) {
            setActiveChats((activeData.data || activeData || []).map(mapChat));
          }
          if (closedData) {
            setClosedChats((closedData.data || closedData || []).map(mapChat));
          }
          if (analyticsData) {
            setAnalytics(analyticsData);
          }
        } else if (view === "analytics") {
          const res = await fetch(`${API_BASE}/analytics`, { credentials: "include" });
          if (res.status === 401) {
            if (!isRedirecting) {
              setIsRedirecting(true);
              setIsAuthenticated(false);
              router.push("/admin/login");
            }
            return;
          }
          if (!res.ok) {
            console.error("Failed to fetch analytics:", res.status);
            return;
          }
          try {
            const data = await res.json();
            if (data) setAnalytics(data);
          } catch (error) {
            console.error("Failed to parse analytics JSON:", error);
          }
        } else if (view === "users") {
          const res = await fetch(`${API_BASE}/users`, { credentials: "include" });
          if (res.status === 401) {
            if (!isRedirecting) {
              setIsRedirecting(true);
              setIsAuthenticated(false);
              router.push("/admin/login");
            }
            return;
          }
          if (!res.ok) {
            console.error("Failed to fetch users:", res.status);
            return;
          }
          try {
            const data = await res.json();
            setUsers(data.data || []);
          } catch (error) {
            console.error("Failed to parse users JSON:", error);
          }
        } else if (view === "settings") {
          const res = await fetch(`${API_BASE}/settings`, { credentials: "include" });
          if (res.status === 401) {
            if (!isRedirecting) {
              setIsRedirecting(true);
              setIsAuthenticated(false);
              router.push("/admin/login");
            }
            return;
          }
          if (!res.ok) {
            console.error("Failed to fetch settings:", res.status);
            return;
          }
          try {
            const data = await res.json();
            if (data) {
              setSettings(data);
              setLocalSettings(data);
              setSettingsChanged(false);
            }
          } catch (error) {
            console.error("Failed to parse settings JSON:", error);
          }
        }

        if (!adminUserId) {
          try {
            let adminUserRes = await fetch(`${API_BASE}/users?role=ADMIN`, { credentials: "include" });
            if (adminUserRes.status === 401) {
              if (!isRedirecting) {
                setIsRedirecting(true);
                setIsAuthenticated(false);
                router.push("/admin/login");
              }
              return;
            }
            if (!adminUserRes.ok) {
              console.error("Failed to fetch admin users:", adminUserRes.status);
              return;
            }
            let adminUserData;
            try {
              adminUserData = await adminUserRes.json();
            } catch (error) {
              console.error("Failed to parse admin users JSON:", error);
              return;
            }
            let adminUsers = adminUserData.data || [];
            
            if (adminUsers.length === 0) {
              adminUserRes = await fetch(`${API_BASE}/users/ensure-admin`, { credentials: "include" });
              if (adminUserRes.ok) {
                try {
                  adminUserData = await adminUserRes.json();
                  if (adminUserData.admin?.id) {
                    setAdminUserId(adminUserData.admin.id);
                  }
                } catch (error) {
                  console.error("Failed to parse ensure-admin JSON:", error);
                }
              }
            } else if (adminUsers[0]?.id) {
              setAdminUserId(adminUsers[0].id);
            }
          } catch (error) {
            console.error("Failed to fetch/create admin user:", error);
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        if (error instanceof Error && error.message.includes("401")) {
          router.push("/admin/login");
        }
      }
    };

    if (isAuthenticated) {
      load();
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }
  }, [view, adminUserId, isAuthenticated]);

  const openChat = async (chat: Chat) => {
    setActiveChat(chat);
    socket.emit("join-chat", chat.id);

    try {
      const res = await fetch(`${API_BASE}/chats/${chat.id}/messages`, { credentials: "include" });
      const data = await res.json();
      setMessages(data.data || data);
    } catch (error) {
      console.error("Failed to load messages:", error);
      setMessages([]);
    }
  };

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

    const handler = (data: { chatId: string; message: Message }) => {
      if (activeChat && data.chatId === activeChat.id) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.id === data.message.id) {
            return prev;
          }
          return [...prev, data.message];
        });
      }
      updatePreview(data.chatId, data.message.content);
    };

    socket.off("receive-message");
    socket.on("receive-message", handler);

    const handleError = (error: any) => {
      console.error("Socket error:", error);
      alert(error.message || "An error occurred");
    };

    const handleMessageSent = (data: any) => {
      console.log("Message sent successfully:", data);
    };

    socket.off("chat-error");
    socket.off("message-sent");
    socket.on("chat-error", handleError);
    socket.on("message-sent", handleMessageSent);

    return () => {
      socket.off("receive-message", handler);
      socket.off("chat-error", handleError);
      socket.off("message-sent", handleMessageSent);
    };
  }, [activeChat]);

  const sendMessage = () => {
    if (!input.trim() || !activeChat || activeChat.status === "CLOSED" || !adminUserId) return;

    socket.emit("send-message", {
      chatId: activeChat.id,
      content: input.trim(),
      userId: adminUserId,
      sender: "ADMIN",
      isBot: true,
    });

    setInput("");
  };

  const closeChat = async () => {
    if (!activeChat || activeChat.status === "CLOSED") return;
    if (!closeReason.trim()) {
      alert("Please provide a reason for closing the chat");
      return;
    }

    try {
      await fetch(`${API_BASE}/chats/${activeChat.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: closeReason }),
      });

      const closedChat: Chat = { ...activeChat, status: "CLOSED", closedAt: new Date().toISOString() };
      setActiveChat(closedChat);
      setActiveChats((prev) => prev.filter((c) => c.id !== activeChat.id));
      setClosedChats((prev) => [closedChat, ...prev]);
      setCloseReason("");
    } catch (error) {
      console.error("Failed to close chat:", error);
      alert("Failed to close chat");
    }
  };

  const reopenChat = async () => {
    if (!activeChat || activeChat.status !== "CLOSED") return;

    try {
      await fetch(`${API_BASE}/chats/${activeChat.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Reopened by admin" }),
      });

      const reopenedChat: Chat = { ...activeChat, status: "ACTIVE", closedAt: null };
      setActiveChat(reopenedChat);
      setClosedChats((prev) => prev.filter((c) => c.id !== activeChat.id));
      setActiveChats((prev) => [reopenedChat, ...prev]);
    } catch (error) {
      console.error("Failed to reopen chat:", error);
      alert("Failed to reopen chat");
    }
  };

  const addNotes = async () => {
    if (!activeChat || !notesText.trim()) return;

    try {
      await fetch(`${API_BASE}/chats/${activeChat.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: notesText }),
      });

      setShowNotesModal(false);
      setNotesText("");
      alert("Notes added successfully");
    } catch (error) {
      console.error("Failed to add notes:", error);
      alert("Failed to add notes");
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchQuery.length < 2) return;

    try {
      const res = await fetch(`${API_BASE}/search?query=${encodeURIComponent(searchQuery)}`, { credentials: "include" });
      const data = await res.json();
      setSearchResults(data);
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  const updateSettings = async (updates: Partial<Settings>, showAlert = true) => {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setSettings(data.settings);
      if (localSettings) {
        setLocalSettings({ ...localSettings, ...updates });
      }
      setSettingsChanged(false);
      if (showAlert) {
        alert("Settings updated successfully");
      }
    } catch (error) {
      console.error("Failed to update settings:", error);
      if (showAlert) {
        alert("Failed to update settings");
      }
    }
  };

  const handleSettingsChange = (field: keyof Settings, value: any) => {
    if (!localSettings) return;
    
    const newSettings = { ...localSettings, [field]: value };
    setLocalSettings(newSettings);
    setSettingsChanged(true);
    
    if (field === "autoResponseMessage") {
      return;
    }
    
    updateSettings({ [field]: value }, false);
  };

  const saveSettings = () => {
    if (!localSettings) return;
    updateSettings(localSettings);
  };

  const banUser = async (userId: string, isBanned: boolean) => {
    try {
      await fetch(`${API_BASE}/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isBanned }),
      });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned } : u));
    } catch (error) {
      console.error("Failed to update user status:", error);
      alert("Failed to update user status");
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      await fetch(`${API_BASE}/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
      alert("User role updated");
    } catch (error) {
      console.error("Failed to update user role:", error);
      alert("Failed to update user role");
    }
  };

  const statusColor = status === "online" ? "#16a34a" : status === "connecting" ? "#f59e0b" : "#ef4444";

  if (!isAuthenticated) {
    return (
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        height: "100vh",
        color: "#e2e8f0"
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-logo">
          <div className="admin-logo-icon">CS</div>
          <div>
            <div className="admin-logo-title">Support Admin</div>
            <div className="admin-logo-subtitle">Management Console</div>
          </div>
        </div>

        <nav className="admin-nav">
          <div 
            className={`admin-nav-item ${view === "chats" ? "active" : ""}`}
            onClick={() => setView("chats")}
          >
            <span className="admin-nav-icon">💬</span>
            <span>Live Chats</span>
            {view === "chats" && activeChats.length > 0 && (
              <span className="admin-badge">{activeChats.length}</span>
            )}
          </div>
          <div 
            className={`admin-nav-item ${view === "analytics" ? "active" : ""}`}
            onClick={() => setView("analytics")}
          >
            <span className="admin-nav-icon">📊</span>
            <span>Analytics</span>
          </div>
          <div 
            className={`admin-nav-item ${view === "users" ? "active" : ""}`}
            onClick={() => setView("users")}
          >
            <span className="admin-nav-icon">👥</span>
            <span>Users</span>
          </div>
          <div 
            className={`admin-nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
          >
            <span className="admin-nav-icon">⚙️</span>
            <span>Settings</span>
          </div>
          <div 
            className={`admin-nav-item ${view === "reports" ? "active" : ""}`}
            onClick={() => setView("reports")}
          >
            <span className="admin-nav-icon">📈</span>
            <span>Reports</span>
          </div>
        </nav>

        <div className="admin-status-panel">
          <div className="admin-status-label">System Status</div>
          <div className="admin-status-row">
            <span className="admin-status-dot" style={{ background: statusColor }} />
            <span>{status === "online" ? "Online" : status === "connecting" ? "Connecting" : "Offline"}</span>
          </div>
          {analytics && (
            <>
              <div className="admin-status-row" style={{ marginTop: 10 }}>
                <span>Active chats:</span>
                <strong style={{ marginLeft: "auto" }}>{analytics.overview.activeCount}</strong>
              </div>
              <div className="admin-status-row">
                <span>Total users:</span>
                <strong style={{ marginLeft: "auto" }}>{analytics.overview.totalUsers}</strong>
              </div>
            </>
          )}
          {adminInfo && (
            <div className="admin-status-row" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Logged in as:</span>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                {adminInfo.name}
              </div>
              <button
                onClick={handleLogout}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: "8px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  color: "#fca5a5",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="admin-main">
        {view === "chats" && (
          <>
            <header className="admin-topbar">
              <div>
                <h1 className="admin-topbar-title">
                  {tab === "ACTIVE" ? "Active Conversations" : "Closed Conversations"}
                </h1>
                <p className="admin-topbar-subtitle">
                  {tab === "ACTIVE"
                    ? `${activeChats.length} active chat${activeChats.length !== 1 ? "s" : ""}`
                    : `${closedChats.length} closed chat${closedChats.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="admin-topbar-actions">
                <input
                  type="search"
                  placeholder="Search conversations..."
                  className="admin-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <button className="admin-icon-button" onClick={handleSearch}>🔍</button>
              </div>
            </header>

            <div className="admin-content">
              <section className="admin-chat-list">
                <div className="admin-chat-list-header">
                  <div className="admin-tab-switcher">
                    <button
                      className={`admin-tab ${tab === "ACTIVE" ? "active" : ""}`}
                      onClick={() => setTab("ACTIVE")}
                    >
                      Active ({activeChats.length})
                    </button>
                    <button
                      className={`admin-tab ${tab === "CLOSED" ? "active" : ""}`}
                      onClick={() => setTab("CLOSED")}
                    >
                      Closed ({closedChats.length})
                    </button>
                  </div>
                </div>

                <div className="admin-chat-scroll">
                  {(tab === "ACTIVE" ? activeChats : closedChats).length === 0 ? (
                    <div className="admin-empty-chats">
                      <div className="admin-empty-icon">💬</div>
                      <div className="admin-empty-title">No {tab === "ACTIVE" ? "active" : "closed"} chats</div>
                    </div>
                  ) : (
                    (tab === "ACTIVE" ? activeChats : closedChats).map((chat) => (
                      <div
                        key={chat.id}
                        className={`admin-chat-card ${activeChat?.id === chat.id ? "selected" : ""}`}
                        onClick={() => openChat(chat)}
                      >
                        <div className="admin-chat-avatar">
                          {chat.user?.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div className="admin-chat-info">
                          <div className="admin-chat-header-row">
                            <span className="admin-chat-user">{chat.user?.name || `User #${chat.id.slice(0, 6)}`}</span>
                            <span className="admin-chat-time">
                              {chat.updatedAt ? new Date(chat.updatedAt).toLocaleTimeString() : ""}
                            </span>
                          </div>
                          <div className="admin-chat-preview">{chat.lastMessage || "No messages yet"}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="admin-chat-window">
                {activeChat ? (
                  <>
                    <div className="admin-chat-window-header">
                      <div className="admin-window-user">
                        <div className="admin-window-avatar">
                          {activeChat.user?.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="admin-window-name">
                            {activeChat.user?.name || `User #${activeChat.id.slice(0, 8)}`}
                          </div>
                          <div className="admin-window-status">
                            {activeChat.status === "CLOSED" ? "Closed" : "Active now"}
                          </div>
                        </div>
                      </div>
                      <div className="admin-window-actions">
                        <button
                          className="admin-icon-button-sm"
                          title="Add notes"
                          onClick={() => setShowNotesModal(true)}
                        >
                          📝
                        </button>
                        {activeChat.status === "CLOSED" ? (
                          <button
                            className="admin-icon-button-sm"
                            title="Reopen chat"
                            onClick={reopenChat}
                          >
                            🔄
                          </button>
                        ) : (
                          <button
                            className="admin-icon-button-sm"
                            title="Close chat"
                            onClick={() => {
                              const reason = prompt("Reason for closing:");
                              if (reason) {
                                setCloseReason(reason);
                                closeChat();
                              }
                            }}
                          >
                            ✖️
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="admin-messages" ref={messagesEndRef}>
                      {messages.length === 0 ? (
                        <div className="admin-empty-messages">
                          <div className="admin-empty-icon">💭</div>
                          <div className="admin-empty-title">No messages yet</div>
                        </div>
                      ) : (
                        messages.map((m) => (
                          <div
                            key={m.id}
                            className={`admin-bubble ${m.sender === "ADMIN" ? "admin" : "user"}`}
                          >
                            {m.content}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="admin-input-box">
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
                        className="admin-message-input"
                        disabled={status === "offline" || activeChat.status === "CLOSED" || !adminUserId}
                      />
                      <button 
                        onClick={sendMessage} 
                        className="admin-send-button"
                        disabled={status === "offline" || !input.trim() || activeChat.status === "CLOSED" || !adminUserId}
                      >
                        Send
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="admin-empty-selection">
                    <div className="admin-empty-icon">💬</div>
                    <div className="admin-empty-title">Select a conversation</div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {view === "analytics" && analytics && (
          <div className="admin-view-content">
            <h1 className="admin-view-title">Analytics Dashboard</h1>
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="admin-stat-label">Active Chats</div>
                <div className="admin-stat-value">{analytics.overview.activeCount}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Closed Chats</div>
                <div className="admin-stat-value">{analytics.overview.closedCount}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Total Users</div>
                <div className="admin-stat-value">{analytics.overview.totalUsers}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Total Messages</div>
                <div className="admin-stat-value">{analytics.overview.totalMessages}</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Resolution Rate</div>
                <div className="admin-stat-value">{analytics.metrics.resolutionRate.toFixed(1)}%</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-label">Avg Messages/Chat</div>
                <div className="admin-stat-value">{analytics.metrics.avgMessagesPerChat}</div>
              </div>
            </div>
          </div>
        )}

        {view === "users" && (
          <div className="admin-view-content">
            <h1 className="admin-view-title">User Management</h1>
            <div className="admin-users-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Chats</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value)}
                        >
                          <option value="USER">USER</option>
                          <option value="AGENT">AGENT</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td>
                        <span className={user.isBanned ? "banned" : "active"}>
                          {user.isBanned ? "Banned" : "Active"}
                        </span>
                      </td>
                      <td>{user._count?.chats || 0}</td>
                      <td>
                        <button
                          onClick={() => banUser(user.id, !user.isBanned)}
                          className="admin-action-btn"
                        >
                          {user.isBanned ? "Unban" : "Ban"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === "settings" && localSettings && (
          <div className="admin-view-content">
            <h1 className="admin-view-title">Settings</h1>
            <div className="admin-settings-form">
              <div className="admin-setting-item">
                <label>Max Chats Per User</label>
                <input
                  type="number"
                  value={localSettings.maxChatsPerUser}
                  onChange={(e) => handleSettingsChange("maxChatsPerUser", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="admin-setting-item">
                <label>Auto Close Timeout (seconds)</label>
                <input
                  type="number"
                  value={localSettings.autoCloseTimeout}
                  onChange={(e) => handleSettingsChange("autoCloseTimeout", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="admin-setting-item">
                <label>Max Message Length</label>
                <input
                  type="number"
                  value={localSettings.maxMessageLength}
                  onChange={(e) => handleSettingsChange("maxMessageLength", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="admin-setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={localSettings.enableNotifications}
                    onChange={(e) => handleSettingsChange("enableNotifications", e.target.checked)}
                  />
                  Enable Notifications
                </label>
              </div>
              <div className="admin-setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={localSettings.enableAutoResponse}
                    onChange={(e) => handleSettingsChange("enableAutoResponse", e.target.checked)}
                  />
                  Enable Auto Response
                </label>
              </div>
              <div className="admin-setting-item">
                <label>Auto Response Message</label>
                <textarea
                  value={localSettings.autoResponseMessage || ""}
                  onChange={(e) => handleSettingsChange("autoResponseMessage", e.target.value)}
                  rows={4}
                  placeholder="Default message sent to users..."
                />
                <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                  Type your message and click "Save Settings" below
                </div>
              </div>
              <div className="admin-setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={localSettings.maintenanceMode}
                    onChange={(e) => handleSettingsChange("maintenanceMode", e.target.checked)}
                  />
                  Maintenance Mode
                </label>
              </div>
              <div className="admin-setting-item" style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <button
                  onClick={saveSettings}
                  disabled={!settingsChanged}
                  className="admin-save-button"
                >
                  Save Settings
                </button>
                {settingsChanged && (
                  <span style={{ marginLeft: 12, color: "#f59e0b", fontSize: 13 }}>
                    You have unsaved changes
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {view === "reports" && (
          <div className="admin-view-content">
            <h1 className="admin-view-title">Reports</h1>
            <p>Reports functionality coming soon...</p>
          </div>
        )}
      </main>

      {showNotesModal && (
        <div className="admin-modal-overlay" onClick={() => setShowNotesModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Internal Notes</h2>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Enter internal notes..."
              rows={6}
            />
            <div className="admin-modal-actions">
              <button onClick={() => setShowNotesModal(false)}>Cancel</button>
              <button onClick={addNotes}>Save</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .admin-layout {
          display: flex;
          height: 100vh;
          font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #0b1220;
          color: #e2e8f0;
        }

        .admin-sidebar {
          width: 280px;
          background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          padding: 24px 20px;
        }

        .admin-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .admin-logo-icon {
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

        .admin-logo-title {
          font-weight: 800;
          font-size: 16px;
          color: #f8fafc;
        }

        .admin-logo-subtitle {
          font-size: 12px;
          color: #94a3b8;
        }

        .admin-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .admin-nav-item {
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

        .admin-nav-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #f8fafc;
        }

        .admin-nav-item.active {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(37, 99, 235, 0.15));
          color: #7dd3fc;
          box-shadow: 0 8px 24px rgba(14, 165, 233, 0.2);
        }

        .admin-nav-icon {
          font-size: 18px;
        }

        .admin-badge {
          margin-left: auto;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 999px;
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.4);
        }

        .admin-status-panel {
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          margin-top: 16px;
        }

        .admin-status-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .admin-status-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: #e2e8f0;
        }

        .admin-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
        }

        .admin-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .admin-topbar {
          background: linear-gradient(135deg, rgba(46, 64, 108, 0.95), rgba(30, 64, 175, 0.85));
          backdrop-filter: blur(12px);
          padding: 20px 28px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .admin-topbar-title {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #f8fafc;
        }

        .admin-topbar-subtitle {
          margin: 4px 0 0;
          font-size: 13px;
          color: #cbd5e1;
        }

        .admin-topbar-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .admin-search-input {
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #e5e7eb;
          font-size: 14px;
          outline: none;
          width: 300px;
        }

        .admin-icon-button {
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

        .admin-icon-button:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .admin-icon-button-sm {
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

        .admin-icon-button-sm:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        .admin-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .admin-chat-list {
          width: 360px;
          background: #0f172a;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
        }

        .admin-chat-list-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .admin-tab-switcher {
          display: flex;
          gap: 8px;
        }

        .admin-tab {
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

        .admin-tab.active {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(37, 99, 235, 0.25));
          border-color: rgba(59, 130, 246, 0.6);
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
        }

        .admin-chat-scroll {
          flex: 1;
          overflow-y: auto;
        }

        .admin-chat-card {
          display: flex;
          gap: 12px;
          padding: 14px 16px;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          transition: all 160ms ease;
        }

        .admin-chat-card:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .admin-chat-card.selected {
          background: linear-gradient(90deg, rgba(14, 165, 233, 0.12), rgba(37, 99, 235, 0.08));
          border-left: 3px solid #0ea5e9;
        }

        .admin-chat-avatar {
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

        .admin-chat-info {
          flex: 1;
          min-width: 0;
        }

        .admin-chat-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .admin-chat-user {
          font-weight: 700;
          font-size: 14px;
          color: #f8fafc;
        }

        .admin-chat-time {
          font-size: 12px;
          color: #94a3b8;
        }

        .admin-chat-preview {
          font-size: 13px;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .admin-chat-window {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.05), transparent 25%),
            radial-gradient(circle at 80% 0%, rgba(129, 140, 248, 0.08), transparent 30%),
            #0b1220;
        }

        .admin-chat-window-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .admin-window-user {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .admin-window-avatar {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #334155, #475569);
          display: grid;
          place-items: center;
          font-weight: 700;
          color: #cbd5e1;
        }

        .admin-window-name {
          font-weight: 700;
          font-size: 15px;
          color: #f8fafc;
        }

        .admin-window-status {
          font-size: 13px;
          color: #16a34a;
        }

        .admin-window-actions {
          display: flex;
          gap: 8px;
        }

        .admin-messages {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .admin-bubble {
          max-width: 65%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
        }

        .admin-bubble.user {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #e5e7eb;
          align-self: flex-start;
        }

        .admin-bubble.admin {
          background: linear-gradient(135deg, #2563eb, #38bdf8);
          color: #f8fafc;
          align-self: flex-end;
          box-shadow: 0 12px 30px rgba(37, 99, 235, 0.35);
        }

        .admin-input-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(8px);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .admin-message-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px 16px;
          color: #e5e7eb;
          font-size: 14px;
          outline: none;
        }

        .admin-send-button {
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
        }

        .admin-send-button:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        .admin-send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .admin-empty-chats,
        .admin-empty-messages,
        .admin-empty-selection {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          padding: 40px;
        }

        .admin-empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.3;
        }

        .admin-empty-title {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          margin-bottom: 8px;
        }

        .admin-view-content {
          padding: 32px;
          overflow-y: auto;
        }

        .admin-view-title {
          font-size: 28px;
          font-weight: 800;
          color: #f8fafc;
          margin-bottom: 24px;
        }

        .admin-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 32px;
        }

        .admin-stat-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 24px;
        }

        .admin-stat-label {
          font-size: 13px;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .admin-stat-value {
          font-size: 32px;
          font-weight: 800;
          color: #f8fafc;
        }

        .admin-users-table {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          overflow: hidden;
        }

        .admin-users-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .admin-users-table th {
          padding: 16px;
          text-align: left;
          font-weight: 700;
          color: #f8fafc;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .admin-users-table td {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .admin-users-table select {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 6px 12px;
          color: #e2e8f0;
        }

        .banned {
          color: #ef4444;
        }

        .active {
          color: #22c55e;
        }

        .admin-action-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 6px 12px;
          color: #e2e8f0;
          cursor: pointer;
          font-size: 13px;
        }

        .admin-action-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .admin-settings-form {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 24px;
        }

        .admin-setting-item {
          margin-bottom: 24px;
        }

        .admin-setting-item label {
          display: block;
          font-weight: 600;
          color: #f8fafc;
          margin-bottom: 8px;
        }

        .admin-setting-item input[type="number"],
        .admin-setting-item textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 14px;
          color: #e2e8f0;
          font-size: 14px;
        }

        .admin-setting-item input[type="checkbox"] {
          margin-right: 8px;
        }

        .admin-save-button {
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          border: none;
          color: #f8fafc;
          border-radius: 12px;
          padding: 12px 24px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 150ms ease;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
        }

        .admin-save-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(14, 165, 233, 0.4);
        }

        .admin-save-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .admin-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .admin-modal {
          background: #1e293b;
          border-radius: 16px;
          padding: 24px;
          width: 90%;
          max-width: 500px;
        }

        .admin-modal h2 {
          margin: 0 0 16px 0;
          color: #f8fafc;
        }

        .admin-modal textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 12px;
          color: #e2e8f0;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .admin-modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .admin-modal-actions button {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 600;
        }

        .admin-modal-actions button:first-child {
          background: rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
        }

        .admin-modal-actions button:last-child {
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          color: #f8fafc;
        }
      `}</style>
    </div>
  );
}
