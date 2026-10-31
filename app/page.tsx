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
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar toggle
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('sicily_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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

  const switchSession = (id: string) => {
    const target = sessions.find((s) => s.id === id);
    if (target) {
      setCurrentSessionId(id);
      setMessages(target.messages);
      setIsSidebarOpen(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
      setInput((prev) => (prev ? prev + ' ' + transcript : transcript));
    };
    recognition.start();
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !input.trim() || isLoading) return;

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
          const title = s.messages.length === 0 ? userMsgContent.slice(0, 30) : s.title;
          return { ...s, title, messages: updatedMessages };
        }
        return s;
      })
    );

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      const assistantId = (Date.now() + 1).toString();

      const newMessagesWithAssistant = [...updatedMessages, { id: assistantId, role: 'assistant' as const, content: '' }];
      setMessages(newMessagesWithAssistant);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          assistantMessage += chunk;

          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantId ? { ...msg, content: assistantMessage } : msg))
          );
        }
      }

      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, messages: [...updatedMessages, { id: assistantId, role: 'assistant', content: assistantMessage }] } : s))
      );
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex h-screen w-full overflow-hidden ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-900'}`}>
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
        />
      )}

      {/* Sidebar for History (Responsive) */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 border-r flex flex-col p-4 shrink-0 transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={createNewChat}
            className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition cursor-pointer text-sm"
          >
            + New Chat
          </button>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden ml-2 p-2 text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => switchSession(session.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition cursor-pointer ${
                session.id === currentSessionId
                  ? isDarkMode ? 'bg-gray-800 text-blue-400 font-semibold' : 'bg-gray-200 text-blue-600 font-semibold'
                  : isDarkMode ? 'text-gray-400 hover:bg-gray-800/50' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {session.title || 'New Conversation'}
            </button>
          ))}
        </div>

        <div className="pt-4 border-t flex items-center justify-between text-xs opacity-70">
          <span>Sicily AI v2.0</span>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-600 cursor-pointer"
          >
            {isDarkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-screen w-full overflow-hidden max-w-4xl mx-auto p-3 md:p-4">
        
        {/* Header (with Mobile Menu Toggle) */}
        <header className="py-3 border-b mb-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg bg-gray-800 text-white text-sm"
            >
              ☰
            </button>
            <h1 className="text-lg md:text-xl font-bold text-blue-500">Sicily</h1>
          </div>
          <span className="text-xs opacity-60">Created by Tapas Datta</span>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 flex flex-col">
          {messages.length === 0 && (
            <div className="text-center opacity-50 mt-28 text-sm">How can Sicily help you today?</div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`p-3 md:p-4 rounded-xl max-w-[90%] md:max-w-[85%] ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white self-end ml-auto'
                  : isDarkMode ? 'bg-gray-900 text-gray-100 border border-gray-800 self-start' : 'bg-white text-gray-800 border border-gray-200 shadow-sm self-start'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs opacity-70">{m.role === 'user' ? 'You' : 'Sicily'}</span>
                {m.role === 'assistant' && (
                  <button onClick={() => speakText(m.content)} className="text-xs opacity-60 hover:opacity-100 cursor-pointer">
                    🔊 Listen
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="pt-3 md:pt-4 shrink-0">
          <div className={`flex items-center gap-2 p-2 rounded-xl border ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-300 shadow-sm'}`}>
            <button
              type="button"
              onClick={handleVoiceInput}
              className={`p-2 rounded-full cursor-pointer ${isListening ? 'bg-red-500 text-white animate-pulse' : 'opacity-70 hover:opacity-100'}`}
              title="Voice Input"
            >
              🎤
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sicily anything..."
              className="flex-1 bg-transparent p-2 focus:outline-none text-sm"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 md:px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition cursor-pointer disabled:opacity-50 text-sm shrink-0"
            >
              {isLoading ? 'Thinking...' : 'Send'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
