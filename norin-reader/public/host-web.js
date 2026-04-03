(() => {
  const META = (name) => {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') || '' : '';
  };

  function isLoopbackHost(h) {
    if (!h) return false;
    const host = String(h).toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  function parseHost(u) {
    try { return new URL(u).hostname; } catch (e) { return ''; }
  }

  const metaOriginRaw = META('server-origin').trim();
  let SERVER_ORIGIN = (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:80');
  if (metaOriginRaw) {
    const metaHost = parseHost(metaOriginRaw);
    const pageHost = (typeof window !== 'undefined') ? window.location.hostname : '';
    // Only honor metaOrigin when it's not loopback, or when the page itself is loaded from loopback
    if (!isLoopbackHost(metaHost) || isLoopbackHost(pageHost)) {
      SERVER_ORIGIN = metaOriginRaw;
    }
  }
  const API = {
    async uploadText(name, text) {
      const form = new FormData();
      const blob = new Blob([text], { type: 'text/plain' });
      form.append('file', blob, name || 'document.txt');
      const r = await fetch(`${SERVER_ORIGIN}/api/upload`, { method: 'POST', body: form });
      if (!r.ok) throw new Error(`upload failed: ${r.status}`);
      return r.json();
    },
    async fetchById(id) {
      const r = await fetch(`${SERVER_ORIGIN}/api/file/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error('not found');
      return r.text();
    },
    async listFiles(order = 'opened', opts = {}) {
      const params = new URLSearchParams();
      if (order) params.set('order', String(order));
      if (opts && opts.dedupe) params.set('dedupe', String(opts.dedupe));
      const r = await fetch(`${SERVER_ORIGIN}/api/files?${params.toString()}`);
      if (!r.ok) throw new Error('list failed');
      return r.json();
    },
    async markOpened(id) {
      const r = await fetch(`${SERVER_ORIGIN}/api/open/${encodeURIComponent(id)}`, { method: 'POST' });
      if (!r.ok) throw new Error('mark failed');
      return r.json();
    },
    async chat(message, options = {}) {
      const r = await fetch(`${SERVER_ORIGIN}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: String(message || ''), history: Array.isArray(options.history) ? options.history : undefined })
      });
      if (!r.ok) throw new Error(`chat failed: ${r.status}`);
      return r.json(); // { text, modelId?, modelDisplayName? }
    },
    async chatStream(message, onChunk, options = {}) {
      const ctrl = options.signal ? null : new AbortController();
      const signal = options.signal || (ctrl && ctrl.signal);
      const r = await fetch(`${SERVER_ORIGIN}/api/v1/chat?stream=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: String(message || ''), history: Array.isArray(options.history) ? options.history : undefined }),
        signal
      });
      if (!r.ok || !r.body) throw new Error(`chat stream failed: ${r.status}`);
      const modelId = r.headers.get('x-model-id') || '';
      const modelName = r.headers.get('x-model-name') || modelId;
      try { typeof onChunk === 'function' && onChunk('', '', { modelId, modelName, start: true }); } catch (_) {}
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          full += chunk;
          try { typeof onChunk === 'function' && onChunk(chunk, full, { modelId, modelName }); } catch (_) {}
        }
      }
      // flush
      try { typeof onChunk === 'function' && onChunk('', full, { modelId, modelName, end: true }); } catch (_) {}
      return { text: full, modelId, modelName, controller: ctrl };
    },
    async getChatModelInfo() {
      if (API.__modelInfo) return API.__modelInfo;
      try {
        const r = await fetch(`${SERVER_ORIGIN}/api/v1/chat/model`);
        if (r.ok) {
          const j = await r.json();
          API.__modelInfo = j;
          return j;
        }
      } catch (e) {}
      return { id: '', displayName: '' };
    }
  };

  // Expose API globally so other scripts (renderer.js) can consume it
  if (typeof window !== 'undefined') {
    window.NorinAPI = API;
  }

  function createFilePicker(accept = '.txt,.md,.json,.html,.csv') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
  }

  function ensureReaderAPI() {
    const hasElectronAPI = typeof window.readerAPI === 'object' && window.readerAPI;

    if (hasElectronAPI) {
      const base = window.readerAPI;
      window.readerAPI = {
        async openFile() {
          const res = await base.openFile();
          if (res && !res.canceled && !res.error && res.content) {
            try {
              const uploaded = await API.uploadText((res.filePath || 'document.txt').split(/[/\\]/).pop(), res.content);
              return { canceled: false, id: uploaded.id, name: uploaded.name, content: uploaded.content };
            } catch (e) {
              return { canceled: false, error: e.message };
            }
          }
          return res;
        },
        async openById(id) {
          try {
            const text = await API.fetchById(id);
            return { canceled: false, id, name: `#${id}`, content: text };
          } catch (e) {
            return { canceled: false, error: e.message };
          }
        },
        exportPdf: async () => ({ canceled: false, ok: (window.print(), true) }),
        // keep for compatibility; not supported in server-first model
        openFileByPath: async () => ({ canceled: true, error: 'not supported' }),
        openPhoneticMap: base.openPhoneticMap ? base.openPhoneticMap : async () => ({ canceled: true })
      };
      return;
    }

    // Pure web
    window.readerAPI = {
      async openFile() {
        return new Promise((resolve) => {
          const input = createFilePicker();
          input.onchange = async () => {
            try {
              const file = input.files && input.files[0];
              if (!file) return resolve({ canceled: true });
              const text = await file.text();
              const uploaded = await API.uploadText(file.name, text);
              resolve({ canceled: false, id: uploaded.id, name: uploaded.name, content: uploaded.content });
            } catch (e) {
              resolve({ canceled: false, error: e.message });
            } finally {
              input.remove();
            }
          };
          input.click();
        });
      },
      async openById(id) {
        try {
          const text = await API.fetchById(id);
          return { canceled: false, id, name: `#${id}`, content: text };
        } catch (e) {
          return { canceled: false, error: e.message };
        }
      },
      exportPdf: async () => ({ canceled: false, ok: (window.print(), true) }),
      openFileByPath: async () => ({ canceled: true, error: 'not supported' }),
      openPhoneticMap: async () => ({ canceled: true })
    };
  }

  ensureReaderAPI();
})();
