import ChatWidget from "../components/ChatWidget";

export default function Home() {
  return (
    <main className="page">
      <div className="hero">
        <div className="copy">
          <p className="eyebrow">Customer Support</p>
          <h1>
            Welcome to <span>Our Platform</span>
          </h1>
          <p className="lede">
            We're here to help! Click the chat button in the bottom right corner
            to start a conversation with our support team.
          </p>
          <div className="actions">
            <button className="primary">Get Started</button>
            <button className="ghost">Learn More</button>
          </div>
          <ul className="list">
            <li>24/7 Customer Support</li>
            <li>Instant Response Times</li>
            <li>Expert Assistance</li>
          </ul>
        </div>
        <div className="panel">
          <div className="card">
            <div className="card-header">
              <p className="label">Active Support</p>
              <span className="pill">Online</span>
            </div>
            <p className="stat">Ready to Help</p>
            <p className="note">Our team is standing by</p>
          </div>
          <div className="card">
            <div className="card-header">
              <p className="label">Response Time</p>
            </div>
            <p className="stat">&lt; 1 minute</p>
            <p className="note">Average response time</p>
          </div>
          <div className="bars">
            <div className="bar">
              <span>Customer Satisfaction</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: "95%" }}></div>
              </div>
              <span className="bar-value">95%</span>
            </div>
            <div className="bar">
              <span>Issues Resolved</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: "98%" }}></div>
              </div>
              <span className="bar-value">98%</span>
            </div>
          </div>
        </div>
      </div>
      <ChatWidget />
    </main>
  );
}
