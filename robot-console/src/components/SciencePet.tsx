import { AnimatePresence, motion } from 'motion/react';
import { Send, Sparkles, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState, type CSSProperties } from 'react';
import Markdown from 'react-markdown';

interface PetMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

type PetMode = 'idle' | 'thinking' | 'happy';

const MODE_ROW: Record<PetMode, number> = { idle: 0, thinking: 7, happy: 8 };
const MODE_FRAMES: Record<PetMode, number> = { idle: 8, thinking: 6, happy: 6 };

function parseEventBlock(block: string) {
  const dataLine = block
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice(5)
    .trim();
  if (!dataLine || dataLine === '[DONE]') return null;
  try {
    return JSON.parse(dataLine) as { type: string; content?: string; error?: string; userId?: string };
  } catch {
    return null;
  }
}

export function SciencePet() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<PetMessage[]>([
    { id: 1, role: 'assistant', text: '你好，我是科小贝。想找科学诗、实验教案或亲子玩法，都可以问我。' },
  ]);
  const [mode, setMode] = useState<PetMode>('idle');
  const [frame, setFrame] = useState(0);
  const userIdRef = useRef(`pet_${Math.random().toString(36).slice(2, 10)}`);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = mode === 'thinking';

  useEffect(() => {
    setFrame(0);
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % MODE_FRAMES[mode]),
      mode === 'idle' ? 180 : 140,
    );
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const updateAssistant = (id: number, updater: (text: string) => string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, text: updater(message.text) } : message,
      ),
    );
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;

    const stamp = Date.now();
    const assistantId = stamp + 1;
    setMessages((current) => [
      ...current,
      { id: stamp, role: 'user', text: prompt },
      { id: assistantId, role: 'assistant', text: '' },
    ]);
    setInput('');
    setMode('thinking');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, userId: userIdRef.current }),
      });
      if (!response.ok || !response.body) throw new Error('服务暂时不可用');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const payload = parseEventBlock(block);
          if (!payload) continue;
          if (payload.userId) userIdRef.current = payload.userId;
          if (payload.type === 'chunk' && payload.content) {
            updateAssistant(assistantId, (text) => text + payload.content);
          }
          if (payload.type === 'replace' && payload.content) {
            updateAssistant(assistantId, () => payload.content ?? '');
          }
          if (payload.type === 'error') throw new Error(payload.error || '回答失败');
        }
      }
      setMode('happy');
      window.setTimeout(() => setMode('idle'), 1500);
    } catch {
      updateAssistant(assistantId, () => '我现在没有连上知识服务，请稍后再问一次。');
      setMode('idle');
    }
  };

  const row = MODE_ROW[mode];
  const spriteStyle = {
    '--pet-x': `${(frame / 7) * 100}%`,
    '--pet-y': `${(row / 10) * 100}%`,
  } as CSSProperties;

  return (
    <div className={`science-pet${open ? ' is-open' : ''}`}>
      <AnimatePresence>
        {open && (
          <motion.section
            className="pet-chat"
            aria-label="科小贝智能助手"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <header className="pet-chat__header">
              <span><Sparkles size={16} /> 科小贝</span>
              <button type="button" onClick={() => setOpen(false)} title="关闭对话">
                <X size={17} />
              </button>
            </header>
            <div ref={scrollRef} className="pet-chat__messages" aria-live="polite">
              {messages.slice(-6).map((message) => (
                <div key={message.id} className={`pet-message pet-message--${message.role}`}>
                  {message.role === 'assistant' ? (
                    message.text ? <Markdown>{message.text}</Markdown> : <span className="typing-dots"><i /><i /><i /></span>
                  ) : (
                    message.text
                  )}
                </div>
              ))}
            </div>
            <form className="pet-chat__form" onSubmit={sendMessage}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="问问科小贝…"
                aria-label="向科小贝提问"
                disabled={busy}
              />
              <button type="submit" disabled={!input.trim() || busy} title="发送">
                <Send size={17} />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        type="button"
        className="science-pet__button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? '收起科小贝' : '问问科小贝'}
        title="问问科小贝"
      >
        <span className="science-pet__sprite" style={spriteStyle} role="img" aria-label="科小贝智能助手" />
      </button>
    </div>
  );
}
