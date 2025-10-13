// Autotune - Parameter optimization
// Handles autotune status and configuration
;(function() {
  'use strict';

  // Get shared utilities
  const api = window.CoreUtils?.api || ((p) => `/api${p}`);
  const $ = window.CoreUtils?.$ || ((s) => document.querySelector(s));

  // Refresh autotune status
  async function refreshAutotune() {
    try {
      const r = await fetch(api('/api/autotune/status'));
      if (!r.ok) {
        if (r.status === 403 || r.status === 402) {
          const modeEl = $('#autotune-mode');
          if (modeEl) modeEl.textContent = 'Pro required (set Edition to pro)';
        } else {
          const modeEl = $('#autotune-mode');
          if (modeEl) modeEl.textContent = '—';
        }
        const enabledEl = $('#autotune-enabled');
        if (enabledEl) enabledEl.checked = false;
        return;
      }

      const d = await r.json();
      const enabledEl = $('#autotune-enabled');
      const modeEl = $('#autotune-mode');

      if (enabledEl) enabledEl.checked = !!d.enabled;
      if (modeEl) modeEl.textContent = d.current_mode || '—';
    } catch (e) {
      const modeEl = $('#autotune-mode');
      if (modeEl) modeEl.textContent = '—';
      console.error('[Autotune] Refresh failed:', e);
    }
  }

  // Export public API
  window.Autotune = {
    refreshAutotune
  };

  console.log('[Autotune] Loaded');
})();
