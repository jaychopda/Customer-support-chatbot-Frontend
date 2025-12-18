"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../lib/socket";

interface Message {
  content: string;
  sender: "USER" | "ADMIN";
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"connecting" | "online" | "offline">(
    "connecting",
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleConnect = () => setStatus("online");
    const handleDisconnect = () => setStatus("offline");
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    setStatus(socket.connected ? "online" : "connecting");

    socket.on("receive-message", (data) => {
      setChatId(data.chatId);
      setMessages((prev) => [...prev, data.message]);
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive-message");
    };
  }, []);

  useEffect(() => {
    const handleExternalOpen = () => setOpen(true);
    window.addEventListener("chat:open", handleExternalOpen);
    return () => window.removeEventListener("chat:open", handleExternalOpen);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const sendMessage = () => {
    if (!input.trim()) return;

    socket.emit("send-message", {
      chatId,
      content: input,
      sender: "USER",
    });

    setInput("");
  };

  const statusLabel = useMemo(() => {
    if (status === "online") return "Online";
    if (status === "connecting") return "Connecting";
    return "Offline";
  }, [status]);

  const statusColor = useMemo(() => {
    if (status === "online") return "#16a34a";
    if (status === "connecting") return "#f59e0b";
    return "#ef4444";
  }, [status]);

  const quickReplies = [
    "I need help with an order",
    "Can I talk to a human?",
    "What are your support hours?",
  ];

  return (
    <>
      <button
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="chat-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div className="chat-panel">
          <header className="chat-header">
            <div className="chat-identity">
              <div className="avatar">CS</div>
              <div>
                <div className="title">Customer Support</div>
                <div className="status" style={{ color: statusColor }}>
                  <span className="status-dot" style={{ background: statusColor }} />
                  {statusLabel}
                </div>
              </div>
            </div>
            <button className="icon-btn" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          <div className="message-area" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-title">How can we help?</div>
                <p className="empty-body">
                  Send us a message and a specialist will jump in.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={`${msg.content}-${i}`}
                className={
                  msg.sender === "USER" ? "bubble bubble-user" : "bubble bubble-admin"
                }
              >
                {msg.content}
              </div>
            ))}
          </div>

          <div className="quick-replies">
            {quickReplies.map((label) => (
              <button
                key={label}
                className="chip"
                onClick={() => setInput(label)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={status === "offline" ? "Reconnecting..." : "Type a message"}
              disabled={status === "offline"}
            />
            <button className="send-btn" onClick={sendMessage} disabled={status === "offline"}>
              Send
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .chat-toggle {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 64px;
          height: 64px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #111827, #1d4ed8);
          color: #f8fafc;
          font-size: 28px;
          border: none;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
          cursor: pointer;
          transition: transform 200ms ease, box-shadow 200ms ease, background 200ms ease;
        }

        .chat-toggle:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.32);
          background: linear-gradient(135deg, #0f172a, #1e3a8a);
        }

        .chat-toggle:active {
          transform: translateY(0);
        }

        .chat-panel {
          position: fixed;
          bottom: 100px;
          right: 20px;
          width: min(360px, calc(100vw - 32px));
          height: 520px;
          background: #0f172a;
          color: #e5e7eb;
          border-radius: 20px;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.36);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          background: linear-gradient(135deg, rgba(46, 64, 108, 0.9), rgba(30, 64, 175, 0.75));
          backdrop-filter: blur(8px);
        }

        .chat-identity {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: linear-gradient(135deg, #1f2937, #0ea5e9);
          display: grid;
          place-items: center;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #e0f2fe;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .title {
          font-weight: 700;
          font-size: 15px;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          letter-spacing: 0.2px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.05);
        }

        .icon-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.65);
          color: #e5e7eb;
          border: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
          font-size: 18px;
          transition: background 160ms ease, transform 160ms ease;
        }

        .icon-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          transform: translateY(-1px);
        }

        .message-area {
          flex: 1;
          padding: 14px 16px 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          background: radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.05), transparent 25%),
            radial-gradient(circle at 80% 0%, rgba(129, 140, 248, 0.08), transparent 30%),
            #0b1220;
        }

        .message-area::-webkit-scrollbar {
          width: 6px;
        }

        .message-area::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 999px;
        }

        .bubble {
          max-width: 80%;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 14px;
          line-height: 1.4;
          position: relative;
          animation: pop 180ms ease;
        }

        .bubble-user {
          margin-left: auto;
          background: linear-gradient(135deg, #2563eb, #38bdf8);
          color: #f8fafc;
          box-shadow: 0 12px 30px rgba(37, 99, 235, 0.35);
        }

        .bubble-admin {
          margin-right: auto;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #e5e7eb;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.25);
        }

        .empty-state {
          margin: auto;
          text-align: center;
          color: #cbd5e1;
          padding: 24px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px dashed rgba(255, 255, 255, 0.08);
          border-radius: 16px;
        }

        .empty-title {
          font-weight: 700;
          margin-bottom: 6px;
        }

        .empty-body {
          font-size: 14px;
          color: #94a3b8;
        }

        .quick-replies {
          display: flex;
          gap: 8px;
          padding: 8px 14px;
          overflow-x: auto;
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.04);
        }

        .chip {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.7);
          color: #e2e8f0;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          cursor: pointer;
          transition: border 150ms ease, transform 150ms ease, background 150ms ease;
          white-space: nowrap;
        }

        .chip:hover {
          border-color: rgba(56, 189, 248, 0.6);
          transform: translateY(-1px);
          background: rgba(56, 189, 248, 0.08);
        }

        .input-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px 14px;
          background: rgba(15, 23, 42, 0.8);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .input-row input {
          flex: 1;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 11px 12px;
          color: #e5e7eb;
          font-size: 14px;
          outline: none;
          transition: border 160ms ease, box-shadow 160ms ease;
        }

        .input-row input:focus {
          border-color: rgba(56, 189, 248, 0.8);
          box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
        }

        .input-row input::placeholder {
          color: #94a3b8;
        }

        .send-btn {
          min-width: 76px;
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          border: none;
          color: #f8fafc;
          border-radius: 12px;
          padding: 11px 14px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease;
          box-shadow: 0 12px 30px rgba(14, 165, 233, 0.35);
        }

        .send-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 16px 36px rgba(14, 165, 233, 0.45);
        }

        .send-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
        }

        @keyframes pop {
          0% {
            transform: translateY(6px) scale(0.98);
            opacity: 0;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }

        @media (max-width: 520px) {
          .chat-panel {
            right: 12px;
            width: calc(100vw - 24px);
            height: 70vh;
            bottom: 96px;
          }

          .chat-toggle {
            right: 16px;
          }
        }
      `}</style>
    </>
  );
}
