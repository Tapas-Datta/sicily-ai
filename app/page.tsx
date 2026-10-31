
'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved conversations
  useEffect(() => {
    const saved = localStorage.getItem('sicily_sessions');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
          setMessages(parsed[0].messages);
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }

    createNewChat();
  }, []);

  // Save conversations
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(
        'sicily_sessions',
        JSON.stringify(sessions)
      );
    }
  }, [sessions]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isLoading]);

  // New chat
  const createNewChat = () => {
    const newId = Date.now().toString();

    const newSession: ChatSession = {
      id: newId,
      title: 'New Conversation',
      messages: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessages([]);
    setIsSidebarOpen(false);
  };

  // Switch conversation
  const switchSession = (id: string) => {
    const target = sessions.find((s) => s.id === id);

    if (target) {
      setCurrentSessionId(id);
      setMessages(target.messages);
      setIsSidebarOpen(false);
    }
  };

  // Voice input
  const handleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;

      setInput((prev) =>
        prev ? prev + ' ' + transcript : transcript
      );
    };

    recognition.start();
  };

  // Speak assistant response
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Send message
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMsgContent = input;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMsgContent,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === currentSessionId) {
          const title =
            s.messages.length === 0
              ? userMsgContent.slice(0, 30)
              : s.title;

          return {
            ...s,
            title,
            messages: updatedMessages,
          };
        }

        return s;
      })
    );

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages,
        }),
      });

      // FIX: Safely handle API errors, including empty responses
      if (!res.ok) {
        const errorText = await res.text();

        let errorMessage = `Request failed (${res.status})`;

        if (errorText.trim()) {
          try {
            const errorData = JSON.parse(errorText);

            errorMessage =
              errorData.error ||
              errorData.message ||
              errorMessage;
          } catch {
            errorMessage = errorText;
          }
        }

        throw new Error(errorMessage);
      }

      // Check whether the streaming response exists
      if (!res.body) {
        throw new Error('The AI server returned an empty response.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = '';
      const assistantId = (Date.now() + 1).toString();

      const newMessagesWithAssistant = [
        ...updatedMessages,
        {
          id: assistantId,
          role: 'assistant' as const,
          content: '',
        },
      ];

      setMessages(newMessagesWithAssistant);

      // Read streaming response
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, {
          stream: true,
        });

        assistantMessage += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: assistantMessage }
              : msg
          )
        );
      }

      // Flush any remaining decoded text
      assistantMessage += decoder.decode();

      // Update conversation history
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: assistantMessage }
            : msg
        )
      );

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: [
                  ...updatedMessages,
                  {
                    id: assistantId,
                    role: 'assistant',
                    content: assistantMessage,
                  },
                ],
              }
            : s
        )
      );

    } catch (err: any) {
      console.error('Chat API Error:', err);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Error: ${err.message || 'Something went wrong. Please try again.'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`tapas-app ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>

        <div className="sidebar-brand">
          <div className="brand-logo">T</div>
          <span>Tapas<span className="brand-accent">_AI</span></span>

          <button
            className="mobile-close"
            onClick={() => setIsSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <button
          onClick={createNewChat}
          className="new-chat-btn"
        >
          <span>＋</span> New Chat
        </button>

        <div className="history-heading">
          YOUR CONVERSATIONS
        </div>

        <div className="history-list">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => switchSession(session.id)}
              className={`history-item ${
                session.id === currentSessionId
                  ? 'history-active'
                  : ''
              }`}
            >
              <span className="history-icon">▢</span>
              <span className="history-title">
                {session.title || 'New Conversation'}
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className="status-dot" />
            <div>
              <strong>Tapas_AI v2.0</strong>
              <small>Your intelligence terminal</small>
            </div>
          </div>

          <button
            className="theme-toggle"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="Toggle theme"
          >
            {isDarkMode ? '☀' : '☾'}
          </button>
        </div>
      </aside>

      {/* Main workspace */}
      <main className="main-area">

        <header className="top-header">
          <button
            className="mobile-menu"
            onClick={() => setIsSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="header-title">
            Tapas<span>_AI</span>
          </div>

          <span className="creator-label">
            Created by <strong>Tapas Datta</strong>
          </span>
        </header>

        {/* Chat area */}
        <section className="chat-area">

          {messages.length === 0 ? (
            <div className="welcome-screen">

              <div className="welcome-copy">
                <div className="terminal-label">
                  <span className="terminal-line" />
                  YOUR INTELLIGENCE TERMINAL
                </div>

                <div className="welcome-kicker">
                  <span className="kicker-dot" />
                  WELCOME TO TAPAS_AI
                </div>

                <h1 className="hero-title">
                  Think.
                  <span>Create.</span>
                  <span>
                    Go Beyond<span className="hero-cursor">_</span>
                  </span>
                </h1>

                <div className="hero-divider" />

                <p className="hero-subtitle">
                  Tapas_AI is here to think with you,
                  <br />
                  turn your ideas into possibilities.
                </p>
              </div>

              {/* Original CSS-generated energy core */}
              <div className="energy-scene">
                <div className="energy-glow" />

                <div className="energy-orbit orbit-one" />
                <div className="energy-orbit orbit-two" />
                <div className="energy-orbit orbit-three" />

                <div className="energy-core">
                  <div className="core-inner">
                    <span>T</span>
                  </div>
                </div>

                <div className="energy-particle particle-one" />
                <div className="energy-particle particle-two" />
                <div className="energy-particle particle-three" />
                <div className="energy-particle particle-four" />

                <div className="energy-platform">
                  <div />
                  <div />
                  <div />
                </div>
              </div>

            </div>
          ) : (
            <div className="messages-container">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`message-row ${
                    m.role === 'user'
                      ? 'user-row'
                      : 'assistant-row'
                  }`}
                >
                  <div
                    className={`message-avatar ${
                      m.role === 'assistant' ? 'assistant-avatar' : ''
                    }`}
                  >
                    {m.role === 'user' ? 'Y' : 'T'}
                  </div>

                  <div className="message-content">
                    <div className="message-name">
                      {m.role === 'user' ? 'You' : 'Tapas_AI'}
                    </div>

                    <p>{m.content}</p>

                    {m.role === 'assistant' && (
                      <button
                        onClick={() => speakText(m.content)}
                        className="listen-btn"
                      >
                        🔊 Listen
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="thinking-indicator">
                  <span />
                  <span />
                  <span />
                  Tapas_AI is thinking...
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

        </section>

        {/* Message composer */}
        <form onSubmit={handleSubmit} className="input-section">
          <div className="input-container">

            <button
              type="button"
              onClick={handleVoiceInput}
              className={`voice-btn ${isListening ? 'listening' : ''}`}
              title="Voice Input"
            >
              🎤
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Tapas_AI anything..."
              className="chat-input"
            />

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="send-btn"
            >
              {isLoading ? 'Thinking...' : '➤'}
              {!isLoading && <span>Send</span>}
            </button>

          </div>

          <div className="input-caption">
            Powered by Tapas_AI · Think. Create. Go Beyond.
          </div>
        </form>

      </main>
    </div>
  );
}
