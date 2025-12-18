"use client";

import ChatWidget from "../components/ChatWidget";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <div className="copy">
          <p className="eyebrow">Real-time assistance</p>
          <h1>
            Support that feels human,
            <span> available on demand.</span>
          </h1>
          <p className="lede">
            Drop a question and our specialists step in instantly—no tickets, no
            waiting rooms, just direct answers.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                typeof window !== "undefined" &&
                window.dispatchEvent(new Event("chat:open"))
              }
            >
              Start a chat
            </button>
            <button className="ghost">View SLAs</button>
          </div>
          <ul className="list">
            <li>Live agents paired with smart routing</li>
            <li>Conversation history anchored to your browser</li>
            <li>Average first response under 2 minutes</li>
          </ul>
        </div>

        <div className="panel">
          <div className="card">
            <div className="card-header">
              <div>
                <p className="label">Today’s queue</p>
                <p className="stat">04 active chats</p>
              </div>
              <span className="pill">Live</span>
            </div>
            <div className="bars">
              <div className="bar">
                <span>Billing</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: "68%" }} />
                </div>
                <span className="bar-value">~3 min</span>
              </div>
              <div className="bar">
                <span>Orders</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: "82%" }} />
                </div>
                <span className="bar-value">~2 min</span>
              </div>
              <div className="bar">
                <span>General</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: "45%" }} />
                </div>
                <span className="bar-value">~5 min</span>
              </div>
            </div>
          </div>
          <div className="note">Tap the bubble to open the chat experience.</div>
        </div>
      </section>

      <ChatWidget />
    </main>
  );
}
