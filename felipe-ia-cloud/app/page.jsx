'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const CHAT_KEY = 'felipe_ia_cloud_chats_v2';
const MEMORY_KEY = 'felipe_ia_cloud_memory_v1';
const FEEDBACK_KEY = 'felipe_ia_cloud_feedback_v1';

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function Icon({ name, size = 24 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.6-4.3 4.2-6 7.5-6s5.9 1.7 7.5 6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,
    wave: <><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    memory: <><path d="M8 3v3M16 3v3M8 18v3M16 18v3M3 8h3M18 8h3M3 16h3M18 16h3"/><rect x="6" y="6" width="12" height="12" rx="3"/></>,
    folder: <><path d="M3 7h7l2 2h9v10H3z"/></>,
    code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></>,
    dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    paperclip: <><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L14 3a3.5 3.5 0 1 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></>,
    arrow: <><path d="M12 19V5M7 10l5-5 5 5"/></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function newChat(mode = 'assistant') {
  return {
    id: makeId(),
    title: mode === 'code' ? 'Novo Felipe Code' : 'Novo chat',
    mode,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function shortTitle(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, 44) : 'Novo chat';
}

async function readAttachment(file) {
  const max = 8 * 1024 * 1024;
  if (file.size > max) throw new Error(`${file.name}: máximo de 8 MB por arquivo.`);
  const base = { id: makeId(), name: file.name, type: file.type || 'application/octet-stream' };

  if (file.type.startsWith('image/') || file.type === 'application/pdf') {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
    return { ...base, dataUrl };
  }

  return { ...base, text: (await file.text()).slice(0, 60000) };
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [memory, setMemory] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authError, setAuthError] = useState('');
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const savedChats = loadJson(CHAT_KEY, []);
    const initial = savedChats.length ? savedChats : [newChat()];
    setChats(initial);
    setActiveId(initial[0].id);
    setMemory(loadJson(MEMORY_KEY, []));
    setFeedback(loadJson(FEEDBACK_KEY, []));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(CHAT_KEY, JSON.stringify(chats.slice(0, 80)));
  }, [chats, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(MEMORY_KEY, JSON.stringify(memory.slice(0, 200)));
  }, [memory, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback.slice(0, 200)));
  }, [feedback, ready]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeId, chats, sending]);

  const active = useMemo(() => chats.find(c => c.id === activeId) || chats[0], [chats, activeId]);

  function updateActive(updater) {
    setChats(prev => prev.map(chat => {
      if (chat.id !== active?.id) return chat;
      const next = typeof updater === 'function' ? updater(chat) : { ...chat, ...updater };
      return { ...next, updatedAt: Date.now() };
    }));
  }

  function createChat(mode = active?.mode || 'assistant') {
    const chat = newChat(mode);
    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
    setSidebarOpen(false);
    setInput('');
    setAttachments([]);
    setError('');
  }

  function setMode(mode) {
    if (!active) return;
    updateActive(chat => ({ ...chat, mode }));
  }

  async function onFiles(event) {
    const list = Array.from(event.target.files || []).slice(0, 4);
    event.target.value = '';
    try {
      const parsed = [];
      for (const file of list) parsed.push(await readAttachment(file));
      setAttachments(prev => [...prev, ...parsed].slice(0, 4));
      setError('');
    } catch (e) {
      setError(e.message || 'Não consegui ler um dos arquivos.');
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && !attachments.length) || !active || sending) return;

    const userMessage = {
      id: makeId(),
      role: 'user',
      content: text || 'Analise os arquivos anexados.',
      attachmentNames: attachments.map(a => a.name),
      createdAt: Date.now()
    };

    const outgoing = [...active.messages, userMessage].slice(-24);
    const payloadAttachments = attachments;

    setInput('');
    setAttachments([]);
    setSending(true);
    setError('');

    updateActive(chat => ({
      ...chat,
      title: chat.messages.length ? chat.title : shortTitle(userMessage.content),
      messages: [...chat.messages, userMessage]
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: active.mode,
          messages: outgoing.map(m => ({ role: m.role, content: m.content })),
          attachments: payloadAttachments,
          memory: memory.slice(0, 12).map(x => x.text),
          feedback: feedback.slice(0, 10)
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha na Felipe IA.');

      updateActive(chat => ({
        ...chat,
        messages: [...chat.messages, {
          id: makeId(),
          role: 'assistant',
          content: data.text,
          model: data.model,
          toolSteps: data.toolSteps || 0,
          createdAt: Date.now()
        }]
      }));
    } catch (e) {
      setError(e.message || 'Falha ao conectar com a Felipe IA.');
    } finally {
      setSending(false);
    }
  }

  function deleteChat(chatId) {
    setChats(prev => {
      const next = prev.filter(c => c.id !== chatId);
      const safe = next.length ? next : [newChat()];
      if (chatId === activeId) setActiveId(safe[0].id);
      return safe;
    });
  }

  function startSpeech() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Reconhecimento de voz não é suportado neste navegador.');
      return;
    }
    const rec = new Recognition();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = e => setInput(prev => (prev ? prev + ' ' : '') + e.results[0][0].transcript);
    rec.start();
  }

  function login(provider) {
    setAuthError(
      provider === 'google'
        ? 'Para ativar o login Google, adicione AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET nas variáveis do projeto Vercel.'
        : 'Para ativar Apple/iCloud, adicione AUTH_APPLE_ID e AUTH_APPLE_SECRET do Sign in with Apple nas variáveis do projeto Vercel.'
    );
  }

  function logout() {
    setSession(null);
    setAccountOpen(false);
  }

  const initials = session?.user?.name
    ? session.user.name.split(' ').slice(0, 2).map(x => x[0]).join('').toUpperCase()
    : 'F';

  if (!ready || !active) return <main className="loading">Carregando Felipe IA…</main>;

  return (
    <main className="appShell">
      <header className="topBar">
        <button className="topIcon" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
          <Icon name="menu" size={27} />
        </button>

        <div className="modePill" role="tablist">
          <button className={active.mode === 'assistant' ? 'active' : ''} onClick={() => setMode('assistant')}>IA</button>
          <button className={active.mode === 'code' ? 'active' : ''} onClick={() => setMode('code')}>Code</button>
        </div>

        <button className="accountButton" onClick={() => setAccountOpen(true)} aria-label="Entrar na conta">
          {session?.user?.image ? <img src={session.user.image} alt="" /> : session?.user ? <span>{initials}</span> : <Icon name="user" size={24} />}
        </button>
      </header>

      <section className="chatStage">
        <div className="messages">
          {active.messages.length === 0 && (
            <div className="starterArea">
              <button onClick={() => setInput('Leia e explique este arquivo para mim.')}>📎 Leia e explique um arquivo</button>
              <button onClick={() => setInput('Me ajude a organizar uma ideia.')}>✦ Organize uma ideia comigo</button>
              <button onClick={() => setInput('Crie um plano passo a passo para mim.')}>🚗 Crie um plano passo a passo</button>
            </div>
          )}

          {active.messages.map(message => (
            <article key={message.id} className={`message ${message.role}`}>
              {message.role === 'user' ? (
                <div className="userBubble">
                  <div>{message.content}</div>
                  {!!message.attachmentNames?.length && (
                    <div className="attachmentLine"><Icon name="paperclip" size={17} /> {message.attachmentNames.join(' • ')}</div>
                  )}
                </div>
              ) : (
                <div className="assistantReply">
                  <div className="assistantMark">F</div>
                  <div>
                    <div className="assistantText">{message.content}</div>
                    {message.model && <div className="modelMeta">{message.model.replace('alibaba/', '')}</div>}
                  </div>
                </div>
              )}
            </article>
          ))}

          {sending && (
            <div className="assistantReply pending">
              <div className="assistantMark">F</div>
              <div className="dots"><i/><i/><i/></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </section>

      <section className="composerZone">
        {error && <div className="errorBox">{error}</div>}

        {!!attachments.length && (
          <div className="attachmentTray">
            {attachments.map(file => (
              <div className="attachmentChip" key={file.id}>
                <Icon name="paperclip" size={15} />
                <span>{file.name}</span>
                <button onClick={() => setAttachments(prev => prev.filter(x => x.id !== file.id))}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="composer">
          <textarea
            value={input}
            rows={1}
            placeholder={active.mode === 'code' ? 'Peça para programar…' : 'Pergunte à Felipe IA'}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="composerBottom">
            <button className="roundControl" onClick={() => fileRef.current?.click()} aria-label="Anexar">
              <Icon name="plus" size={28} />
            </button>
            <input ref={fileRef} type="file" hidden multiple accept="image/*,application/pdf,text/*,.md,.json,.csv" onChange={onFiles} />

            <button className="modelButton" onClick={() => setMode(active.mode === 'code' ? 'assistant' : 'code')}>
              {active.mode === 'code' ? 'Qwen3 Coder' : 'Qwen3 VL'} <span>⌄</span>
            </button>

            <button className={`roundControl micButton ${listening ? 'listening' : ''}`} onClick={startSpeech} aria-label="Microfone">
              <Icon name="mic" size={25} />
            </button>

            {input.trim() || attachments.length ? (
              <button className="voiceButton send" onClick={send} disabled={sending} aria-label="Enviar">
                <Icon name="arrow" size={24} />
              </button>
            ) : (
              <button className={`voiceButton ${listening ? 'listening' : ''}`} onClick={startSpeech} aria-label="Conversar por voz">
                <Icon name="wave" size={25} />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className={`sideDrawer ${sidebarOpen ? 'open' : ''}`}>
        <div className="drawerTop">
          <div className="felipeLogo">F</div>
          <div className="drawerActions">
            <button><Icon name="search" size={25}/></button>
            <button onClick={() => setSidebarOpen(false)}><Icon name="close" size={25}/></button>
          </div>
        </div>

        <button className="newChatButton" onClick={() => createChat()}>
          <Icon name="edit" size={25}/> Novo chat
        </button>

        <div className="drawerMenu">
          <button onClick={() => setMemoryOpen(true)}><Icon name="memory" size={25}/> Memória</button>
          <button onClick={() => fileRef.current?.click()}><Icon name="folder" size={25}/> Arquivos</button>
          <button onClick={() => { setMode('code'); setSidebarOpen(false); }}><Icon name="code" size={25}/> Felipe Code</button>
          <button onClick={() => setAccountOpen(true)}><Icon name="user" size={25}/> Conta</button>
        </div>

        <div className="recentLabel">Recentes</div>
        <div className="drawerChats">
          {chats.slice().sort((a,b) => b.updatedAt - a.updatedAt).map(chat => (
            <div className={`drawerChat ${chat.id === active.id ? 'selected' : ''}`} key={chat.id}>
              <button onClick={() => { setActiveId(chat.id); setSidebarOpen(false); }}>
                <span>{chat.title}</span>
              </button>
              <button className="chatMore" onClick={() => deleteChat(chat.id)}><Icon name="dots" size={20}/></button>
            </div>
          ))}
        </div>

        <button className="drawerAccount" onClick={() => setAccountOpen(true)}>
          <div className="accountAvatar">{session?.user?.image ? <img src={session.user.image} alt="" /> : initials}</div>
          <div>
            <strong>{session?.user?.name || 'Entrar na conta'}</strong>
            <span>{session?.user?.email || 'Google ou Apple/iCloud'}</span>
          </div>
        </button>
      </div>

      {sidebarOpen && <button className="screenOverlay" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />}

      {accountOpen && (
        <div className="modalBackdrop" onClick={() => setAccountOpen(false)}>
          <section className="accountModal" onClick={e => e.stopPropagation()}>
            <button className="modalClose" onClick={() => setAccountOpen(false)}><Icon name="close" size={22}/></button>

            {session?.user ? (
              <>
                <div className="accountBigAvatar">{session.user.image ? <img src={session.user.image} alt="" /> : initials}</div>
                <h2>{session.user.name || 'Sua conta'}</h2>
                <p>{session.user.email}</p>
                <button className="oauthButton" onClick={logout}>Sair da conta</button>
              </>
            ) : (
              <>
                <div className="accountLogo">F</div>
                <h2>Entrar na Felipe IA</h2>
                <p>Sincronize sua conta e prepare a Felipe IA para usar seus dados em qualquer dispositivo.</p>

                <button className="oauthButton" onClick={() => login('google')}>
                  <span className="providerIcon">G</span> Continuar com Google
                </button>
                <button className="oauthButton" onClick={() => login('apple')}>
                  <span className="providerIcon appleIcon">A</span> Continuar com Apple / iCloud
                </button>

                {authError && <div className="authNotice">{authError}</div>}
                <small>Seus provedores de login são configurados com OAuth na Vercel. A Felipe IA não recebe sua senha do Google ou iCloud.</small>
              </>
            )}
          </section>
        </div>
      )}

      {memoryOpen && (
        <div className="modalBackdrop" onClick={() => setMemoryOpen(false)}>
          <section className="memoryPanel" onClick={e => e.stopPropagation()}>
            <header><strong>Memória da Felipe IA</strong><button onClick={() => setMemoryOpen(false)}><Icon name="close" size={22}/></button></header>
            <div className="memoryList">
              {memory.length === 0 ? <p>Nenhuma memória salva ainda.</p> : memory.map(item => (
                <div className="memoryItem" key={item.id}>
                  <span>{item.text}</span>
                  <button onClick={() => setMemory(prev => prev.filter(x => x.id !== item.id))}>Excluir</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
