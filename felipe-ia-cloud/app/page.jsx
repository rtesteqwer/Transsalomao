'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const PROFILE_KEY = 'felipe_ia_cloud_profile_v1';
const CHAT_KEY = 'felipe_ia_cloud_chats_v2';
const MEMORY_KEY = 'felipe_ia_cloud_memory_v2';
const FEEDBACK_KEY = 'felipe_ia_cloud_feedback_v2';

function getProfileId() {
  try {
    let value = localStorage.getItem(PROFILE_KEY);
    if (!value) {
      value = 'profile_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(PROFILE_KEY, value);
    }
    return value;
  } catch {
    return 'local';
  }
}

function scopedKey(base, profileId) {
  return base + ':' + (profileId || 'local');
}

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function words(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9_]+/)
      .filter(w => w.length > 2)
  );
}

function rankRelevant(query, items, getter) {
  const q = words(query);
  return items
    .map(item => {
      const itemWords = words(getter(item));
      let score = 0;
      for (const token of q) if (itemWords.has(token)) score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((x, index) => x.score > 0 || index < 3)
    .slice(0, 8)
    .map(x => x.item);
}

function newChat(mode = 'assistant') {
  return {
    id: id(),
    title: mode === 'code' ? 'Novo Felipe Code' : 'Nova conversa',
    mode,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function shortTitle(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, 42) : 'Nova conversa';
}

async function readAttachment(file) {
  const max = 8 * 1024 * 1024;
  if (file.size > max) throw new Error(`${file.name}: máximo de 8 MB por arquivo.`);

  const base = { id: id(), name: file.name, type: file.type || 'application/octet-stream' };

  if (file.type.startsWith('image/') || file.type === 'application/pdf') {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
    return { ...base, dataUrl };
  }

  const text = (await file.text()).slice(0, 60000);
  return { ...base, text };
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [profileId, setProfileId] = useState('');
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [memory, setMemory] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [collectiveLearning, setCollectiveLearning] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const profile = getProfileId();
    const savedChats = loadJson(scopedKey(CHAT_KEY, profile), []);
    const initialChats = savedChats.length ? savedChats : [newChat()];
    setProfileId(profile);
    setChats(initialChats);
    setActiveId(initialChats[0].id);
    setMemory(loadJson(scopedKey(MEMORY_KEY, profile), []));
    setFeedback(loadJson(scopedKey(FEEDBACK_KEY, profile), []));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!profileId) return;
    const compactChats = chats.slice(0, 60).map(chat => ({
      ...chat,
      messages: chat.messages.map(message => ({
        ...message,
        images: Array.isArray(message.images)
          ? message.images.map(image => ({
              id: image.id,
              mediaType: image.mediaType,
              expired: true
            }))
          : undefined
      }))
    }));
    localStorage.setItem(scopedKey(CHAT_KEY, profileId), JSON.stringify(compactChats));
  }, [chats, ready, profileId]);

  useEffect(() => {
    if (!ready) return;
    if (!profileId) return;
    localStorage.setItem(scopedKey(MEMORY_KEY, profileId), JSON.stringify(memory.slice(0, 200)));
  }, [memory, ready, profileId]);

  useEffect(() => {
    if (!ready) return;
    if (!profileId) return;
    localStorage.setItem(scopedKey(FEEDBACK_KEY, profileId), JSON.stringify(feedback.slice(0, 200)));
  }, [feedback, ready, profileId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeId, chats, sending]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/learn', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        if (!cancelled && typeof data?.enabled === 'boolean') setCollectiveLearning(data.enabled);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const active = useMemo(
    () => chats.find(c => c.id === activeId) || chats[0],
    [chats, activeId]
  );

  function updateActive(updater) {
    setChats(prev =>
      prev.map(chat => {
        if (chat.id !== active?.id) return chat;
        const next = typeof updater === 'function' ? updater(chat) : { ...chat, ...updater };
        return { ...next, updatedAt: Date.now() };
      })
    );
  }

  function createChat(mode = 'assistant') {
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
    updateActive(chat => ({
      ...chat,
      mode,
      title:
        chat.messages.length === 0
          ? mode === 'code'
            ? 'Novo Felipe Code'
            : 'Nova conversa'
          : chat.title
    }));
  }

  async function onFiles(event) {
    const list = Array.from(event.target.files || []).slice(0, 4);
    event.target.value = '';
    if (!list.length) return;

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
      id: id(),
      role: 'user',
      content: text || 'Analise os arquivos anexados.',
      attachmentNames: attachments.map(a => a.name),
      createdAt: Date.now()
    };

    const outgoing = [...active.messages, userMessage].slice(-24);
    const relevantMemory = rankRelevant(
      userMessage.content,
      memory,
      item => item.text
    ).map(item => item.text);

    const relevantFeedback = rankRelevant(
      userMessage.content,
      feedback,
      item => `${item.question} ${item.correction}`
    );

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
          memory: relevantMemory,
          feedback: relevantFeedback,
          userId: profileId
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha na Felipe IA.');
      if (typeof data?.sharedLearning?.enabled === 'boolean') {
        setCollectiveLearning(data.sharedLearning.enabled);
      }

      const assistantMessage = {
        id: id(),
        role: 'assistant',
        content: data.text,
        images: Array.isArray(data.images) ? data.images : [],
        task: data.task,
        verified: Boolean(data.verified),
        corrected: Boolean(data.corrected),
        toolSteps: data.toolSteps || 0,
        createdAt: Date.now()
      };

      updateActive(chat => ({
        ...chat,
        messages: [...chat.messages, assistantMessage]
      }));
    } catch (e) {
      setError(e.message || 'Falha ao conectar com a Felipe IA.');
    } finally {
      setSending(false);
    }
  }

  function addMemory() {
    const text = memoryDraft.trim();
    if (!text) return;
    setMemory(prev => [{ id: id(), text, createdAt: Date.now() }, ...prev]);
    setMemoryDraft('');
  }

  function correctMessage(message, index) {
    const before = active?.messages?.slice(0, index).reverse().find(m => m.role === 'user');
    const correction = window.prompt('Qual seria a resposta correta ou a regra que a Felipe IA deve aprender?');
    if (!correction?.trim()) return;

    const item = {
      id: id(),
      question: before?.content || 'Contexto não identificado',
      wrong: message.content.slice(0, 3000),
      correction: correction.trim(),
      createdAt: Date.now()
    };
    setFeedback(prev => [item, ...prev]);

    setMemory(prev => [
      {
        id: id(),
        text: `Correção aprendida: quando o contexto for "${item.question}", considere esta orientação: ${item.correction}`,
        createdAt: Date.now()
      },
      ...prev
    ]);

    fetch('/api/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: item.question, correction: item.correction })
    })
      .then(response => response.json())
      .then(data => {
        if (typeof data?.enabled === 'boolean') setCollectiveLearning(data.enabled);
      })
      .catch(() => {});
  }

  function deleteChat(chatId) {
    setChats(prev => {
      const next = prev.filter(c => c.id !== chatId);
      const safe = next.length ? next : [newChat()];
      if (chatId === activeId) setActiveId(safe[0].id);
      return safe;
    });
  }

  if (!ready || !active) {
    return <main className="loading">Carregando Felipe IA…</main>;
  }

  return (
    <main className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sideTop">
          <div className="brand">
            <div className="brandMark">F</div>
            <div>
              <strong>Felipe IA</strong>
              <span>Cloud</span>
            </div>
          </div>
          <button className="iconBtn mobileOnly" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <button className="newChat" onClick={() => createChat(active.mode)}>＋ Nova conversa</button>

        <div className="chatList">
          {chats
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(chat => (
              <div key={chat.id} className={`chatRow ${chat.id === active.id ? 'active' : ''}`}>
                <button
                  className="chatSelect"
                  onClick={() => {
                    setActiveId(chat.id);
                    setSidebarOpen(false);
                  }}
                >
                  <span>{chat.mode === 'code' ? '⌘' : '◉'}</span>
                  <span>{chat.title}</span>
                </button>
                <button className="deleteChat" onClick={() => deleteChat(chat.id)}>×</button>
              </div>
            ))}
        </div>

        <div className="sideBottom">
          <button className="sideAction" onClick={() => { window.location.href = '/plugins'; }}>
            🔌 Plugins <span>5</span>
          </button>
          <button className="sideAction" onClick={() => setMemoryOpen(true)}>
            🧠 Memória <span>{memory.length}</span>
          </button>
          <div className="cloudStatus"><i /> Sem Ubuntu • Nuvem</div>
        </div>
      </aside>

      {sidebarOpen && <button className="overlay" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}

      <section className="workspace">
        <header className="topbar">
          <button className="iconBtn mobileOnly" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="topTitle">
            <strong>{active.mode === 'code' ? 'Felipe Code' : 'Felipe IA'}</strong>
            <span>{active.mode === 'code' ? 'Execução + testes em sandbox' : 'Roteamento automático • imagens • visão • PDF • código'}</span>
          </div>
          <div className="modeSwitch">
            <button className={active.mode === 'assistant' ? 'selected' : ''} onClick={() => setMode('assistant')}>Auto</button>
            <button className={active.mode === 'code' ? 'selected' : ''} onClick={() => setMode('code')}>Code</button>
          </div>
        </header>

        <div className="messages">
          {active.messages.length === 0 && (
            <div className="hero">
              <div className="heroMark">F</div>
              <h1>{active.mode === 'code' ? 'Felipe Code' : 'Felipe IA'}</h1>
              <p>
                {active.mode === 'code'
                  ? 'Programação com execução e testes em sandbox isolado na nuvem.'
                  : 'Assistente em nuvem com roteamento automático, memória pessoal, criação e leitura de imagens, PDFs e código.'}
              </p>
              <div className="suggestions">
                {(active.mode === 'code'
                  ? ['Crie uma função e teste', 'Analise este erro', 'Refatore este código']
                  : ['Crie uma imagem para mim', 'Analise este PDF', 'Leia esta foto', 'Me ajude a planejar algo'])
                  .map(item => (
                    <button key={item} onClick={() => setInput(item)}>{item}</button>
                  ))}
              </div>
            </div>
          )}

          {active.messages.map((message, index) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="avatar">{message.role === 'user' ? 'V' : 'F'}</div>
              <div className="bubble">
                <div className="messageMeta">
                  <strong>{message.role === 'user' ? 'Você' : active.mode === 'code' ? 'Felipe Code' : 'Felipe IA'}</strong>
                  {message.task && <span>{message.task.toLowerCase()}</span>}
                  {message.verified && <span>verificado</span>}
                  {message.corrected && <span>revisado</span>}
                </div>
                <div className="messageText">{message.content}</div>
                {!!message.images?.filter(image => image?.dataUrl).length && (
                  <div className="generatedImages">
                    {message.images
                      .filter(image => image?.dataUrl)
                      .map((image, imageIndex) => (
                        <a
                          className="generatedImageLink"
                          href={image.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          key={image.id || imageIndex}
                        >
                          <img
                            className="generatedImage"
                            src={image.dataUrl}
                            alt={`Imagem gerada pela Felipe IA ${imageIndex + 1}`}
                          />
                        </a>
                      ))}
                  </div>
                )}
                {!!message.images?.some(image => image?.expired) && !message.images?.some(image => image?.dataUrl) && (
                  <div className="generatedImageExpired">A imagem desta conversa não fica salva após recarregar a página.</div>
                )}
                {!!message.attachmentNames?.length && (
                  <div className="attachmentLine">📎 {message.attachmentNames.join(' • ')}</div>
                )}
                {message.role === 'assistant' && (
                  <div className="messageActions">
                    <button onClick={() => navigator.clipboard?.writeText(message.content)}>Copiar</button>
                    <button onClick={() => correctMessage(message, index)}>Corrigir / ensinar</button>
                    {message.toolSteps > 0 && <span>{message.toolSteps} etapas verificadas</span>}
                  </div>
                )}
              </div>
            </article>
          ))}

          {sending && (
            <article className="message assistant">
              <div className="avatar">F</div>
              <div className="bubble thinking">
                <span />
                <span />
                <span />
              </div>
            </article>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="composerWrap">
          {error && <div className="errorBox">{error}</div>}

          {!!attachments.length && (
            <div className="attachmentTray">
              {attachments.map(file => (
                <div className="attachmentChip" key={file.id}>
                  <span>📎 {file.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter(x => x.id !== file.id))}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="composer">
            <button className="attachBtn" onClick={() => fileRef.current?.click()} title="Anexar arquivo">＋</button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*,application/pdf,text/*,.md,.json,.csv"
              onChange={onFiles}
            />
            <textarea
              value={input}
              rows={1}
              placeholder={active.mode === 'code' ? 'Peça para programar, testar ou depurar…' : 'Mensagem para Felipe IA…'}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="sendBtn" onClick={send} disabled={sending || (!input.trim() && !attachments.length)}>
              ↑
            </button>
          </div>
          <div className="composerHint">
            {active.mode === 'code'
              ? 'Código é executado em sandbox isolado, não no seu computador.'
              : collectiveLearning === true
                ? 'Aprendizado coletivo ativo • aprende com interações e correções de todos os usuários.'
                : collectiveLearning === false
                  ? 'Memória local ativa • aprendizado coletivo aguardando armazenamento compartilhado.'
                  : 'Memória pessoal + aprendizado coletivo.'}
          </div>
        </div>
      </section>

      {memoryOpen && (
        <div className="modalBackdrop" onClick={() => setMemoryOpen(false)}>
          <section className="memoryPanel" onClick={e => e.stopPropagation()}>
            <header>
              <div>
                <strong>Memória da Felipe IA</strong>
                <span>Memória pessoal + aprendizado coletivo da Felipe IA</span>
              </div>
              <button className="iconBtn" onClick={() => setMemoryOpen(false)}>✕</button>
            </header>

            <div className="memoryAdd">
              <textarea
                value={memoryDraft}
                placeholder="Ex.: Prefiro respostas curtas e código completo quando eu pedir para programar."
                onChange={e => setMemoryDraft(e.target.value)}
              />
              <button onClick={addMemory}>Salvar memória</button>
            </div>

            <div className="memoryList">
              {memory.length === 0 && <p>Nenhuma memória salva ainda.</p>}
              {memory.map(item => (
                <div key={item.id} className="memoryItem">
                  <span>{item.text}</span>
                  <button onClick={() => setMemory(prev => prev.filter(x => x.id !== item.id))}>Excluir</button>
                </div>
              ))}
            </div>

            {feedback.length > 0 && (
              <div className="feedbackInfo">
                <strong>{feedback.length} correções aprendidas</strong>
                <button onClick={() => {
                  if (window.confirm('Apagar todas as correções aprendidas?')) setFeedback([]);
                }}>Limpar correções</button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
