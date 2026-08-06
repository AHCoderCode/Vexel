// script.js
const chatContainer = document.getElementById('chatContainer');
const messagesEl = document.getElementById('messages');
const emptyState = document.getElementById('emptyState');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');

let messages = []; // { role: 'user' | 'assistant', content: '...', sources?: [...] }
let isLoading = false;

// ---------- Helpers ----------
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Simple markdown-like → HTML conversion (bold, italics, bullet lists)
function formatContent(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // italic *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // bullet points (lines starting with - or *)
  const lines = html.split('\n');
  let inList = false;
  const result = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (/^[-*] /.test(trimmed)) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      const item = trimmed.replace(/^[-*] /, '');
      result.push(`<li>${item}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(trimmed === '' ? '<br>' : trimmed);
    }
  }
  if (inList) result.push('</ul>');
  return result.join('\n');
}

// Add source citations as clickable spans
function processCitations(html, sources) {
  if (!sources || sources.length === 0) return html;
  // Replace [1], [2] etc. with <sup class="source-cite" data-source-index="0">[1]</sup>
  return html.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (idx >= 0 && idx < sources.length) {
      return `<sup class="source-cite" data-source-index="${idx}">[${num}]</sup>`;
    }
    return match;
  });
}

function renderMessages() {
  messagesEl.innerHTML = '';
  if (messages.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  messages.forEach((msg, index) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.role}`;

    if (msg.role === 'user') {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.innerHTML = formatContent(msg.content);
      msgDiv.appendChild(contentDiv);
    } else {
      // assistant
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      let html = formatContent(msg.content);
      html = processCitations(html, msg.sources || []);
      contentDiv.innerHTML = html;
      msgDiv.appendChild(contentDiv);

      if (msg.sources && msg.sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'sources';
        msg.sources.forEach((src, i) => {
          const card = document.createElement('div');
          card.className = 'source-card';
          card.id = `source-${i}`;
          card.innerHTML = `
            <a class="source-title" href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(src.title)}</a>
            <span class="source-domain">${escapeHtml(new URL(src.url).hostname)}</span>
            <p class="source-snippet">${escapeHtml(src.snippet || '')}</p>
          `;
          sourcesDiv.appendChild(card);
        });
        msgDiv.appendChild(sourcesDiv);
      }
    }
    messagesEl.appendChild(msgDiv);
  });

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Set up citation click listeners (delegated)
messagesEl.addEventListener('click', (e) => {
  const cite = e.target.closest('.source-cite');
  if (cite) {
    const idx = cite.dataset.sourceIndex;
    const el = document.getElementById(`source-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
});

// ---------- API Call ----------
async function sendMessage(query) {
  if (isLoading || !query.trim()) return;
  isLoading = true;
  sendBtn.disabled = true;

  // Add user message
  messages.push({ role: 'user', content: query });
  renderMessages();

  // Loading indicator
  const loadingId = 'loading-msg';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message assistant';
  loadingDiv.id = loadingId;
  loadingDiv.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(loadingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Something went wrong');
    }

    const data = await res.json();
    // Remove loading
    const loadEl = document.getElementById(loadingId);
    if (loadEl) loadEl.remove();

    messages.push({
      role: 'assistant',
      content: data.answer,
      sources: data.sources || [],
      confidence: data.confidence
    });
  } catch (error) {
    const loadEl = document.getElementById(loadingId);
    if (loadEl) loadEl.remove();
    messages.push({
      role: 'assistant',
      content: `⚠️ ${error.message}`,
      sources: []
    });
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    renderMessages();
    userInput.focus();
  }
}

// ---------- Event Listeners ----------
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (isLoading || !userInput.value.trim()) return;
    sendMessage(userInput.value.trim());
    userInput.value = '';
    userInput.style.height = 'auto';
  }
});

userInput.addEventListener('input', () => {
  sendBtn.disabled = isLoading || !userInput.value.trim();
  // Auto-resize textarea
  userInput.style.height = 'auto';
  userInput.style.height = userInput.scrollHeight + 'px';
});

sendBtn.addEventListener('click', () => {
  if (isLoading || !userInput.value.trim()) return;
  sendMessage(userInput.value.trim());
  userInput.value = '';
  userInput.style.height = 'auto';
});

newChatBtn.addEventListener('click', () => {
  messages = [];
  renderMessages();
});

// Example prompts
document.querySelectorAll('.example-card').forEach(card => {
  card.addEventListener('click', () => {
    const prompt = card.dataset.prompt;
    userInput.value = prompt;
    userInput.dispatchEvent(new Event('input'));
    sendMessage(prompt);
  });
});

// Mobile sidebar toggle
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 &&
      !sidebar.contains(e.target) &&
      !menuToggle.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

// Initial render
renderMessages();
