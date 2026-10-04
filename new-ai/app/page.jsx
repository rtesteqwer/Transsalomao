'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const CHATS_KEY = 'new_ai_chats_v1';
const MEMORY_KEY = 'new_ai_memory_v1';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function createChat() {
  return {
    id: uid(),
    title: 'Nova conversa',
    messages: [],
    updatedAt: Date.now()
  };
}

function titleFrom(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, 44) : 'Nova conversa';
}

async function readFile(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error(file.name + ': limite de 10 MB.');

  const base = { id: uid(), name: file.name, type: file.type || 'application/octet-stream' };

  if (file.type.startsWith('image/') || file.type === 'application/pdf') {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsDataURL(file);
    });
    return { ...base, dataUrl };
  }

  return { ...base, text: (await file.text()).slice(0, 80000) };
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [memory, setMemory] = useState([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const saved = load(CHATS_KEY, []);
    const initial = saved.length ? saved : [createChat()];
    setChats(initial);
    setActiveId(initial[0].id);
    setMemory(load(MEMORY_KEY, []));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 80)));
  }, [chats, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(MEMORY_KEY, JSON.stringify(memory.slice(0, 250)));
  }, [memory, ready]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeId, sending]);

  const active = useMemo(
    () => chats.find(chat => chat.id === activeId) || chats[0],
    [chats, activeId]
  );

  function patchActive(updater) {
    setChats(prev =>
      prev.map(chat => {
        if (chat.id !== active?.id) return chat;
        const next = typeof updater === 'function' ? updater(chat) : { ...chat, ...updater };
        return { ...next, updatedAt: Date.now() };
      })
    );
  }

  function newChat() {
    const chat = createChat();
    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
    setSidebarOpen(false);
    setInput('');
    setAttachments([]);
    setError('');
  }

  async function onFiles(event) {
    const selected = Array.from(event.target.files || []).slice(0, 6);
    event.target.value = '';
    if (!selected.length) return;

    try {
      const parsed = [];
      for (const file of selected) parsed.push(await readFile(file));
      setAttachments(prev => [...prev, ...parsed].slice(0, 6));
      setError('');
    } catch (e) {
      setError(e?.message || 'Falha ao ler arquivo.');
    }
  }

  async function send() {
    if (!active || sending) return;
    const text = input.trim();
    if (!text && !attachments.length) return;

    const userMessage = {
      id: uid(),
      role: 'user',
      content: text || 'Analise os arquivos anexados.',
      attachmentNames: attachments.map(item => item.name),
      createdAt: Date.now()
    };

    const history = [...active.messages, userMessage].slice(-30);
    const currentAttachments = attachments;

    patchActive(chat => ({
      ...chat,
      title: chat.messages.length ? chat.title : titleFrom(userMessage.content),
      messages: [...chat.messages, userMessage]
    }));

    setInput('');
    setAttachments([]);
    setSending(true);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(message => ({
            role: message.role,
            content: message.content
          })),
          attachments: currentAttachments,
          memory: memory.map(item => item.text)
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Falha ao conversar com a New.');

      patchActive(chat => ({
        ...chat,
        messages: [
          ...chat.messages,
          { id: uid(), role: 'assistant', content: data.text, createdAt: Date.now() }
        ]
      }));
    } catch (e) {
      setError(e?.message || 'Falha ao conversar com a New.');
    } finally {
      setSending(false);
    }
  }

  function saveMemory() {
    const text = memoryDraft.trim();
    if (!text) return;
    setMemory(prev => [{ id: uid(), text, createdAt: Date.now() }, ...prev]);
    setMemoryDraft('');
  }

  function deleteChat(id) {
    setChats(prev => {
      const next = prev.filter(chat => chat.id !== id);
      const safe = next.length ? next : [createChat()];
      if (id === activeId) setActiveId(safe[0].id);
      return safe;
    });
  }

  if (!ready || !active) {
    return <main className="loading">Iniciando New…</main>;
  }

  return (
    <main className="appShell">
      <aside className={'sidebar ' + (sidebarOpen ? 'open' : '')}>
        <div className="brandRow">
          <div className="logo">N</div>
          <div className="brandText">
            <strong>New</strong>
            <span>Inteligência artificial</span>
          </div>
          <button className="icon mobile" onClick={() => setSidebarOpen(false)}>×</button>
        </div>

        <button className="newButton" onClick={newChat}>＋ Nova conversa</button>

        <div className="history">
          {chats
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(chat => (
              <div className={'historyRow ' + (chat.id === active.id ? 'active' : '')} key={chat.id}>
                <button
                  className="historySelect"
                  onClick={() => {
                    setActiveId(chat.id);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="dot" />
                  <span>{chat.title}</span>
                </button>
                <button className="historyDelete" onClick={() => deleteChat(chat.id)}>×</button>
              </div>
            ))}
        </div>

        <div className="sidebarBottom">
          <button className="memoryButton" onClick={() => setMemoryOpen(true)}>
            <span>Memória</span>
            <b>{memory.length}</b>
          </button>
          <div className="status"><i /> Online</div>
        </div>
      </aside>

      {sidebarOpen && (
        <button className="overlay" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />
      )}

      <section className="workspace">
        <header className="topbar">
          <button className="icon mobile" onClick={() => setSidebarOpen(true)}>☰</button>
          <div>
            <strong>New</strong>
            <span>Assistente inteligente</span>
          </div>
          <button className="memoryTop" onClick={() => setMemoryOpen(true)}>Memória</button>
        </header>

        <section className="messages">
          {active.messages.length === 0 && (
            <div className="hero">
              <div className="heroLogo">N</div>
              <h1>Olá. Eu sou a New.</h1>
              <p>Posso conversar, analisar imagens e PDFs, organizar ideias, explicar assuntos e ajudar em tarefas complexas.</p>
              <div className="prompts">
                {[
                  'Explique um assunto difícil de forma simples',
                  'Analise um PDF para mim',
                  'Me ajude a criar um projeto',
                  'Revise este texto'
                ].map(item => (
                  <button key={item} onClick={() => setInput(item)}>{item}</button>
                ))}
              </div>
            </div>
          )}

          {active.messages.map(message => (
            <article className={'message ' + message.role} key={message.id}>
              <div className="avatar">{message.role === 'user' ? 'V' : 'N'}</div>
              <div className="content">
                <div className="author">{message.role === 'user' ? 'Você' : 'New'}</div>
                <div className="text">{message.content}</div>
                {!!message.attachmentNames?.length && (
                  <div className="attachmentNames">📎 {message.attachmentNames.join(' • ')}</div>
                )}
                {message.role === 'assistant' && (
                  <button className="copy" onClick={() => navigator.clipboard?.writeText(message.content)}>
                    Copiar
                  </button>
                )}
              </div>
            </article>
          ))}

          {sending && (
            <article className="message assistant">
              <div className="avatar">N</div>
              <div className="content">
                <div className="author">New</div>
                <div className="typing"><span /><span /><span /></div>
              </div>
            </article>
          )}
          <div ref={bottomRef} />
        </section>

        <footer className="composerArea">
          {error && <div className="error">{error}</div>}

          {!!attachments.length && (
            <div className="attachmentTray">
              {attachments.map(file => (
                <div className="chip" key={file.id}>
                  <span>{file.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter(item => item.id !== file.id))}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="composer">
            <button className="attach" onClick={() => fileRef.current?.click()}>＋</button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*,application/pdf,text/*,.md,.json,.csv"
              onChange={onFiles}
            />
            <textarea
              rows={1}
              value={input}
              placeholder="Mensagem para New…"
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              className="send"
              onClick={send}
              disabled={sending || (!input.trim() && !attachments.length)}
            >
              ↑
            </button>
          </div>
          <small>A New pode cometer erros. Confira informações importantes.</small>
        </footer>
      </section>

      {memoryOpen && (
        <div className="modal" onClick={() => setMemoryOpen(false)}>
          <section className="memoryPanel" onClick={e => e.stopPropagation()}>
            <header>
              <div>
                <strong>Memória da New</strong>
                <span>Informações consideradas em outras conversas neste dispositivo.</span>
              </div>
              <button className="icon" onClick={() => setMemoryOpen(false)}>×</button>
            </header>

            <div className="memoryAdd">
              <textarea
                value={memoryDraft}
                placeholder="Ex.: Prefiro respostas objetivas e em português."
                onChange={e => setMemoryDraft(e.target.value)}
              />
              <button onClick={saveMemory}>Salvar</button>
            </div>

            <div className="memoryList">
              {!memory.length && <p>Nenhuma memória salva.</p>}
              {memory.map(item => (
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
