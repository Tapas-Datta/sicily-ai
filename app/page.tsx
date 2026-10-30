="use client";

import { useState, useEffect, useRef } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Username states
  const [username, setUsername] = useState("");
  const [tempName, setTempName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);

  // Thinking animation states
  const [thinkingMessage, setThinkingMessage] = useState(
    "Sicily is scanning the database..."
  );

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<string | null>(null);

  const thinkingMessages = [
    "Sicily is scanning the database...",
    "Crafting the best response for you...",
    "Analyzing your request...",
    "Almost ready...",
  ];

  // Load username from localStorage
  useEffect(() => {
    try {
      const savedName = localStorage.getItem("sicily_username");
      if (savedName) {
        setUsername(savedName);
      } else {
        setShowNameModal(true);
      }
    } catch (error) {
      console.error("LocalStorage error:", error);
      setShowNameModal(true);
    }
  }, []);

  // Thinking message rotator
  useEffect(() => {
    if (!loading) return;
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % thinkingMessages.length;
      setThinkingMessage(thinkingMessages[index]);
    }, 2000);
    return () => clearInterval(interval);
  }, [loading]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Handle name submission
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = tempName.trim();
    if (!finalName) return;

    setUsername(finalName);
    try {
      localStorage.setItem("sicily_username", finalName);
    } catch (error) {
      console.error("Could not save username:", error);
    }
    setShowNameModal(false);
  };

  // Start new chat
  const handleNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = null;
    activeRequestRef.current = null;

    setMessages([]);
    setInput("");
    setLoading(false);
    setThinkingMessage(thinkingMessages[0]);
  };

  // Stop generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = null;
    activeRequestRef.current = null;
    setLoading(false);
  };

  // Send message function
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const requestId = Math.random().toString(36).substring(2, 15);
    const assistantId = Math.random().toString(36).substring(2, 15);
    const controller = new AbortController();

    abortControllerRef.current = controller;
    activeRequestRef.current = requestId;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(2, 15),
      role: "user",
      content: text,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setThinkingMessage(thinkingMessages[0]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: updatedMessages.map(({ role, content }) => ({
            role,
            content,
          })),
          username: username || "Guest",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `API Error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response stream is unavailable.");
      }

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (activeRequestRef.current !== requestId) {
          await reader.cancel();
          return;
        }

        aiResponse += decoder.decode(value, { stream: true });

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, content: aiResponse } : msg
          )
        );
      }

      aiResponse += decoder.decode();
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: aiResponse } : msg
        )
      );
    } catch (error: any) {
      if (error?.name === "AbortError") return;

      console.error("Sicily Chat Error:", error);
      if (activeRequestRef.current === requestId) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2, 15),
            role: "assistant",
            content: "Sorry, something went wrong. Please try again!",
          },
        ]);
      }
    } finally {
      if (activeRequestRef.current === requestId) {
        activeRequestRef.current = null;
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <main className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Username Modal */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full shadow-2xl text-center">
            <h2 className="text-2xl font-bold mb-2">Welcome to Sicily AI</h2>
            <p className="text-gray-400 mb-6 text-sm">
              Please enter your name so Sicily can personalize your experience.
            </p>
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Enter your name..."
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                maxLength={50}
                className="w-full px-4 py-3 bg-gray-950 border border-gray-800 rounded-xl focus:outline-none focus:border-blue-500 text-white"
                autoFocus
                required
              />
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 transition font-semibold rounded-xl text-white shadow-lg"
              >
                Start Chatting
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
        <h1 className="text-xl font-bold">
          Sicily AI <span className="text-blue-500">v2.0</span>
        </h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400">
            User: <span className="text-blue-400 font-medium">{username || "Guest"}</span>
          </div>
          <button
            onClick={handleNewChat}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
          >
            + New Chat
          </button>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <h2 className="text-3xl font-bold text-white mb-3">Sicily AI</h2>
            <p className="text-lg">
              Hello {username || "Guest"}! How can Sicily help you today?
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-gray-900 border border-gray-800 text-gray-200 rounded-bl-none"
              }`}
            >
              {msg.content || (
                <span className="animate-pulse text-gray-500">Sicily is thinking...</span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-900 border border-gray-800 px-4 py-3 rounded-2xl rounded-bl-none text-sm text-blue-400 animate-pulse flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
              {thinkingMessage}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={sendMessage}
        className="p-4 border-t border-gray-800 bg-gray-900/50 max-w-3xl w-full mx-auto flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Sicily anything..."
          className="flex-1 min-w-0 px-4 py-3 bg-gray-950 border border-gray-800 rounded-xl focus:outline-none focus:border-blue-500 text-white text-sm"
          disabled={loading}
        />

        {loading ? (
          <button
            type="button"
            onClick={handleStop}
            className="px-5 py-3 bg-red-600 hover:bg-red-700 transition font-semibold rounded-xl text-sm"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 transition font-semibold rounded-xl text-sm disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
    </main>
  );
}