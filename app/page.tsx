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
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('sicily_hacker_sessions');
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
      localStorage.setItem('sicily_hacker_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'root@sec_session:~#',
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

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // সেশনে ক্লিক হওয়া থেকে আটকানোর জন্য
    const updatedSessions = sessions.filter((s) => s.id !== id);

    if (updatedSessions.length === 0) {
      // যদি সব সেশন ডিলিট হয়ে যায়, তবে নতুন একটি সেশন তৈরি হবে
      const newId = Date.now().toString();
      const newSession: ChatSession = {
        id: newId,
        title: 'root@sec_session:~#',
        messages: [],
      };
      setSessions([newSession]);
      setCurrentSessionId(newId);
      setMessages([]);
    } else {
      setSessions(updatedSessions);
      if (currentSessionId === id) {
        setCurrentSessionId(updatedSessions[0].id);
        setMessages(updatedSessions[0].messages);
      }
    }
    localStorage.setItem('sicily_hacker_sessions', JSON.stringify(updatedSessions.length > 0 ? updatedSessions : []));
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
          const title = s.messages.length === 0 ? `> ${userMsgContent.slice(0, 22)}...` : s.title;
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
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant', content: `[ERROR] ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#030712] text-[#00f0ff] font-mono selection:bg-[#00f0ff] selection:text-black">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar - Terminal Logs / Sessions */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 border-r border-[#00f0ff22] flex flex-col p-4 shrink-0 transition-transform duration-300 bg-[#02050e] ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#00f0ff22]">
          <button
            onClick={createNewChat}
            className="flex-1 py-2 px-3 bg-[#00f0ff10] border border-[#00f0ff44] hover:bg-[#00f0ff25] text-[#00f0ff] rounded text-xs font-bold transition cursor-pointer tracking-wider uppercase text-center shadow-[0_0_10px_rgba(0,240,255,0.1)]"
          >
            + NEW SESSION
          </button>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden ml-2 p-2 text-[#00f0ff]/60 hover:text-[#00f0ff]"
          >
            [X]
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          <div className="text-[10px] tracking-widest text-[#38bdf8]/60 mb-2 uppercase">SECURE LOGS // HISTORY</div>
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => switchSession(session.id)}
              className={`group flex items-center justify-between w-full px-3 py-2 rounded text-xs transition cursor-pointer font-mono ${
                session.id === currentSessionId
                  ? 'bg-[#00f0ff20] text-[#00f0ff] border-l-2 border-[#00f0ff] font-bold shadow-[inset_0_0_10px_rgba(0,240,255,0.05)]'
                  : 'text-[#38bdf8]/70 hover:bg-[#00f0ff10] hover:text-[#00f0ff]'
              }`}
            >
              <span className="truncate flex-1">{session.title || 'root@session:~#'}</span>
              <button
                onClick={(e) => deleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded text-[10px] transition ml-2 shrink-0"
                title="Delete Session"
              >
                [🗑️]
              </button>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-[#00f0ff22] flex items-center justify-between text-[10px] text-[#38bdf8]/60 uppercase tracking-widest">
          <span>SECURE_TERMINAL v2.0</span>
          <span className="text-emerald-400 animate-pulse">● LIVE</span>
        </div>
      </aside>

      {/* Main Terminal Window */}
      <main className="flex-1 flex flex-col h-screen w-full overflow-hidden max-w-5xl mx-auto p-3 md:p-6">
        
        {/* Executive Hacker Header */}
        <header className="py-2.5 px-4 border border-[#00f0ff33] rounded-lg mb-4 shrink-0 flex items-center justify-between bg-black/40 backdrop-blur-md shadow-[0_0_15px_rgba(0,240,255,0.05)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1.5 rounded bg-[#00f0ff10] border border-[#00f0ff33] text-[#00f0ff] text-xs"
            >
              [≡]
            </button>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-red-500/80 rounded-full inline-block"></span>
              <span className="w-2.5 h-2.5 bg-yellow-500/80 rounded-full inline-block"></span>
              <span className="w-2.5 h-2.5 bg-[#00f0ff] rounded-full inline-block shadow-[0_0_8px_#00f0ff]"></span>
              <h1 className="text-xs md:text-sm font-bold tracking-widest text-[#00f0ff] uppercase ml-1">
                TD_AI // SECURE_TERMINAL
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] hidden sm:inline px-2 py-0.5 rounded bg-[#00f0ff10] border border-[#00f0ff33] text-[#38bdf8]">
              ENCRYPTION: AES-256
            </span>
            <span className="text-[10px] opacity-70">By Tapas Datta</span>
          </div>
        </header>

        {/* Message Log Console */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-lg border border-[#00f0ff22] bg-black/60 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] pr-2">
          {messages.length === 0 && (
            <div className="text-center opacity-40 mt-32 text-xs uppercase tracking-widest text-[#38bdf8]">
              &