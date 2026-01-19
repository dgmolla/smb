"use client";

import { useState, useRef, useEffect } from "react";
import { BUSINESS_CONFIG } from "../config.js";
import styles from "./page.module.css";

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Hello! Welcome to ${BUSINESS_CONFIG.businessName}! I can help you place an order or answer questions. What can I do for you?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, session }),
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
      inputRef.current?.focus();
    }
  };

  const handleQuickAction = (text) => {
    setInput(text);
    inputRef.current?.focus();
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerIcon}>❤️</div>
          <div className={styles.headerText}>
            <h1>{BUSINESS_CONFIG.businessName}</h1>
            <p>{BUSINESS_CONFIG.tagline}</p>
          </div>
        </header>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`${styles.message} ${
                msg.role === "user" ? styles.userMessage : styles.botMessage
              }`}
            >
              <div className={styles.avatar}>
                {msg.role === "user" ? "👤" : "❤️"}
              </div>
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
                    <br />
                  </span>
                ))}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className={`${styles.message} ${styles.botMessage}`}>
              <div className={styles.avatar}>❤️</div>
              <div className={styles.typing}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className={styles.inputForm}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className={styles.input}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={styles.sendButton}
          >
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path fill="currentColor" d="M2,21L23,12L2,3V10L17,12L2,14V21Z" />
            </svg>
          </button>
        </form>

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <button onClick={() => handleQuickAction("I'd like to place an order")}>
            🛒 Order
          </button>
          <button onClick={() => handleQuickAction("What flavors do you have?")}>
            🍪 Flavors
          </button>
          <button onClick={() => handleQuickAction("What are your hours?")}>
            🕐 Hours
          </button>
        </div>
      </div>
    </main>
  );
}
