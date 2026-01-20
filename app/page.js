"use client";

import { useState, useRef, useEffect } from "react";
import { BUSINESS_CONFIG } from "../config.js";
import styles from "./page.module.css";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e, quickMessage = null) => {
    if (e) e.preventDefault();
    const messageText = quickMessage || input.trim();
    if (!messageText || isLoading) return;

    setInput("");
    setShowWelcome(false);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: messageText }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText, session }),
      });

      const data = await response.json();

      if (data.success) {
        setSession(data.session);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response || "Sorry, something went wrong. Please try again.",
          },
        ]);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (text) => {
    sendMessage(null, text);
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🍪</span>
          </div>
          <div className={styles.headerText}>
            <h1>{BUSINESS_CONFIG.businessName}</h1>
            <span className={styles.status}>
              <span className={styles.statusDot}></span>
              Online now
            </span>
          </div>
        </header>

        {/* Messages */}
        <div className={styles.messages}>
          {showWelcome && messages.length === 0 && (
            <div className={styles.welcome}>
              <div className={styles.welcomeIcon}>🍪</div>
              <h2>Welcome to {BUSINESS_CONFIG.businessName}!</h2>
              <p>{BUSINESS_CONFIG.tagline}</p>
              <p className={styles.welcomeSub}>Tap below to get started</p>

              <div className={styles.welcomeActions}>
                <button onClick={() => handleQuickAction("I'd like to place an order")}>
                  Place an order
                </button>
                <button onClick={() => handleQuickAction("What flavors do you have?")}>
                  See our flavors
                </button>
                <button onClick={() => handleQuickAction("What are your hours?")}>
                  Hours & pickup info
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`${styles.message} ${
                msg.role === "user" ? styles.userMessage : styles.botMessage
              }`}
            >
              {msg.role === "assistant" && (
                <div className={styles.avatar}>🍪</div>
              )}
              <div className={styles.content}>
                {msg.content.split("\n").map((line, j) => (
                  <span key={j}>
                    {line.startsWith("**") && line.endsWith("**") ? (
                      <strong>{line.slice(2, -2)}</strong>
                    ) : line.startsWith("•") ? (
                      <span className={styles.bullet}>{line}</span>
                    ) : (
                      line
                    )}
                    {j < msg.content.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className={`${styles.message} ${styles.botMessage}`}>
              <div className={styles.avatar}>🍪</div>
              <div className={styles.typing}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick replies after conversation starts */}
        {!showWelcome && messages.length > 0 && !isLoading && (
          <div className={styles.quickReplies}>
            <button onClick={() => handleQuickAction("Add to my order")}>
              Add more
            </button>
            <button onClick={() => handleQuickAction("What's my order total?")}>
              My order
            </button>
            <button onClick={() => handleQuickAction("I'm done ordering")}>
              Checkout
            </button>
          </div>
        )}

        {/* Input */}
        <form onSubmit={sendMessage} className={styles.inputForm}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message..."
            disabled={isLoading}
            className={styles.input}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={styles.sendButton}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    </main>
  );
}
