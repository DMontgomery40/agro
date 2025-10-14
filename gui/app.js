// AGRO GUI app.js (main coordinator - modularized)
(function () {
    'use strict';

    // Import core utilities from CoreUtils module
    const { api, $, $$, state } = window.CoreUtils || {};

    if (!api || !$ || !$$) {
        console.error('[app.js] CoreUtils not loaded! Make sure core-utils.js loads first.');
        return;
    }

    console.log('[app.js] Initializing with API:', window.CoreUtils.API_BASE);

    // ---------------- Theme Engine ----------------
    // Delegated to Theme module (gui/js/theme.js)
    const resolveTheme = window.Theme?.resolveTheme || (() => 'dark');
    const applyTheme = window.Theme?.applyTheme || (() => {});
    const initThemeFromEnv = window.Theme?.initThemeFromEnv || (() => {});

    // ---------------- Tabs ----------------
    // Delegated to Tabs module (gui/js/tabs.js)
    const switchTab = window.Tabs?.switchTab || (() => {});
    const bindTabs = window.Tabs?.bindTabs || (() => {});
    const bindSubtabs = window.Tabs?.bindSubtabs || (() => {});

    // ---------------- Tooltips (modular) ----------------
    // Delegates to external module /gui/js/tooltips.js

    // ---------------- Global Search ----------------
    // Delegated to Search module (gui/js/search.js)
    const clearHighlights = window.Search?.clearHighlights || (() => {});
    const highlightMatches = window.Search?.highlightMatches || (() => {});
    const bindGlobalSearch = window.Search?.bindGlobalSearch || (() => {});

    // ---------------- Git Hooks ----------------
    // Delegated to GitHooks module (gui/js/git-hooks.js)
    const refreshHooksStatus = window.GitHooks?.refreshHooksStatus || (async () => {});
    const installHooks = window.GitHooks?.installHooks || (async () => {});

    // ---------------- Health ----------------
    // Delegated to Health module (gui/js/health.js)
    const checkHealth = window.Health?.checkHealth || (async () => {});

    // ---------------- Routing Trace Panel ----------------
    function _fmtTable(rows, headers){
        const cols = headers.length;
        const widths = new Array(cols).fill(0);
        const all = [headers].concat(rows);
        all.forEach(r => r.forEach((c,i)=>{ widths[i] = Math.max(widths[i], String(c||'').length); }));
        const line = (r)=> r.map((c,i)=> String(c||'').padEnd(widths[i])).join('  ');
        return ['```', line(headers), line(widths.map(w=>'-'.repeat(w))), ...rows.map(line), '```'].join('\n');
    }

    async function loadLatestTrace(targetId='trace-output'){
        try{
            const repoSel = document.querySelector('select[name="REPO"]');
            const repo = repoSel && repoSel.value ? `?repo=${encodeURIComponent(repoSel.value)}` : '';
            const r = await fetch(api(`/api/traces/latest${repo}`));
            const d = await r.json();
            const el = document.getElementById(targetId);
            if (!el) return;
            if (!d || !d.trace){ el.textContent = 'No traces yet. Enable LangChain Tracing V2 in Misc and run a query via /answer.'; return; }
            const t = d.trace;
            const decide = (t.events||[]).find(ev=>ev.kind==='router.decide');
            const rer = (t.events||[]).find(ev=>ev.kind==='reranker.rank');
            const gate = (t.events||[]).find(ev=>ev.kind==='gating.outcome');
            const header = [];
            header.push(`Policy: ${(decide?.data?.policy)||'—'}`);
            header.push(`Intent: ${(decide?.data?.intent)||'—'}`);
            header.push(`Final K: ${(rer?.data?.output_topK)||'—'}`);
            header.push(`Vector: ${((d && d.repo) ? (document.querySelector('[name="VECTOR_BACKEND"]').value||'qdrant'):'qdrant')}`);

            const parts = [];
            parts.push(header.join('  •  '));
            parts.push('');
            // Candidates
            const pre = (t.events||[]).find(ev=>ev.kind==='retriever.retrieve');
            if (pre && Array.isArray(pre.data?.candidates)){
                const rows = pre.data.candidates.slice(0,10).map(c=>[
                    (c.path||'').split('/').slice(-2).join('/'), c.bm25_rank||'', c.dense_rank||''
                ]);
                parts.push('Pre‑rerank candidates (top 10):');
                parts.push(_fmtTable(rows, ['path','bm25','dense']));
                parts.push('');
            }
            // Rerank results
            if (rer && Array.isArray(rer.data?.scores)){
                const rows = rer.data.scores.slice(0,10).map(s=>[
                    (s.path||'').split('/').slice(-2).join('/'), (s.rerank_score!=null? Number(s.rerank_score).toFixed(3):'' )
                ]);
                parts.push('Post‑rerank (top 10):');
                parts.push(_fmtTable(rows, ['path','score']));
                parts.push('');
            }
            // Event list
            parts.push('Events:');
            for (const ev of (t.events||[])){
                parts.push(`- ${ev.ts || ''} • ${ev.kind}`);
            }
            el.textContent = parts.join('\n');
        }catch(e){ const el=$('#trace-output'); if(el) el.textContent = 'Failed to load trace: '+e.message; }
    }

    // ---------------- Chat ----------------
    function appendChatMessage(role, text){
        const box = document.getElementById('chat-messages'); if (!box) return;
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '12px';
        const who = document.createElement('div');
        who.style.fontSize = '11px';
        who.style.color = role === 'user' ? '#5b9dff' : '#00ff88';
        who.style.textTransform = 'uppercase';
        who.style.letterSpacing = '0.5px';
        who.textContent = role === 'user' ? 'You' : 'Assistant';
        const msg = document.createElement('div');
        msg.style.background = '#0f0f0f';
        msg.style.border = '1px solid #2a2a2a';
        msg.style.borderRadius = '6px';
        msg.style.padding = '10px';
        msg.style.whiteSpace = 'pre-wrap';
        msg.textContent = text;
        wrap.appendChild(who); wrap.appendChild(msg);
        box.appendChild(wrap);
        // auto-scroll if near bottom
        try { box.scrollTop = box.scrollHeight; } catch {}
    }

    async function sendChat(){
        const ta = document.getElementById('chat-input'); if (!ta) return;
        const q = (ta.value || '').trim(); if (!q) return;
        appendChatMessage('user', q);
        ta.value = '';
        const repoSel = document.getElementById('chat-repo-select');
        const repo = repoSel && repoSel.value ? repoSel.value : undefined;
        try{
            const qs = new URLSearchParams({ q });
            if (repo) qs.set('repo', repo);
            const r = await fetch(api(`/answer?${qs.toString()}`));
            const d = await r.json();
            const text = (d && d.answer) ? d.answer : '—';
            appendChatMessage('assistant', text);
            // load trace if the dropdown is open
            const det = document.getElementById('chat-trace');
            if (det && det.open){ await loadLatestTrace('chat-trace-output'); }
            // optional auto-open in LangSmith (use latest shared run URL)
            try{
                const env = (state.config?.env)||{};
                if ((env.TRACING_MODE||'').toLowerCase()==='langsmith' && ['1','true','on'].includes(String(env.TRACE_AUTO_LS||'0').toLowerCase())){
                    const prj = (env.LANGCHAIN_PROJECT||'agro');
                    const qs = new URLSearchParams({ project: prj, share: 'true' });
                    const r = await fetch(api(`/api/langsmith/latest?${qs.toString()}`));
                    const d = await r.json();
                    if (d && d.url) window.open(d.url, '_blank');
                }
            }catch{}
        }catch(e){ appendChatMessage('assistant', `Error: ${e.message}`); }
    }

    // ---------------- Config ----------------
    // Delegated to Config module (gui/js/config.js)
    const loadConfig = window.Config?.loadConfig || (async () => {});
    const populateConfigForm = window.Config?.populateConfigForm || (() => {});
    const gatherConfigForm = window.Config?.gatherConfigForm || (() => ({}));
    const saveConfig = window.Config?.saveConfig || (async () => {});


    // ---------------- Prices & Cost ----------------
    async function loadPrices() {
        try {
            const r = await fetch(api('/api/prices'));
            state.prices = await r.json();
            populatePriceDatalists();
        } catch (e) {
            console.error('Failed to load prices:', e);
        }
    }

    function unique(xs) { return Array.from(new Set(xs)); }

    function populatePriceDatalists() {
        if (!state.prices || !Array.isArray(state.prices.models)) return;

        const models = state.prices.models;
        const providers = unique(models.map(m => (m.provider || '').trim()).filter(Boolean));
        const allModels = unique(models.map(m => (m.model || '').trim()).filter(Boolean));

        const providerSelect = document.getElementById('cost-provider');
        const modelList = document.getElementById('model-list');
        const genList = document.getElementById('gen-model-list');
        const rrList = document.getElementById('rerank-model-list');
        const embList = document.getElementById('embed-model-list');

        function setOpts(el, vals) {
            if (!el) return;
            el.innerHTML = '';
            vals.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                if (el.tagName === 'SELECT') opt.textContent = v;
                el.appendChild(opt);
            });
        }

        if (providerSelect && providerSelect.tagName === 'SELECT') {
            // refill provider select only if empty, preserve user choice
            if (providerSelect.options.length <= 1) setOpts(providerSelect, providers);
        }

        // Partition models into categories for filtering
        // Inference models: unit == '1k_tokens' and no embed/rerank fields (cost may be 0 for local)
        const isGen = (m)=> {
            const u = String(m.unit || '').toLowerCase();
            const hasEmbed = Object.prototype.hasOwnProperty.call(m, 'embed_per_1k');
            const hasRerank = Object.prototype.hasOwnProperty.call(m, 'rerank_per_1k');
            return u === '1k_tokens' && !hasEmbed && !hasRerank;
        };
        const isEmbed = (m)=> Object.prototype.hasOwnProperty.call(m, 'embed_per_1k');
        const isRerank = (m)=> Object.prototype.hasOwnProperty.call(m, 'rerank_per_1k') || /rerank/i.test(String(m.family||'')+String(m.model||''));
        const genModels = unique(models.filter(isGen).map(m => m.model));
        const rrModels = unique(models.filter(isRerank).map(m => m.model));
        const embModels = unique(models.filter(isEmbed).map(m => m.model));

        // Populate datalists with null checks
        if (modelList) setOpts(modelList, allModels);
        if (genList) setOpts(genList, genModels);
        if (rrList) setOpts(rrList, rrModels);
        if (embList) setOpts(embList, embModels);

        // Default provider only; leave model empty so datalist shows all options on first focus
        if (!$('#cost-provider').value && providers.length) $('#cost-provider').value = providers[0];
        if (!$('#cost-model').value) $('#cost-model').value = '';

        // Filter model options when provider changes AND update the input value
        const onProv = () => {
            const modelInput = $('#cost-model');
            if (!modelInput || !modelList) return;

            const p = $('#cost-provider').value.trim().toLowerCase();
            const provModels = unique(models.filter(m => (m.provider||'').toLowerCase()===p && isGen(m)).map(m => m.model));
            if (!provModels.length) {
                // Fall back to all inference models so the dropdown is still usable
                const allGen = unique(models.filter(isGen).map(m => m.model));
                if (modelList) setOpts(modelList, allGen);
                modelInput.value = '';
                try { showStatus(`No inference models for provider "${p}" — showing all models.`, 'warn'); } catch {}
                return;
            }
            if (modelList) setOpts(modelList, provModels);
            // If current value isn't a model for this provider, clear so the datalist shows all options
            if (!provModels.includes(modelInput.value)) {
                modelInput.value = '';
            }
        };

        if (providerSelect) providerSelect.addEventListener('change', onProv);
        onProv(); // Initialize

        // ---- Provider-specific filtering for Embeddings and Reranker ----
        function normProvList(sel, kind){
            const p = String(sel||'').toLowerCase();
            if (p === 'mxbai') return ['huggingface'];
            if (p === 'hugging face') return ['huggingface'];
            if (p === 'local'){
                // For local: embeddings prefer local/ollama; rerank prefer huggingface/local
                return (kind==='embed') ? ['local','ollama'] : ['huggingface','local','ollama','mlx'];
            }
            return [p];
        }
        function updateEmbedList(){
            const sel = document.getElementById('cost-embed-provider');
            const input = document.getElementById('cost-embed-model');
            if (!sel || !embList) return;
            const prov = String(sel.value||'').toLowerCase();
            const prows = normProvList(prov, 'embed');
            let items = models.filter(m => isEmbed(m) && prows.includes(String(m.provider||'').toLowerCase())).map(m => m.model);
            // If provider is mxbai, prefer Mixedbread embeddings; if none present, include all HF embeddings
            if (prov === 'mxbai') {
                const mb = items.filter(s => /mixedbread/i.test(s));
                items = mb.length ? mb : models.filter(m => isEmbed(m) && String(m.provider||'').toLowerCase()==='huggingface').map(m => m.model);
            }
            if (!items.length) items = unique(models.filter(isEmbed).map(m => m.model));
            if (embList) setOpts(embList, unique(items));
            if (input && items.length && !items.includes(input.value)) input.value = '';
        }
        function normProviderName(p){
            p = String(p||'').toLowerCase();
            if (p === 'hf' || p === 'hugging face') return 'huggingface';
            return p;
        }
        function updateRerankList(){
            const sel = document.getElementById('cost-rerank-provider');
            const input = document.getElementById('cost-rerank-model');
            if (!sel || !rrList) return;
            const p = normProviderName(sel.value||'');
            let items;
            if (!p) {
                items = models.filter(isRerank).map(m => m.model);
            } else if (p === 'cohere') {
                items = models.filter(m => isRerank(m) && String(m.provider||'').toLowerCase()==='cohere').map(m => m.model);
            } else if (p === 'huggingface') {
                items = models.filter(m => isRerank(m) && String(m.provider||'').toLowerCase()==='huggingface').map(m => m.model);
            } else if (p === 'local') {
                // Prefer HF rerankers for local
                items = models.filter(m => isRerank(m) && (String(m.provider||'').toLowerCase()==='huggingface' || String(m.provider||'').toLowerCase()==='local' || String(m.provider||'').toLowerCase()==='ollama')).map(m => m.model);
            } else if (p === 'none') {
                items = [];
            } else {
                items = models.filter(m => isRerank(m) && String(m.provider||'').toLowerCase()===p).map(m => m.model);
            }
            if (!items.length) items = unique(models.filter(isRerank).map(m => m.model));
            if (rrList) setOpts(rrList, unique(items));
            if (input && items.length && !items.includes(input.value)) input.value = '';
        }
        const embProvSel = document.getElementById('cost-embed-provider');
        const rrProvSel = document.getElementById('cost-rerank-provider');
        if (embProvSel) embProvSel.addEventListener('change', updateEmbedList);
        if (rrProvSel) rrProvSel.addEventListener('change', updateRerankList);
        updateEmbedList();
        updateRerankList();
    }

    async function estimateCost() {
        try{
            const d = await (window.CostLogic && window.CostLogic.estimateFromUI ? window.CostLogic.estimateFromUI(API_BASE) : Promise.reject(new Error('CostLogic missing')));
            $('#cost-daily').textContent = `$${Number(d.daily||0).toFixed(4)}`;
            $('#cost-monthly').textContent = `$${Number(d.monthly||0).toFixed(2)}`;
        }catch(e){ alert('Cost estimation failed: ' + e.message); }
    }

    // ---------------- Hardware Scan & Profiles ----------------
    function formatHardwareScan(data) {
        if (!data || typeof data !== 'object') return 'No scan data';
        const info = data.info || {};
        const rt = data.runtimes || {};
        const parts = [];

        if (info.os) parts.push(`<div class="section"><span class="key">OS:</span> <span class="value">${info.os}</span></div>`);
        if (info.cpu_cores) parts.push(`<div class="section"><span class="key">CPU Cores:</span> <span class="value">${info.cpu_cores}</span></div>`);
        if (info.mem_gb) parts.push(`<div class="section"><span class="key">Memory:</span> <span class="value">${info.mem_gb} GB</span></div>`);
        if (info.gpu) parts.push(`<div class="section"><span class="key">GPU:</span> <span class="value">${info.gpu}</span></div>`);

        const activeRuntimes = Object.keys(rt).filter(k => rt[k]);
        if (activeRuntimes.length) {
            parts.push(`<div class="section"><span class="key">Runtimes:</span> <span class="value">${activeRuntimes.join(', ')}</span></div>`);
        }

        return parts.join('');
    }

    async function scanHardware() {
        try {
            const r = await fetch(api('/api/scan-hw'), { method: 'POST' });
            const d = await r.json();
            const scanOut = $('#scan-out');
            scanOut.innerHTML = formatHardwareScan(d);
            scanOut.dataset.scanData = JSON.stringify(d);
            updateWizardSummary();
            return d;
        } catch (e) {
            alert('Hardware scan failed: ' + e.message);
            return null;
        }
    }

    function proposeProfile(scan, budget) {
        // Budget-aware defaults (avoid paid providers at $0)
        const hasLocal = scan?.runtimes?.ollama || scan?.runtimes?.coreml;
        const rprov = (Number(budget) === 0) ? (hasLocal ? 'local' : 'none') : 'cohere';
        const prof = {
            GEN_MODEL: hasLocal && Number(budget) === 0 ? 'qwen3-coder:14b' : 'gpt-4o-mini',
            EMBEDDING_TYPE: (Number(budget) === 0) ? (hasLocal ? 'local' : 'mxbai') : 'openai',
            RERANK_BACKEND: rprov,
            MQ_REWRITES: Number(budget) > 50 ? '6' : '3',
            TOPK_SPARSE: '75',
            TOPK_DENSE: '75',
            FINAL_K: Number(budget) > 50 ? '20' : '10',
            HYDRATION_MODE: 'lazy',
        };
        return prof;
    }

    function _tooltipHtmlForKey(k){
        try{
            const map = (window.Tooltips && window.Tooltips.buildTooltipMap && window.Tooltips.buildTooltipMap()) || {};
            return map[k] || `<span class="tt-title">${k}</span><div>No detailed tooltip available yet. See our docs.</div><div class="tt-links"><a href="/files/README.md" target="_blank" rel="noopener">Main README</a> <a href="/docs/README.md" target="_blank" rel="noopener">Docs Index</a></div>`;
        }catch{return `<span class="tt-title">${k}</span><div>No details found.</div>`}
    }

    function formatProfile(prof) {
        if (!prof || typeof prof !== 'object') return '(Preview will appear here)';
        const parts = [];

        const keyGroups = {
            'Generation': ['GEN_MODEL', 'ENRICH_MODEL', 'ENRICH_MODEL_OLLAMA'],
            'Embeddings': ['EMBEDDING_TYPE', 'VOYAGE_EMBED_DIM', 'EMBEDDING_DIM'],
            'Reranking': ['RERANK_BACKEND', 'COHERE_RERANK_MODEL', 'RERANKER_MODEL'],
            'Retrieval': ['MQ_REWRITES', 'FINAL_K', 'TOPK_SPARSE', 'TOPK_DENSE', 'HYDRATION_MODE'],
        };

        for (const [group, keys] of Object.entries(keyGroups)) {
            const groupItems = keys.filter(k => prof[k] !== undefined).map(k => {
                const tip = _tooltipHtmlForKey(k);
                const val = String(prof[k]);
                return `<div class="kv">
                    <span class="key">${k}:</span>
                    <span class="value">${val}</span>
                    <span class="tooltip-wrap"><span class="help-icon" tabindex="0" aria-label="Help: ${k}">?</span><div class="tooltip-bubble">${tip}</div></span>
                </div>`;
            });
            if (groupItems.length) {
                parts.push(`<div class="section"><strong style="color:#5b9dff;">${group}</strong>${groupItems.join('')}</div>`);
            }
        }

        if (prof.__estimate__) {
            const est = prof.__estimate__;
            parts.push(`<div class="section"><strong style="color:#b794f6;">Cost Estimate</strong><div><span class="key">Daily:</span> <span class="value">$${Number(est.daily||0).toFixed(4)}</span></div><div><span class="key">Monthly:</span> <span class="value">$${Number(est.monthly||0).toFixed(2)}</span></div></div>`);
        }

        return parts.join('');
    }

    function bindPreviewTooltips(){
        const root = document.getElementById('profile-preview');
        if (!root) return;
        root.querySelectorAll('.kv .help-icon').forEach(icon => {
            const wrap = icon.parentElement;
            const bubble = wrap && wrap.querySelector('.tooltip-bubble');
            if (!wrap || !bubble) return;
            function show(){ bubble.classList.add('tooltip-visible'); }
            function hide(){ bubble.classList.remove('tooltip-visible'); }
            icon.addEventListener('mouseenter', show);
            icon.addEventListener('mouseleave', hide);
            icon.addEventListener('focus', show);
            icon.addEventListener('blur', hide);
            icon.addEventListener('click', (e)=>{ e.stopPropagation(); bubble.classList.toggle('tooltip-visible'); });
            document.addEventListener('click', (evt)=>{ if (!wrap.contains(evt.target)) bubble.classList.remove('tooltip-visible'); });
        });
    }

    async function generateProfileWizard() {
        let scan = null;
        const scanOut = $('#scan-out');
        // Try to extract scan from data attribute or re-scan
        if (scanOut.dataset.scanData) {
            try { scan = JSON.parse(scanOut.dataset.scanData); } catch {}
        }
        if (!scan) scan = await scanHardware();
        const budget = parseFloat($('#budget').value || '0');
        const prof = (window.ProfileLogic && window.ProfileLogic.buildWizardProfile) ? window.ProfileLogic.buildWizardProfile(scan, budget) : {};

        // Try a pipeline cost preview
        const payload = (window.CostLogic && window.CostLogic.buildPayloadFromUI) ? window.CostLogic.buildPayloadFromUI() : {
            gen_provider:'openai', gen_model:'gpt-4o-mini', tokens_in:0, tokens_out:0, embeds:0, reranks:0, requests_per_day:0
        };
        try {
            const r = await fetch(api('/api/cost/estimate_pipeline'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            const d = await r.json();
            prof.__estimate__ = d;
        } catch {}
        $('#profile-preview').innerHTML = formatProfile(prof);
        bindPreviewTooltips();
        $('#profile-preview').dataset.profileData = JSON.stringify(prof);
        updateWizardSummary();
        return prof;
    }

    async function applyProfileWizard() {
        let prof = null;
        const preview = $('#profile-preview');
        if (preview.dataset.profileData) {
            try { prof = JSON.parse(preview.dataset.profileData); } catch {}
        }
        if (!prof || typeof prof !== 'object') prof = await generateProfileWizard();
        // Remove cost estimate from applied profile
        if (prof.__estimate__) delete prof.__estimate__;
        try {
            const r = await fetch(api('/api/profiles/apply'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ profile: prof }) });
            const d = await r.json();
            alert(`Profile applied: ${d.applied_keys?.join(', ') || 'ok'}`);
            await loadConfig();
        } catch (e) { alert('Failed to apply profile: ' + e.message); }
    }

    // Tri-Candidate Generation (from docs)
    function generateCandidates(scan, budget) {
        const hasLocal = !!(scan?.runtimes?.ollama || scan?.runtimes?.coreml);
        const mem = (scan?.info?.mem_gb || 8);
        const budgetNum = Number(budget) || 0;

        // Three baseline candidates
        const local = {
            name: 'local',
            env: {
                GEN_MODEL: hasLocal ? 'qwen3-coder:14b' : 'gpt-4o-mini',
                EMBEDDING_TYPE: hasLocal ? 'local' : 'mxbai',
                RERANK_BACKEND: hasLocal ? 'local' : 'none',
                MQ_REWRITES: mem >= 32 ? '4' : '3',
                FINAL_K: mem >= 32 ? '10' : '8',
                TOPK_DENSE: '60', TOPK_SPARSE: '60', HYDRATION_MODE: 'lazy'
            }
        };
        const cheapCloud = {
            name: 'cheap_cloud',
            env: {
                GEN_MODEL: 'gpt-4o-mini', EMBEDDING_TYPE: 'openai', RERANK_BACKEND: 'local',
                MQ_REWRITES: budgetNum > 25 ? '4' : '3',
                FINAL_K: budgetNum > 25 ? '10' : '8',
                TOPK_DENSE: '75', TOPK_SPARSE: '75', HYDRATION_MODE: 'lazy'
            }
        };
        const premium = {
            name: 'premium',
            env: {
                GEN_MODEL: 'gpt-4o-mini', EMBEDDING_TYPE: 'openai', RERANK_BACKEND: 'cohere',
                MQ_REWRITES: budgetNum > 100 ? '6' : '4',
                FINAL_K: budgetNum > 100 ? '20' : '12',
                TOPK_DENSE: '120', TOPK_SPARSE: '120', HYDRATION_MODE: 'lazy'
            }
        };
        return [local, cheapCloud, premium];
    }

    async function triCostSelect() {
        // Use current Cost panel inputs for tokens and rpd
        const base = {
            tokens_in: parseInt($('#cost-in').value || '500', 10),
            tokens_out: parseInt($('#cost-out').value || '800', 10),
            embeds: parseInt($('#cost-embeds').value || '0', 10),
            reranks: parseInt($('#cost-rerank').value || '0', 10),
            requests_per_day: parseInt($('#cost-rpd').value || '100', 10)
        };
        const budget = parseFloat($('#budget').value || '0');
        const scanOut = $('#scan-out');
        let scan = null;
        if (scanOut && scanOut.dataset.scanData) {
            try { scan = JSON.parse(scanOut.dataset.scanData); } catch {}
        }
        if (!scan) scan = await scanHardware();

        const cands = generateCandidates(scan, budget);

        const rows = [];
        for (const c of cands) {
            // Decide provider/model from env for cost call
            const provider = (c.env.GEN_MODEL || '').match(/:/) ? 'local' : 'openai';
            const model = c.env.GEN_MODEL || 'gpt-4o-mini';
            const payload = (window.CostLogic && window.CostLogic.buildPayloadFromUI) ? window.CostLogic.buildPayloadFromUI() : { gen_provider: provider, gen_model: model, ...base };
            payload.gen_provider = provider; payload.gen_model = model;

            // local electricity optional if provider==local
            if (provider === 'local') {
                const kwh = $('#cost-kwh')?.value;
                const watts = $('#cost-watts')?.value;
                const hours = $('#cost-hours')?.value;
                if (kwh) payload.kwh_rate = parseFloat(kwh);
                if (watts) payload.watts = parseInt(watts, 10);
                if (hours) payload.hours_per_day = parseFloat(hours);
            }
            // Call cost API
            const r = await fetch(api('/api/cost/estimate'), {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(payload)
            });
            const d = await r.json();
            rows.push({
                name: c.name,
                env: c.env,
                provider,
                model,
                daily: d.daily,
                monthly: d.monthly,
                breakdown: d.breakdown
            });
        }

        // Rank by monthly (ascending), then prefer cheaper that meet budget if budget>0
        const ranked = rows.sort((a,b) => a.monthly - b.monthly);
        let winner = ranked[0];
        if (budget > 0) {
            const within = ranked.filter(r => r.monthly <= budget);
            if (within.length) winner = within[within.length - 1]; // Pick most expensive within budget
        }

        const triOut = $('#tri-out');
        if (triOut) {
            const lines = [];
            ranked.forEach(r => {
                const mark = r.name === winner.name ? '✓' : ' ';
                const header = `${mark} ${r.name.toUpperCase().padEnd(15)} $${r.monthly.toFixed(2)}/mo`;
                lines.push(header);
                lines.push(`  Inference:  ${r.env.GEN_MODEL || '—'}`);
                lines.push(`  Embedding:  ${r.env.EMBEDDING_TYPE || '—'}`);
                lines.push(`  Rerank:     ${r.env.RERANK_BACKEND || 'none'}`);
                lines.push(`  MQ:${r.env.MQ_REWRITES||'3'}  Final-K:${r.env.FINAL_K||'10'}  Sparse:${r.env.TOPK_SPARSE||'75'}  Dense:${r.env.TOPK_DENSE||'75'}`);
                lines.push('');
            });
            triOut.textContent = lines.join('\n').trim();
        }

        return { winner, ranked };
    }

    async function triChooseAndApply() {
        console.log('[AUTO-PROFILE] Button clicked - starting triChooseAndApply');

        // Show loading state
        const placeholder = $('#profile-placeholder');
        const resultsContent = $('#profile-results-content');
        console.log('[AUTO-PROFILE] Elements found:', { placeholder: !!placeholder, resultsContent: !!resultsContent });

        if (placeholder) placeholder.style.display = 'flex';
        if (resultsContent) resultsContent.style.display = 'none';

        // Add loading spinner to placeholder
        if (placeholder) {
            placeholder.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <div style="width:48px;height:48px;border:3px solid #2a2a2a;border-top-color:#00ff88;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px;"></div>
                    <p style="font-size:14px;color:#666;">Analyzing hardware and generating profile...</p>
                </div>
                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            `;
        }

        const { winner, ranked } = await triCostSelect();
        const budget = Number($('#budget')?.value || 0);

        // Scan hardware if not already done
        let scan = state.hwScan;
        if (!scan) {
            try {
                const r = await fetch(api('/api/scan-hw'), { method: 'POST' });
                scan = await r.json();
                state.hwScan = scan;
            } catch (e) {
                console.error('HW scan failed:', e);
                scan = null;
            }
        }

        // Render rich profile display using ProfileRenderer
        if (window.ProfileRenderer && resultsContent) {
            try {
                const html = window.ProfileRenderer.renderProfileResults(winner.env, scan, budget);
                resultsContent.innerHTML = html;
                // Bind tooltips inside the rendered preview
                if (window.ProfileRenderer.bindTooltips) window.ProfileRenderer.bindTooltips(resultsContent);

                // Hide placeholder, show results
                if (placeholder) placeholder.style.display = 'none';
                resultsContent.style.display = 'block';
            } catch (err) {
                console.error('ProfileRenderer error:', err);
                // Fallback to simple display
                if (resultsContent) {
                    resultsContent.innerHTML = '<pre style="color:#ff6b6b;padding:20px;">Error rendering profile: ' + err.message + '</pre>';
                    resultsContent.style.display = 'block';
                    if (placeholder) placeholder.style.display = 'none';
                }
            }
        } else {
            console.error('ProfileRenderer not available:', { hasRenderer: !!window.ProfileRenderer, hasContent: !!resultsContent });
            // Fallback to old method
            if (resultsContent) {
                resultsContent.innerHTML = '<pre style="padding:20px;color:#aaa;">' + JSON.stringify(winner.env, null, 2) + '</pre>';
                resultsContent.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            }
        }

        // Wire up action buttons (always, regardless of renderer)
        const applyBtn = document.getElementById('apply-profile-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                const r = await fetch(api('/api/profiles/apply'), {
                    method: 'POST',
                    headers: { 'Content-Type':'application/json' },
                    body: JSON.stringify({ profile: winner.env })
                });
                if (!r.ok) {
                    alert('Apply failed');
                    return;
                }
                alert(`✓ Applied: ${winner.name} ($${winner.monthly.toFixed(2)}/mo)\n\nSettings are now active. Refresh the page to see updated values.`);
                await loadConfig();
            });
        }

        const exportBtn = document.getElementById('export-profile-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(winner.env, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `profile-${winner.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        const saveBtn = document.getElementById('save-profile-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const name = prompt('Profile name:', winner.name.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                if (!name) return;
                const r = await fetch(api('/api/profiles/save'), {
                    method: 'POST',
                    headers: { 'Content-Type':'application/json' },
                    body: JSON.stringify({ name, profile: winner.env })
                });
                if (r.ok) {
                    alert(`✓ Saved as "${name}"`);
                    await loadProfiles();
                } else {
                    alert('Save failed');
                }
            });
        }
    }

    // Wizard helpers
    function buildWizardProfile(scan, budget) {
        // Legacy single-profile builder (kept for compatibility)
        const hasLocal = scan?.runtimes?.ollama || scan?.runtimes?.coreml;
        const budgetNum = Number(budget) || 0;
        const defaultGen = hasLocal && budgetNum === 0 ? 'qwen3-coder:14b' : 'gpt-4o-mini';
        const defaultEmb = budgetNum === 0 ? (hasLocal ? 'local' : 'mxbai') : 'openai';
        const defaultRprov = budgetNum === 0 ? (hasLocal ? 'local' : 'none') : 'cohere';

        const profile = {
            GEN_MODEL: defaultGen,
            EMBEDDING_TYPE: defaultEmb,
            RERANK_BACKEND: defaultRprov,
            MQ_REWRITES: budgetNum > 50 ? '6' : '3',
            FINAL_K: budgetNum > 50 ? '20' : '10',
            TOPK_SPARSE: budgetNum > 50 ? '120' : '75',
            TOPK_DENSE: budgetNum > 50 ? '120' : '75',
            HYDRATION_MODE: 'lazy',
        };
        return profile;
    }

    function seedWizardFromEnv(env) {
        const wzGen = $('#wizard-gen-model');
        if (wzGen && env.GEN_MODEL) wzGen.value = env.GEN_MODEL;
        const wzEmb = $('#wizard-embed-provider');
        if (wzEmb && env.EMBEDDING_TYPE) wzEmb.value = env.EMBEDDING_TYPE;
        const wzRprov = $('#wizard-rerank-provider');
        if (wzRprov && env.RERANK_BACKEND) wzRprov.value = env.RERANK_BACKEND;
        const wzRmod = $('#wizard-rerank-model');
        if (wzRmod && (env.COHERE_RERANK_MODEL || env.RERANKER_MODEL)) wzRmod.value = env.COHERE_RERANK_MODEL || env.RERANKER_MODEL;
    }

    function loadWizardFromEnv() {
        const env = (state.config && state.config.env) || {};
        seedWizardFromEnv(env);
        updateWizardSummary();
    }

    function updateWizardSummary() {
        const scanOut = $('#scan-out');
        let hw = '';
        if (scanOut && scanOut.dataset.scanData) {
            try {
                const s = JSON.parse(scanOut.dataset.scanData);
                hw = `${s.info?.cpu_cores||'?'} cores, ${s.info?.mem_gb||'?'} GB RAM, runtimes: ${Object.keys(s.runtimes||{}).filter(k=>s.runtimes[k]).join(', ')||'none'}`;
            } catch { hw = '(hardware not scanned)'; }
        } else {
            hw = '(hardware not scanned)';
        }
        const gen = ($('#wizard-gen-model')?.value || '(GEN_MODEL not set)');
        const emb = ($('#wizard-embed-provider')?.value || (state.config?.env?.EMBEDDING_TYPE || '(use current)'));
        const rprov = ($('#wizard-rerank-provider')?.value || (state.config?.env?.RERANK_BACKEND || '(use current)'));
        const rmod = ($('#wizard-rerank-model')?.value || state.config?.env?.COHERE_RERANK_MODEL || state.config?.env?.RERANKER_MODEL || '');
        const budget = $('#budget')?.value || '0';
        const line = `Hardware: ${hw}\nModels: gen=${gen}, emb=${emb}, rerank=${rprov}${rmod?`:${rmod}`:''}\nBudget: $${budget}/mo`;
        const el = $('#wizard-summary'); if (el) el.textContent = line;
    }

    // Keep summary in sync
    ;['wizard-gen-model','wizard-embed-provider','wizard-rerank-provider','wizard-rerank-model','budget'].forEach(id => {
        const el = document.getElementById(id); if (el) el.addEventListener('input', updateWizardSummary);
    });

    async function applyProfile() {
        const scanText = $('#scan-out').textContent;
        if (!scanText || scanText === '') {
            alert('Please scan hardware first');
            return;
        }

        const scan = JSON.parse(scanText);
        const budget = parseFloat($('#budget').value || '0');
        const prof = proposeProfile(scan, budget);

        try {
            const r = await fetch(api('/api/profiles/apply'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: prof })
            });

            const d = await r.json();
            alert(`Profile applied: ${d.applied_keys.join(', ')}`);
            await loadConfig();
        } catch (e) {
            alert('Failed to apply profile: ' + e.message);
        }
    }

    async function loadProfiles() {
        try {
            const r = await fetch(api('/api/profiles'));
            const d = await r.json();
            state.profiles = d.profiles || [];
            state.defaultProfile = d.default || null;

            const ul = $('#profiles-ul');
            const tooltip = $('#profile-tooltip');
            ul.innerHTML = '';

            state.profiles.forEach((name) => {
                const li = document.createElement('li');
                li.textContent = name;
                li.style.cssText = 'padding: 6px 8px; color: #aaa; cursor: pointer; border-radius: 4px; transition: all 0.15s ease;';

                li.addEventListener('mouseenter', async (e) => {
                    li.style.background = '#1a1a1a';
                    li.style.color = '#00ff88';
                    await showProfileTooltip(name, e);
                });

                li.addEventListener('mouseleave', () => {
                    li.style.background = 'transparent';
                    li.style.color = '#aaa';
                    hideProfileTooltip();
                });

                li.addEventListener('click', () => loadAndApplyProfile(name));
                ul.appendChild(li);
            });
        } catch (e) {
            console.error('Failed to load profiles:', e);
        }
    }

    async function showProfileTooltip(name, event) {
        const tooltip = $('#profile-tooltip');
        if (!tooltip) return;

        try {
            // Fetch the profile data
            const r = await fetch(api(`/api/profiles/${encodeURIComponent(name)}`));
            if (!r.ok) return;

            const d = await r.json();
            const prof = d.profile || {};

            // Build tooltip content
            let html = `<div class="tooltip-header">${name}</div>`;

            const entries = Object.entries(prof);
            if (entries.length === 0) {
                html += '<div style="color: #666; font-size: 11px; font-style: italic;">Empty profile</div>';
            } else {
                entries.forEach(([key, value]) => {
                    const displayValue = String(value).length > 40
                        ? String(value).substring(0, 37) + '...'
                        : String(value);
                    html += `
                        <div class="tooltip-item">
                            <div class="tooltip-key">${key}</div>
                            <div class="tooltip-value">${displayValue}</div>
                        </div>
                    `;
                });
            }

            tooltip.innerHTML = html;

            // Position tooltip near the mouse
            const rect = event.target.getBoundingClientRect();
            tooltip.style.left = (rect.right + 10) + 'px';
            tooltip.style.top = rect.top + 'px';
            tooltip.style.display = 'block';

        } catch (e) {
            console.error('Failed to load profile for tooltip:', e);
        }
    }

    function hideProfileTooltip() {
        const tooltip = $('#profile-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    async function loadAndApplyProfile(name) {
        try {
            // Load the profile data
            const r = await fetch(api(`/api/profiles/${encodeURIComponent(name)}`));
            if (!r.ok) {
                alert(`Failed to load profile "${name}"`);
                return;
            }
            const d = await r.json();
            const prof = d.profile || {};

            // Apply the profile
            const applyRes = await fetch(api('/api/profiles/apply'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: prof })
            });

            if (!applyRes.ok) {
                alert(`Failed to apply profile "${name}"`);
                return;
            }

            const applyData = await applyRes.json();
            alert(`✓ Profile "${name}" applied successfully!\n\nApplied keys: ${applyData.applied_keys?.join(', ') || 'none'}`);

            // Reload config to show updated values in UI
            await loadConfig();
        } catch (e) {
            alert(`Error loading profile "${name}": ${e.message}`);
        }
    }

    async function saveProfile() {
        const name = $('#profile-name').value.trim();
        if (!name) {
            alert('Enter a profile name');
            return;
        }

        // Prefer wizard preview if present; otherwise build from scan
        let prof = null;
        const preview = $('#profile-preview');
        if (preview.dataset.profileData) {
            try { prof = JSON.parse(preview.dataset.profileData); } catch {}
        }
        if (!prof) {
            const scanOut = $('#scan-out');
            if (!scanOut.dataset.scanData) { alert('Please scan hardware first'); return; }
            const scan = JSON.parse(scanOut.dataset.scanData);
            const budget = parseFloat($('#budget').value || '0');
            prof = proposeProfile(scan, budget);
        }
        // Remove cost estimate before saving
        if (prof.__estimate__) delete prof.__estimate__;

        try {
            const r = await fetch(api('/api/profiles/save'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, profile: prof })
            });

            if (!r.ok) {
                alert('Save failed');
                return;
            }

            await loadProfiles();
            alert(`Saved profile: ${name}`);
        } catch (e) {
            alert('Failed to save profile: ' + e.message);
        }
    }

    // ---------------- Secrets Ingest (Drag & Drop) ----------------
    // Delegated to Secrets module (gui/js/secrets.js)
    const bindDropzone = window.Secrets?.bindDropzone || (() => {});
    const ingestFile = window.Secrets?.ingestFile || (async () => {});

    // ---------------- Quick Action Helpers ----------------
    function setButtonState(btn, state) {
        if (!btn) return;
        btn.classList.remove('loading', 'success', 'error');
        if (state === 'loading') btn.classList.add('loading');
        else if (state === 'success') btn.classList.add('success');
        else if (state === 'error') btn.classList.add('error');
    }

    function showStatus(message, type = 'info') {
        const status = document.getElementById('dash-index-status');
        const bar = document.getElementById('dash-index-bar');
        if (!status) return;

        const timestamp = new Date().toLocaleTimeString();
        const color = type === 'success' ? '#00ff88' : type === 'error' ? '#ff6b6b' : '#5b9dff';
        const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '•';

        status.innerHTML = `<span style="color:${color};">${icon}</span> <span style="color:#666;">[${timestamp}]</span> ${message}`;

        if (bar) {
            if (type === 'loading') {
                bar.style.width = '50%';
                bar.style.opacity = '0.6';
            } else if (type === 'success') {
                bar.style.width = '100%';
                bar.style.opacity = '1';
                setTimeout(() => { bar.style.width = '0%'; }, 2000);
            } else if (type === 'error') {
                bar.style.width = '100%';
                bar.style.background = '#ff6b6b';
                bar.style.opacity = '1';
                setTimeout(() => {
                    bar.style.width = '0%';
                    bar.style.background = 'linear-gradient(90deg, #ff9b5e 0%, #ff6b9d 100%)';
                }, 2000);
            }
        }
    }

    // Simulated progress ticker for long-running actions
    function startSimProgress(label, total = 80, tips = []) {
        const status = document.getElementById('dash-index-status');
        const bar = document.getElementById('dash-index-bar');
        let step = 0; let tipIdx = 0;
        function tick() {
            step = Math.min(total, step + 1);
            const pct = Math.min(90, Math.max(5, Math.floor((step / Math.max(1,total)) * 90)));
            if (bar) { bar.style.width = pct + '%'; bar.style.opacity = '0.9'; }
            const tip = tips.length ? (tips[tipIdx % tips.length]) : '';
            tipIdx++;
            if (status) {
                status.innerHTML = `
                    <div class="mono" style="color:#bbb;">
                        🔎 ${label}<br>
                        Scanning ${step} of ${total}… ${tip ? `<span style='color:#666'>(${tip})</span>` : ''}
                    </div>
                `;
            }
        }
        const id = setInterval(tick, 3500);
        tick();
        return {
            stop: () => {
                clearInterval(id);
                if (bar) { bar.style.width = '100%'; bar.style.opacity = '1'; setTimeout(()=>{ bar.style.width='0%'; }, 1500); }
            }
        };
    }

    function bindQuickAction(btnId, handler) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            setButtonState(btn, 'loading');

            try {
                await handler();
                setButtonState(btn, 'success');
                setTimeout(() => setButtonState(btn, null), 1500);
            } catch (err) {
                console.error(`[${btnId}] Error:`, err);
                setButtonState(btn, 'error');
                setTimeout(() => setButtonState(btn, null), 2000);
            }
        });
    }

    // ---------------- Quick Actions ----------------
    async function changeRepo() {
        showStatus('Loading repositories...', 'loading');

        try {
            const response = await fetch(api('/api/config'));
            const data = await response.json();
            const repos = data.repos || [];
            const currentRepo = (data.env && data.env.REPO) || data.default_repo || 'agro';

            if (repos.length === 0) {
                showStatus('No repositories configured', 'error');
                return;
            }

            // Create a dialog-like selection UI
            const repoHtml = repos.map((repo, idx) => {
                const isActive = repo.slug === currentRepo;
                return `
                    <button
                        class="small-button"
                        data-repo="${repo.slug}"
                        style="
                            margin-bottom: 8px;
                            background: ${isActive ? '#00ff88' : '#1a1a1a'};
                            color: ${isActive ? '#000' : '#aaa'};
                            border: 1px solid ${isActive ? '#00ff88' : '#2a2a2a'};
                            width: 100%;
                            text-align: left;
                            padding: 12px;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                        "
                    >
                        <span>${repo.slug}</span>
                        ${isActive ? '<span>✓ ACTIVE</span>' : ''}
                    </button>
                `;
            }).join('');

            const status = document.getElementById('dash-index-status');
            if (status) {
                status.innerHTML = `
                    <div style="padding: 8px;">
                        <div style="margin-bottom: 12px; color: #00ff88; font-weight: 600;">Select Repository:</div>
                        ${repoHtml}
                    </div>
                `;

                // Bind click handlers
                repos.forEach(repo => {
                    const btn = status.querySelector(`[data-repo="${repo.slug}"]`);
                    if (btn && repo.slug !== currentRepo) {
                        btn.addEventListener('click', async () => {
                            btn.disabled = true;
                            btn.style.opacity = '0.6';
                            showStatus(`Switching to ${repo.slug}...`, 'loading');

                            try {
                                const updateResponse = await fetch(api('/api/env/update'), {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ REPO: repo.slug })
                                });

                                if (updateResponse.ok) {
                                    showStatus(`Switched to ${repo.slug}`, 'success');
                                    setTimeout(() => refreshDashboard(), 500);
                                } else {
                                    showStatus(`Failed to switch to ${repo.slug}`, 'error');
                                }
                            } catch (err) {
                                showStatus(`Error switching repo: ${err.message}`, 'error');
                            }
                        });
                    }
                });
            }
        } catch (err) {
            showStatus(`Error loading repos: ${err.message}`, 'error');
        }
    }

    async function createKeywords() {
        const btn = document.getElementById('btn-generate-keywords');
        setButtonState(btn, 'loading');
        showStatus('Generating keywords (this may take 2–5 minutes)...', 'loading');

        try {
            const response = await fetch(api('/api/config'));
            const data = await response.json();
            const env = (data && data.env) || (state.config && state.config.env) || {};
            const repo = env.REPO || data.default_repo || 'agro';
            const modeSel = document.getElementById('kw-gen-mode');
            const mode = modeSel ? (modeSel.value || 'llm') : 'llm';
            const maxFilesEl = document.querySelector('[name="KEYWORDS_MAX_FILES"]');
            const max_files = maxFilesEl && maxFilesEl.value ? Number(maxFilesEl.value) : undefined;
            // Force OpenAI 4o for this on-click run (per request)
            const backend = 'openai';
            let model = 'gpt-4o';
            const tips = [
                'After keywords, build Semantic Cards in Repos → Indexing',
                'Add Path Boosts to steer retrieval (Repos tab)',
                'Toggle ENRICH_CODE_CHUNKS to store per‑chunk summaries',
                'Use shared profile to reuse indices across branches (Infrastructure)'
            ];
            var sim = startSimProgress(
                mode === 'llm' ? `Mode: LLM • Backend: ${backend} • Model: ${model}` : 'Mode: Heuristic • Scanning tokens and file coverage…',
                max_files || 80,
                tips
            );

            // Call the keywords generation endpoint
            const createResponse = await fetch(api('/api/keywords/generate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo, mode, max_files, backend, openai_model: (backend==='openai'?model:undefined) })
            });

            if (createResponse.ok) {
                const result = await createResponse.json();

                if (result.ok) {
                    const discr = result.discriminative?.count || 0;
                    const sema = result.semantic?.count || 0;
                    const total = result.total_count || 0;
                    const duration = result.duration_seconds || 0;

                    // Build detailed status message
                    const status = `
                        <div style="font-size:14px;font-weight:600;color:#00ff88;margin-bottom:8px;">
                            ✓ Generated ${total} keywords for repo: ${repo}
                        </div>
                        <div style="font-size:12px;color:#ddd;margin-bottom:4px;">
                            <span style="color:#b794f6;">Discriminative:</span> ${discr} keywords
                        </div>
                        <div style="font-size:12px;color:#ddd;margin-bottom:4px;">
                            <span style="color:#5b9dff;">Semantic:</span> ${sema} keywords
                        </div>
                        <div style="font-size:12px;color:#ddd;margin-bottom:4px;">
                            <span style="color:#00d6ff;">LLM:</span> ${result.llm?.count || 0} keywords
                        </div>
                        <div style="font-size:11px;color:#999;margin-top:8px;">
                            Completed in ${duration}s
                        </div>
                        <div style="font-size:11px;color:#666;margin-top:6px;">
                            → View keywords in <span style="color:#00ff88;font-weight:600;">Repos & Indexing</span> tab
                        </div>
                    `;

                    const statusDiv = document.getElementById('dash-index-status');
                    if (statusDiv) {
                        statusDiv.innerHTML = status + `
                            <div style="margin-top:8px;">
                                <button id="cta-build-cards" class="small-button">Build Cards Now</button>
                            </div>
                        `;
                        const cta = document.getElementById('cta-build-cards');
                        if (cta) cta.addEventListener('click', async () => { try { switchTab('repos'); startCardsBuild(); } catch(e) { showStatus('Unable to start cards build', 'error'); } });
                    }

                    // Reload keywords to populate the UI
                    await loadKeywords();
                    setButtonState(btn, 'success');
                    setTimeout(()=> setButtonState(btn, null), 1500);
                    try { if (sim && sim.stop) sim.stop(); } catch {}
                } else {
                    showStatus(`Failed to generate keywords: ${result.error || 'Unknown error'}`, 'error');
                    setButtonState(btn, 'error');
                    setTimeout(()=> setButtonState(btn, null), 2000);
                    try { if (sim && sim.stop) sim.stop(); } catch {}
                }
            } else {
                const error = await createResponse.text();
                showStatus(`Failed to generate keywords: ${error}`, 'error');
                setButtonState(btn, 'error');
                setTimeout(()=> setButtonState(btn, null), 2000);
                try { if (sim && sim.stop) sim.stop(); } catch {}
            }
        } catch (err) {
            showStatus(`Error generating keywords: ${err.message}`, 'error');
            const btn = document.getElementById('btn-generate-keywords');
            setButtonState(btn, 'error');
            setTimeout(()=> setButtonState(btn, null), 2000);
            try { if (typeof sim !== 'undefined' && sim && sim.stop) sim.stop(); } catch {}
        }
    }

    async function reloadConfig() {
        showStatus('Reloading configuration...', 'loading');

        try {
            const response = await fetch(api('/api/env/reload'), {
                method: 'POST'
            });

            if (response.ok) {
                showStatus('Configuration reloaded successfully', 'success');
                await loadConfig();
                await refreshDashboard();
            } else {
                const error = await response.text();
                showStatus(`Failed to reload config: ${error}`, 'error');
            }
        } catch (err) {
            showStatus(`Error reloading config: ${err.message}`, 'error');
        }
    }

    // ---------------- Bindings ----------------
    function bindActions() {
        const btnHealth = $('#btn-health'); if (btnHealth) btnHealth.addEventListener('click', checkHealth);
        const saveBtn = $('#save-btn'); if (saveBtn) saveBtn.addEventListener('click', saveConfig);
        const btnEstimate = $('#btn-estimate'); if (btnEstimate) btnEstimate.addEventListener('click', estimateCost);
        const btnScanHw = $('#btn-scan-hw'); if (btnScanHw) btnScanHw.addEventListener('click', scanHardware);
        const legacyApply = document.getElementById('btn-apply-profile');
        if (legacyApply) legacyApply.addEventListener('click', applyProfile);
        const btnSaveProfile = $('#btn-save-profile'); if (btnSaveProfile) btnSaveProfile.addEventListener('click', saveProfile);
        const genBtn = document.getElementById('btn-generate-profile');
        if (genBtn) genBtn.addEventListener('click', generateProfileWizard);
        const applyWizard = document.getElementById('btn-apply-wizard');
        if (applyWizard) applyWizard.addEventListener('click', applyProfileWizard);
        const oneClick = document.getElementById('btn-wizard-oneclick');
        if (oneClick) oneClick.addEventListener('click', onWizardOneClick);
        const loadCur = document.getElementById('btn-wizard-load-cur');
        if (loadCur) loadCur.addEventListener('click', loadWizardFromEnv);

        // Retrieval tab: trace button
        const rt = document.getElementById('btn-trace-latest');
        if (rt) rt.addEventListener('click', ()=>loadLatestTrace('trace-output'));
        const rtLS = document.getElementById('btn-trace-open-ls');
        if (rtLS) rtLS.addEventListener('click', async ()=>{
            try{
                const prj = (state.config?.env?.LANGCHAIN_PROJECT||'agro');
                const qs = new URLSearchParams({ project: prj, share: 'true' });
                const r = await fetch(api(`/api/langsmith/latest?${qs.toString()}`));
                const d = await r.json();
                if (d && d.url) window.open(d.url, '_blank');
                else alert('No recent LangSmith run found. Ask a question first.');
            }catch(e){ alert('Unable to open LangSmith: '+e.message); }
        });

        // Chat bindings
        const chatSend = document.getElementById('chat-send');
        if (chatSend) chatSend.addEventListener('click', sendChat);
        const chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.addEventListener('keydown', (e)=>{ if ((e.ctrlKey||e.metaKey) && e.key==='Enter') { e.preventDefault(); sendChat(); }});
        const chatClear = document.getElementById('chat-clear');
        if (chatClear) chatClear.addEventListener('click', ()=>{ const box=document.getElementById('chat-messages'); if (box) box.innerHTML='';});
        const chatTrace = document.getElementById('chat-trace');
        if (chatTrace) chatTrace.addEventListener('toggle', ()=>{ if (chatTrace.open) loadLatestTrace('chat-trace-output'); });

        // Dopamine-y feedback on any button click
        document.querySelectorAll('button').forEach(btn => {
            if (btn.dataset && btn.dataset.dopamineBound) return;
            if (!btn.dataset) btn.dataset = {};
            btn.dataset.dopamineBound = '1';
            btn.addEventListener('click', () => {
                const label = (btn.textContent || btn.id || 'button').trim();
                if (label) showStatus(`→ ${label}`, 'info');
            });
        });

        const addGen = document.getElementById('btn-add-gen-model');
        if (addGen) addGen.addEventListener('click', addGenModelFlow);
        const addEmb = document.getElementById('btn-add-embed-model');
        if (addEmb) addEmb.addEventListener('click', addEmbedModelFlow);
        const addRr = document.getElementById('btn-add-rerank-model');
        if (addRr) addRr.addEventListener('click', addRerankModelFlow);
        const addCost = document.getElementById('btn-add-cost-model');
        if (addCost) addCost.addEventListener('click', addCostModelFlow);

        const btnAuto = document.getElementById('btn-autotune-refresh');
        if (btnAuto) btnAuto.addEventListener('click', refreshAutotune);
        const cbAuto = document.getElementById('autotune-enabled');
        if (cbAuto) cbAuto.addEventListener('change', setAutotuneEnabled);

        const btnIndex = document.getElementById('btn-index-start');
        if (btnIndex) btnIndex.addEventListener('click', startIndexing);
        document.querySelectorAll('#btn-cards-build').forEach(btn => {
            if (!btn.dataset.cardsBuildBound) { btn.dataset.cardsBuildBound='1'; btn.addEventListener('click', () => startCardsBuild()); }
        });
        const btnCardsRefresh = document.getElementById('btn-cards-refresh');
        if (btnCardsRefresh) btnCardsRefresh.addEventListener('click', refreshCards);
        // Dashboard button bindings with enhanced feedback
        bindQuickAction('dash-index-start', startIndexing);
        bindQuickAction('dash-cards-refresh', refreshCards);
        bindQuickAction('dash-change-repo', changeRepo);
        bindQuickAction('dash-reload-config', reloadConfig);
        // Keep cost panel in sync with wizard selections
        const map = [
            ['wizard-gen-model','cost-model'],
            ['wizard-embed-provider','cost-embed-provider'],
            ['wizard-rerank-provider','cost-rerank-provider'],
            ['wizard-rerank-model','cost-rerank-model'],
        ];
        map.forEach(([a,b]) => { const elA = document.getElementById(a), elB = document.getElementById(b); if (elA && elB) elA.addEventListener('input', () => { elB.value = elA.value; }); });
    }

    // ---------------- Collapsible Sections & Resizable Sidepanel ----------------
    // Delegated to UiHelpers module (gui/js/ui-helpers.js)
    const bindCollapsibleSections = window.UiHelpers?.bindCollapsibleSections || (() => console.warn('[app.js] UiHelpers.bindCollapsibleSections not available'));
    const bindResizableSidepanel = window.UiHelpers?.bindResizableSidepanel || (() => console.warn('[app.js] UiHelpers.bindResizableSidepanel not available'));

    // ---------------- Init ----------------
    async function init() {
        bindTabs();
        bindSubtabs();
        bindActions();
        bindGlobalSearchLive();
        bindResizableSidepanel();
        bindCollapsibleSections();
        bindDropzone();
        bindMcpRagSearch();
        bindLangSmithViewer();
        const hookBtn = document.getElementById('btn-install-hooks'); if (hookBtn) hookBtn.addEventListener('click', installHooks);
        const genKwBtn = document.getElementById('btn-generate-keywords'); if (genKwBtn) genKwBtn.addEventListener('click', createKeywords);

        await Promise.all([
            loadPrices(),
            loadConfig(),
            loadProfiles(),
            loadKeywords()
        ]);

        await checkHealth();
        await refreshAutotune();
        await refreshDashboard();
        await refreshHooksStatus();
        addHelpTooltips();
        // Note: comma formatting removed for cost-* fields since they are type="number" inputs
        wireDayConverters();
    }

    // -------- Embedded Editor --------
    let editorHealthInterval = null;

    async function checkEditorHealth() {
        console.log('[Editor] checkEditorHealth called');
        try {
            const resp = await fetch(api('/health/editor'));
            const data = await resp.json();
            console.log('[Editor] Health check response:', data);
            const badge = document.getElementById('editor-health-badge');
            const badgeText = document.getElementById('editor-health-text');
            const banner = document.getElementById('editor-status-banner');
            const bannerMsg = document.getElementById('editor-status-message');
            const iframe = document.getElementById('editor-iframe');

            if (data.ok) {
                console.log('[Editor] Editor is healthy, setting iframe src');
                badge.style.background = '#00ff88';
                badge.style.color = '#000';
                badgeText.textContent = '● Healthy';
                banner.style.display = 'none';
                if (!iframe.src) {
                    // Prefer same-origin proxy to avoid frame-blocking headers
                    console.log('[Editor] Setting iframe.src to /editor/');
                    iframe.src = '/editor/';
                }
            } else {
                const isDisabled = !data.enabled;
                badge.style.background = isDisabled ? '#666' : '#ff5555';
                badge.style.color = '#fff';
                badgeText.textContent = isDisabled ? '○ Disabled' : '● Error';
                banner.style.display = 'block';
                const reason = data.reason || data.error || 'Unknown error';
                bannerMsg.textContent = isDisabled
                    ? `Editor is disabled. Enable it in the Misc tab and restart.`
                    : `Error: ${reason}. Check logs or try restarting.`;
                iframe.src = '';
            }
        } catch (error) {
            console.error('Failed to check editor health:', error);
        }
    }

    async function openEditorWindow() {
        try {
            const resp = await fetch(api('/health/editor'));
            const data = await resp.json();
            if (data.url) {
                window.open(data.url, '_blank');
            } else {
                alert('Editor URL not available');
            }
        } catch (error) {
            console.error('Failed to open editor window:', error);
        }
    }

    async function copyEditorUrl() {
        try {
            const resp = await fetch(api('/health/editor'));
            const data = await resp.json();
            if (data.url) {
                await navigator.clipboard.writeText(data.url);
                const btn = document.getElementById('btn-editor-copy-url');
                const orig = btn.innerHTML;
                btn.innerHTML = '✓ Copied!';
                setTimeout(() => { btn.innerHTML = orig; }, 2000);
            } else {
                alert('Editor URL not available');
            }
        } catch (error) {
            console.error('Failed to copy URL:', error);
        }
    }

    async function restartEditor() {
        try {
            const btn = document.getElementById('btn-editor-restart');
            btn.disabled = true;
            btn.textContent = 'Restarting...';
            const resp = await fetch(api('/api/editor/restart'), { method: 'POST' });
            const data = await resp.json();
            if (data.ok) {
                console.log('✅ Editor restarted');
                setTimeout(() => {
                    const iframe = document.getElementById('editor-iframe');
                    iframe.src = '';
                    checkEditorHealth();
                }, 3000);
            } else {
                console.error('❌ Restart failed:', data.error || data.stderr);
                alert('Restart failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Failed to restart editor:', error);
            alert('Restart failed: ' + error.message);
        } finally {
            const btn = document.getElementById('btn-editor-restart');
            btn.disabled = false;
            btn.innerHTML = '↻ Restart';
        }
    }

    // Initialize editor health check when editor tab is activated
    window.initEditorHealthCheck = function() {
        console.log('[Editor] initEditorHealthCheck called');
        if (!editorHealthInterval) {
            console.log('[Editor] Starting health check interval');
            checkEditorHealth();
            editorHealthInterval = setInterval(checkEditorHealth, 10000);
        } else {
            console.log('[Editor] Health check already running');
        }
    };

    // Stop editor health check when leaving editor
    window.stopEditorHealthCheck = function() {
        if (editorHealthInterval) {
            clearInterval(editorHealthInterval);
            editorHealthInterval = null;
        }
    };

    const btnOpenWindow = document.getElementById('btn-editor-open-window');
    const btnCopyUrl = document.getElementById('btn-editor-copy-url');
    const btnRestart = document.getElementById('btn-editor-restart');

    if (btnOpenWindow) btnOpenWindow.addEventListener('click', openEditorWindow);
    if (btnCopyUrl) btnCopyUrl.addEventListener('click', copyEditorUrl);
    if (btnRestart) btnRestart.addEventListener('click', restartEditor);
    // Ensure init runs even if DOMContentLoaded already fired (scripts at body end)
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Decide v1 (client) vs v2 (server) auto-profile
    async function onWizardOneClick(e){
        try{
            const v2 = document.getElementById('apv2-enabled');
            if (v2 && v2.checked && window.AutoProfileV2 && typeof window.AutoProfileV2.run === 'function'){
                e.preventDefault();
                await window.AutoProfileV2.run();
                return;
            }
        }catch{}
        return triChooseAndApply();
    }

    // ---------------- Global Search (live) ----------------
    // Delegated to Search module (gui/js/search.js)
    const bindGlobalSearchLive = window.Search?.bindGlobalSearchLive || (() => {});

    // ---------------- MCP RAG Search (debug) ----------------
    function bindMcpRagSearch() {
        const btn = document.getElementById('btn-mcp-rag-run');
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', async () => {
            const qEl = document.getElementById('mcp-rag-q');
            const repoEl = document.getElementById('mcp-rag-repo');
            const topkEl = document.getElementById('mcp-rag-topk');
            const localEl = document.getElementById('mcp-rag-local');
            const out = document.getElementById('mcp-rag-results');
            if (!qEl || !out) return;
            const q = (qEl.value || '').trim();
            if (!q) { out.textContent = 'Please enter a question.'; return; }
            // Fallbacks from config if fields are empty
            const repo = (repoEl && repoEl.value) ? repoEl.value.trim() : ((state.config && state.config.env && state.config.env.REPO) ? state.config.env.REPO : 'agro');
            const top_k = parseInt((topkEl && topkEl.value) ? String(topkEl.value) : '10', 10) || 10;
            const force_local = (localEl && String(localEl.value) === 'true') ? 'true' : 'false';
            try {
                out.textContent = 'Running rag_search...';
                const qs = new URLSearchParams({ q, top_k: String(top_k), force_local });
                if (repo) qs.set('repo', repo);
                const r = await fetch(api(`/api/mcp/rag_search?${qs.toString()}`));
                const d = await r.json();
                if (d && Array.isArray(d.results)) {
                    const lines = d.results.map(x => `${x.file_path}:${x.start_line}-${x.end_line}  score=${Number(x.rerank_score||0).toFixed(3)}`);
                    out.textContent = lines.join('\n');
                } else if (d && d.error) {
                    out.textContent = `Error: ${d.error}`;
                } else {
                    out.textContent = JSON.stringify(d, null, 2);
                }
            } catch (e) {
                out.textContent = `Request failed: ${e.message}`;
            }
        });
        // Pre-fill repo field from env on load
        try {
            const repoEl = document.getElementById('mcp-rag-repo');
            if (repoEl && state.config && state.config.env && state.config.env.REPO) {
                repoEl.value = state.config.env.REPO;
            }
        } catch {}
    }

    // ---------------- LangSmith (Preview) ----------------
    function bindLangSmithViewer() {
        const btn = document.getElementById('btn-ls-latest');
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        const projEl = document.getElementById('ls-project');
        if (projEl && state.config && state.config.env && state.config.env.LANGCHAIN_PROJECT) {
            projEl.value = state.config.env.LANGCHAIN_PROJECT;
        }
        btn.addEventListener('click', async () => {
            const proj = projEl && projEl.value ? projEl.value.trim() : '';
            const shareSel = document.getElementById('ls-share');
            const share = shareSel && String(shareSel.value) === 'false' ? 'false' : 'true';
            const qs = new URLSearchParams({ share });
            if (proj) qs.set('project', proj);
            const wrap = document.getElementById('ls-embed-wrap');
            const frame = document.getElementById('ls-iframe');
            const link = document.getElementById('ls-open');
            const note = document.getElementById('ls-note');
            try {
                if (frame) frame.src = 'about:blank';
                const r = await fetch(api(`/api/langsmith/latest?${qs.toString()}`));
                const d = await r.json();
                if (d && d.url) {
                    if (link) { link.href = d.url; link.style.display = 'inline-block'; }
                    if (frame) {
                        frame.src = d.url;
                        // If embedding is blocked, we still have the link
                        frame.addEventListener('error', () => { if (note) note.style.display = 'block'; }, { once: true });
                        setTimeout(()=>{ if (note) note.style.display = 'block'; }, 1500);
                    }
                } else {
                    if (note) { note.style.display = 'block'; note.textContent = 'No recent LangSmith run found or URL unavailable.'; }
                }
            } catch (e) {
                if (note) { note.style.display = 'block'; note.textContent = 'Failed to load LangSmith run: ' + e.message; }
            }
        });
    }

    // ---------------- Autotune ----------------
    // Delegated to Autotune module (gui/js/autotune.js)
    const refreshAutotune = window.Autotune?.refreshAutotune || (async () => {});

    // ---------------- Dashboard Summary ----------------
    async function refreshDashboard() {
        try {
            const c = state.config || (await (await fetch(api('/api/config'))).json());
            const repo = (c.env && (c.env.REPO || c.default_repo)) || '(none)';
            const reposCount = (c.repos || []).length;
            const dr = document.getElementById('dash-repo'); if (dr) dr.textContent = `${repo} (${reposCount} repos)`;
        } catch {}

        try {
            const h = await (await fetch(api('/health'))).json();
            const dh = document.getElementById('dash-health'); if (dh) dh.textContent = `${h.status}${h.graph_loaded? ' (graph ready)':''}`;
        } catch {}

        try {
            const a = await (await fetch(api('/api/autotune/status'))).json();
            const da = document.getElementById('dash-autotune'); if (da) da.textContent = a.enabled ? (a.current_mode || 'enabled') : 'disabled';
        } catch { const da = document.getElementById('dash-autotune'); if (da) da.textContent = 'Pro required'; }

        try {
            const cards = await (await fetch(api('/api/cards'))).json();
            const dc = document.getElementById('dash-cards'); if (dc) dc.textContent = `${cards.count || 0} cards`;
        } catch {}

        try {
            const env = (state.config && state.config.env) || {};
            const host = env.MCP_HTTP_HOST || '0.0.0.0';
            const port = env.MCP_HTTP_PORT || '8013';
            const path = env.MCP_HTTP_PATH || '/mcp';
            const dm = document.getElementById('dash-mcp'); if (dm) dm.textContent = `${host}:${port}${path}`;
        } catch {}

        // Load initial index status to show metadata
        try {
            await pollIndexStatus();
        } catch {}
    }

    // ---------------- Cards Viewer ----------------
    async function loadCards() {
        try {
            const resp = await fetch(api('/api/cards'));
            const data = await resp.json();
            const cards = Array.isArray(data.cards) ? data.cards : [];
            const last = data.last_build || null;
            const lastBox = document.getElementById('cards-last-build');
            if (lastBox) {
                if (last && last.started_at) {
                    const when = new Date(last.started_at).toLocaleString();
                    const cnt = (last.result && last.result.cards_written) ? ` • ${last.result.cards_written} updated` : '';
                    const dur = (last.result && typeof last.result.duration_s==='number') ? ` • ${last.result.duration_s}s` : '';
                    lastBox.textContent = `Last build: ${when}${cnt}${dur}`;
                    lastBox.style.display = 'block';
                } else {
                    lastBox.style.display = 'none';
                }
            }
            const cardsContainer = document.getElementById('cards-viewer');
            if (cardsContainer) {
                cardsContainer.innerHTML = cards.length === 0 ?
                    `<div style="text-align: center; padding: 24px; color: #666;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.3; margin-bottom: 12px;">
                            <rect x="3" y="4" width="18" height="16" rx="2" ry="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="9" y1="4" x2="9" y2="20"></line>
                        </svg>
                        <div>No cards available</div>
                        <div style="font-size: 11px; margin-top: 8px;">Click "Build Cards" to generate code cards</div>
                    </div>` :
                    cards.map(card => `
                        <div class="card-item" data-filepath="${card.file_path}" data-line="${card.start_line || 1}"
                             style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; padding: 12px; cursor: pointer; transition: all 0.2s;"
                             onmouseover="this.style.borderColor='#00ff88'; this.style.background='#1f1f1f';"
                             onmouseout="this.style.borderColor='#2a2a2a'; this.style.background='#1a1a1a';">
                            <h4 style="margin: 0 0 8px 0; color: #00ff88; font-size: 14px; font-weight: 600;">
                                ${(card.symbols && card.symbols[0]) ? card.symbols[0] : (card.file_path || '').split('/').slice(-1)[0]}
                            </h4>
                            <p style="margin: 0 0 8px 0; color: #aaa; font-size: 12px; line-height: 1.4;">
                                ${card.purpose || 'No description available'}
                            </p>
                            <div style="font-size: 10px; color: #666;">
                                <span style="color: #5b9dff;">${card.file_path || 'Unknown file'}</span>
                                ${card.start_line ? ` : ${card.start_line}` : ''}
                            </div>
                        </div>
                    `).join('');

                // Add click event listeners to cards
                document.querySelectorAll('.card-item[data-filepath]').forEach(card => {
                    card.addEventListener('click', function() {
                        const filePath = this.dataset.filepath;
                        const lineNumber = this.dataset.line;
                        jumpToLine(filePath, lineNumber);
                    });
                });
            }
        } catch (error) {
            console.error('Error loading cards:', error);
            const cardsContainer = document.getElementById('cards-viewer');
            if (cardsContainer) {
                cardsContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: #ff5555;">
                    Error loading cards: ${error.message}
                </div>`;
            }
        }
    }

    function jumpToLine(filePath, lineNumber) {
        // Enhanced navigation with visual feedback
        console.log(`📍 Navigate to: ${filePath}:${lineNumber}`);

        // Visual feedback
        const event = new CustomEvent('cardNavigation', {
            detail: { file: filePath, line: lineNumber }
        });
        window.dispatchEvent(event);

        // You can add VSCode or other IDE integration here
        // For now, show in a notification style
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: #1a1a1a; border: 1px solid #00ff88;
            padding: 12px 16px; border-radius: 6px;
            color: #fff; font-size: 13px; z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #00ff88;">📍</span>
                <span>Navigate to: <strong style="color: #5b9dff;">${filePath}:${lineNumber}</strong></span>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // Add refresh and build handlers
    async function refreshCards() {
        console.log('Refreshing cards...');
        await loadCards();
    }

    async function buildCards() {
        try {
            const btn = document.getElementById('btn-cards-build');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Building Cards...';
            }

            const resp = await fetch(api('/api/cards/build'), { method: 'POST' });
            const data = await resp.json();

            if (data.success || data.status === 'success') {
                console.log('✅ Cards built successfully');
                await loadCards(); // Reload the cards
            } else {
                console.error('❌ Failed to build cards:', data.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error building cards:', error);
        } finally {
            const btn = document.getElementById('btn-cards-build');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span style="margin-right: 4px;">⚡</span> Build Cards';
            }
        }
    }

    try {
        window.jumpToLine = jumpToLine;
        window.refreshCards = refreshCards;
        window.buildCards = buildCards;
    } catch {}

    // Call loadCards on page load
    document.addEventListener('DOMContentLoaded', () => {
        loadCards();

        // Add button event listeners
        const btnRefresh = document.getElementById('btn-cards-refresh');
        const btnBuild = document.getElementById('btn-cards-build');

        if (btnRefresh) {
            btnRefresh.addEventListener('click', refreshCards);
        }

        if (btnBuild) {
            btnBuild.addEventListener('click', buildCards);
        }
    });

    // ---------------- Help Tooltips ----------------
    function addHelpTooltips() {
        const HELP = {
            // Generation
            GEN_MODEL: 'Primary inference model for generation (e.g., gpt-4o-mini or qwen3-coder:14b).',
            OPENAI_API_KEY: 'API key for OpenAI-compatible endpoints (generation/embeddings).',
            OPENAI_BASE_URL: 'Optional OpenAI-compatible base URL (vLLM/proxy).',
            OLLAMA_URL: 'Local model endpoint (Ollama or MLX serve).',
            ENRICH_MODEL: 'Model used to enrich code chunks before embedding (text summaries).',
            ENRICH_MODEL_OLLAMA: 'Local enrich model for Ollama/MLX.',
            GEN_MODEL_HTTP: 'Override GEN_MODEL for HTTP server responses only.',
            GEN_MODEL_MCP: 'Override GEN_MODEL for MCP tool responses only.',
            GEN_MODEL_CLI: 'Override GEN_MODEL for CLI chat only.',
            ENRICH_BACKEND: 'Force enrich backend (mlx or ollama).',

            // Embeddings
            EMBEDDING_TYPE: 'Embedding provider for dense vector search (openai, voyage, mxbai, local).',
            VOYAGE_API_KEY: 'API key for Voyage embeddings.',
            VOYAGE_EMBED_DIM: 'Output dimension for Voyage embeddings.',
            EMBEDDING_DIM: 'Embedding dimension for MXBAI/local models.',
            SKIP_DENSE: 'If 1, skip building dense vectors/Qdrant (sparse-only).',
            ENRICH_CODE_CHUNKS: 'If true, store per-chunk summaries/keywords before embedding.',

            // Reranking
            RERANK_BACKEND: 'Cross-encoder reranking backend: local, hf, cohere, or none.',
            RERANKER_MODEL: 'Local/HF cross-encoder model (e.g., BAAI/bge-reranker-v2-m3).',
            COHERE_API_KEY: 'API key for Cohere reranking.',
            COHERE_RERANK_MODEL: 'Cohere reranker model (e.g., rerank-3.5).',
            TRANSFORMERS_TRUST_REMOTE_CODE: 'Allow HF models that require remote code.',

            // Retrieval
            MQ_REWRITES: 'Multi-query expansion count (more rewrites → better recall, more cost).',
            FINAL_K: 'Final top-K after fusion + rerank (downstream consumers use these).',
            TOPK_DENSE: 'Number of dense candidates (Qdrant) to fuse.',
            TOPK_SPARSE: 'Number of sparse candidates (BM25) to fuse.',
            HYDRATION_MODE: 'lazy: hydrate code snippets on demand; none: skip hydration.',
            HYDRATION_MAX_CHARS: 'Max characters per hydrated code snippet.',
            VENDOR_MODE: 'Prefer first-party or vendor paths when scoring files.',
            project_PATH_BOOSTS: 'CSV of path substrings to boost (e.g., app/,lib/,config/).',
            CARDS_MAX: 'Limit number of cards used for boosting (0 = all).',

            // Confidence
            CONF_TOP1: 'Accept answer if top-1 rerank score exceeds this threshold.',
            CONF_AVG5: 'Accept if average of top-5 rerank scores exceeds this threshold.',
            CONF_ANY: 'Accept if overall confidence exceeds this fallback threshold.',

            // Infra
            QDRANT_URL: 'Qdrant endpoint for vector search.',
            REDIS_URL: 'Redis for LangGraph memory/checkpointer.',
            REPO: 'Active repository tag for routing and output directories.',
            COLLECTION_SUFFIX: 'Optional suffix to group collections in Qdrant.',
            COLLECTION_NAME: 'Override Qdrant collection name.',
            REPO_PATH: 'Fallback path when repos.json is absent.',
            REPO_ROOT: 'Override project root. Affects GUI/docs/files mounts.',
            FILES_ROOT: 'Root directory served at /files.',
            GUI_DIR: 'Directory of GUI assets served at /gui.',
            DOCS_DIR: 'Directory of docs served at /docs.',
            DATA_DIR: 'Directory for local data files (excludes, keywords).',
            REPOS_FILE: 'Path to repos.json configuration file.',
            OUT_DIR_BASE: 'Base output directory for per-repo data.',
            RAG_OUT_BASE: 'Alternate env for OUT_DIR_BASE.',
            MCP_HTTP_HOST: 'Host for MCP HTTP server.',
            MCP_HTTP_PORT: 'Port for MCP HTTP server.',
            MCP_HTTP_PATH: 'Path prefix for MCP HTTP server.',

            // Misc
            AGRO_EDITION: 'Edition gate (oss, pro, enterprise). Pro/Enterprise unlock Autotune/Compat.',
            THREAD_ID: 'LangGraph thread id (http or cli-chat).',
            PORT: 'Uvicorn port for serve entrypoints.',
            PROJECT_PATH: 'Optional reference path used by some helpers.',
            LANGCHAIN_TRACING_V2: 'Enable tracing for LangChain-compatible tooling.',
            LANGCHAIN_PROJECT: 'Tracing project name.',
            NETLIFY_API_KEY: 'Key for Netlify actions (if used).',
            NETLIFY_DOMAINS: 'Comma-separated domains for Netlify deploy (if used).',
        };
        $$('.settings-section .input-group').forEach(g=>{
            const label = g.querySelector('label'); const input = g.querySelector('input,select,textarea');
            if (!label || !input) return; const key = input.name || input.id; const help = HELP[key];
            if (!help) return; if (label.querySelector('.help')) return;
            const tip = document.createElement('span'); tip.className='help'; tip.title = help; tip.textContent='?';
            label.appendChild(tip);
        });
    }

    // ---------- Numbers formatting + per‑day converters ----------
    // Number formatting functions - delegated to UiHelpers module
    const getNum = window.UiHelpers?.getNum || ((id) => 0);
    const setNum = window.UiHelpers?.setNum || (() => {});
    const attachCommaFormatting = window.UiHelpers?.attachCommaFormatting || (() => {});
    const wireDayConverters = window.UiHelpers?.wireDayConverters || (() => {});

    async function setAutotuneEnabled() {
        try {
            const enabled = document.getElementById('autotune-enabled').checked;
            const r = await fetch(api('/api/autotune/status'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled, current_mode: null })
            });
            if (!r.ok) {
                if (r.status === 403 || r.status === 402) {
                    alert('Autotune is a Pro feature. Enable it by setting Edition to "pro" (Misc section) or PRO_ENABLED=1.');
                    $('#autotune-enabled').checked = false;
                    return;
                }
                throw new Error('HTTP ' + r.status);
            }
            await refreshAutotune();
        } catch (e) {
            alert('Failed to set Auto‑Tune: ' + e.message);
        }
    }

    // ---------------- Keywords ----------------
    // Delegated to Keywords module (gui/js/keywords.js)
    const loadKeywords = window.Keywords?.loadKeywords || (async () => {});

    // ---------------- Indexing + Cards ----------------
    let indexPoll = null;
    function progressFromLog(lines) {
        const text = (lines||[]).join(' ');
        let pct = 5;
        if (/Prepared \d+ chunks/i.test(text)) pct = 20;
        if (/BM25 index saved/i.test(text)) pct = 60;
        if (/Indexed \d+ chunks to Qdrant/i.test(text)) pct = 100;
        return pct;
    }

    async function startIndexing() {
        try {
            showStatus('Starting indexer...', 'loading');
            await fetch(api('/api/index/start'), { method: 'POST' });
            if (indexPoll) clearInterval(indexPoll);
            indexPoll = setInterval(pollIndexStatus, 800);
            await pollIndexStatus();
        } catch (e) {
            showStatus('Failed to start indexer: ' + e.message, 'error');
            throw e;
        }
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    function formatIndexStatus(lines, metadata) {
        if (!metadata) {
            if (!lines || !lines.length) return '<div style="color:#666;font-size:13px;">Ready to index...</div>';
            return `<div style="color:#aaa;font-size:12px;">${lines.join('<br>')}</div>`;
        }

        // Enterprise-grade comprehensive display
        const html = [];

        // Header with repo/branch
        html.push(`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #2a2a2a;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:6px;height:6px;border-radius:50%;background:#00ff88;box-shadow:0 0 8px #00ff88;"></div>
                    <div>
                        <div style="font-size:16px;font-weight:600;color:#fff;letter-spacing:-0.3px;">${metadata.current_repo}</div>
                        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">
                            Branch: <span style="color:#5b9dff;">${metadata.current_branch}</span>
                        </div>
                    </div>
                </div>
                <div style="text-align:right;font-size:10px;color:#666;">
                    ${new Date(metadata.timestamp).toLocaleString()}
                </div>
            </div>
        `);

        // Configuration section
        html.push(`
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <div style="background:#0a0a0a;padding:12px;border-radius:6px;border:1px solid #2a2a2a;">
                    <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Embedding Model</div>
                    <div style="font-size:14px;font-weight:600;color:#b794f6;font-family:'SF Mono',monospace;">${metadata.embedding_model}</div>
                </div>
                <div style="background:#0a0a0a;padding:12px;border-radius:6px;border:1px solid #2a2a2a;">
                    <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Keywords</div>
                    <div style="font-size:14px;font-weight:600;color:#ff9b5e;font-family:'SF Mono',monospace;">${metadata.keywords_count.toLocaleString()}</div>
                </div>
            </div>
        `);

        // Index profiles section
        if (metadata.repos && metadata.repos.length > 0) {
            html.push(`<div style="margin-bottom:12px;"><div style="font-size:11px;font-weight:600;color:#00ff88;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Index Profiles</div>`);

            metadata.repos.forEach(repo => {
                const totalSize = (repo.sizes.chunks || 0) + (repo.sizes.bm25 || 0) + (repo.sizes.cards || 0);

                html.push(`
                    <div style="background:#0f0f0f;border:1px solid ${repo.has_cards ? '#006622' : '#2a2a2a'};border-radius:6px;padding:12px;margin-bottom:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
                            <div>
                                <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px;">
                                    ${repo.name} <span style="font-size:10px;color:#666;font-weight:400;">/ ${repo.profile}</span>
                                </div>
                                <div style="font-size:11px;color:#666;">
                                    ${repo.chunk_count.toLocaleString()} chunks
                                    ${repo.has_cards ? ' • <span style="color:#00ff88;">✓ Cards</span>' : ' • <span style="color:#666;">No cards</span>'}
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:14px;font-weight:600;color:#00ff88;font-family:'SF Mono',monospace;">
                                    ${formatBytes(totalSize)}
                                </div>
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:10px;">
                            ${repo.paths.chunks ? `
                                <div style="background:#0a0a0a;padding:6px 8px;border-radius:4px;border:1px solid #1a1a1a;">
                                    <div style="color:#888;margin-bottom:2px;">Chunks</div>
                                    <div style="color:#5b9dff;font-family:'SF Mono',monospace;font-size:11px;">${formatBytes(repo.sizes.chunks)}</div>
                                </div>
                            ` : ''}
                            ${repo.paths.bm25 ? `
                                <div style="background:#0a0a0a;padding:6px 8px;border-radius:4px;border:1px solid #1a1a1a;">
                                    <div style="color:#888;margin-bottom:2px;">BM25 Index</div>
                                    <div style="color:#ff9b5e;font-family:'SF Mono',monospace;font-size:11px;">${formatBytes(repo.sizes.bm25)}</div>
                                </div>
                            ` : ''}
                            ${repo.paths.cards ? `
                                <div style="background:#0a0a0a;padding:6px 8px;border-radius:4px;border:1px solid #1a1a1a;">
                                    <div style="color:#888;margin-bottom:2px;">Cards</div>
                                    <div style="color:#00ff88;font-family:'SF Mono',monospace;font-size:11px;">${formatBytes(repo.sizes.cards)}</div>
                                </div>
                            ` : ''}
                        </div>
                        ${repo.paths.chunks ? `
                            <details style="margin-top:8px;">
                                <summary style="cursor:pointer;font-size:10px;color:#666;padding:4px 0;">
                                    <span style="color:#5b9dff;">▸</span> File Paths
                                </summary>
                                <div style="margin-top:6px;padding:8px;background:#0a0a0a;border-radius:4px;font-size:10px;font-family:'SF Mono',monospace;color:#888;">
                                    ${repo.paths.chunks ? `<div style="margin-bottom:2px;">📄 ${repo.paths.chunks}</div>` : ''}
                                    ${repo.paths.bm25 ? `<div style="margin-bottom:2px;">📁 ${repo.paths.bm25}</div>` : ''}
                                    ${repo.paths.cards ? `<div>🎴 ${repo.paths.cards}</div>` : ''}
                                </div>
                            </details>
                        ` : ''}
                    </div>
                `);
            });

            html.push(`</div>`);
        }

        // Total storage footer
        html.push(`
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid #2a2a2a;">
                <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Total Index Storage</div>
                <div style="font-size:18px;font-weight:700;color:#00ff88;font-family:'SF Mono',monospace;">
                    ${formatBytes(metadata.total_storage)}
                </div>
            </div>
        `);

        return html.join('');
    }

    async function pollIndexStatus() {
        try {
            const r = await fetch(api('/api/index/status'));
            const d = await r.json();
            const box1 = document.getElementById('index-status');
            const bar1 = document.getElementById('index-bar');
            const box2 = document.getElementById('dash-index-status');
            const bar2 = document.getElementById('dash-index-bar');
            const lastIndexedDisplay = document.getElementById('last-indexed-display');

            // Use the new comprehensive display if available
            const formatted = (typeof window.formatIndexStatusDisplay === 'function')
                ? window.formatIndexStatusDisplay(d.lines, d.metadata)
                : formatIndexStatus(d.lines, d.metadata);

            const pct = d.running ? 50 : (d.metadata ? 100 : 0);
            if (box1) box1.innerHTML = formatted;
            if (bar1) bar1.style.width = pct + '%';
            if (box2) box2.innerHTML = formatted;
            if (bar2) bar2.style.width = pct + '%';

            // Update last indexed timestamp in sidebar
            if (lastIndexedDisplay && d.metadata && d.metadata.timestamp) {
                const date = new Date(d.metadata.timestamp);
                lastIndexedDisplay.textContent = date.toLocaleString();
            }

            if (!d.running && indexPoll) {
                clearInterval(indexPoll);
                indexPoll = null;
                // Final complete animation
                if (bar2) {
                    setTimeout(() => { bar2.style.width = '0%'; }, 2000);
                }
            }
        } catch (e) { /* ignore */ }
    }

    // ---------------- Cards Builder (Job + SSE) ----------------
    let cardsJob = { id: null, timer: null, sse: null };
    let tipsTimer = null;
    function openCardsModal() {
        const m = document.getElementById('cards-builder-modal'); if (!m) return;
        m.style.display = 'block';
        const err = document.getElementById('cards-builder-error'); if (err) err.style.display = 'none';
        const logs = document.getElementById('cards-logs-view'); if (logs) logs.style.display = 'none';
        [
            'scan','chunk','sparse','dense','summarize','write','finalize'
        ].forEach(s => { const el = document.getElementById('cards-stage-'+s); if (el) { el.style.color='#aaa'; el.style.borderColor='#2a2a2a'; el.style.background='transparent'; }});
        const mainBar = document.getElementById('cards-main-bar'); if (mainBar) mainBar.style.width = '0%';
        const stats = document.getElementById('cards-progress-stats'); if (stats) stats.textContent = '0 / 0 (0%)';
        // Bind controls once
        const minBtn = document.getElementById('cards-builder-min'); if (minBtn && !minBtn.dataset.bound) { minBtn.dataset.bound='1'; minBtn.addEventListener('click', () => { m.style.display='none'; showStatus('Cards Builder minimized', 'info'); }); }
        const closeBtn = document.getElementById('cards-builder-close'); if (closeBtn && !closeBtn.dataset.bound) { closeBtn.dataset.bound='1'; closeBtn.addEventListener('click', () => { m.style.display='none'; stopCardsStreams(); }); }
        const viewLogs = document.getElementById('cards-view-logs'); if (viewLogs && !viewLogs.dataset.bound) { viewLogs.dataset.bound='1'; viewLogs.addEventListener('click', async () => { try { const r = await fetch(api('/api/cards/build/logs')); const d = await r.json(); const pre = document.getElementById('cards-logs-view'); if (pre) { pre.textContent = d.content || ''; pre.style.display = 'block'; } } catch(e) { alert('Unable to load logs'); } }); }
        const cancelBtn = document.getElementById('cards-cancel'); if (cancelBtn && !cancelBtn.dataset.bound) { cancelBtn.dataset.bound='1'; cancelBtn.addEventListener('click', async () => { if (!cardsJob.id) return; try { await fetch(api('/api/cards/build/cancel/'+cardsJob.id), { method: 'POST' }); showStatus('Cards build cancelled', 'warn'); } catch (e) { showStatus('Cancel failed: '+e.message, 'error'); } }); }
    }

    function highlightStage(stage) {
        const all = ['scan','chunk','sparse','dense','summarize','write','finalize'];
        all.forEach(s => { const el = document.getElementById('cards-stage-'+s); if (el) { el.style.color = (s===stage? '#fff':'#aaa'); el.style.borderColor = (s===stage?'#00ff88':'#2a2a2a'); el.style.background = (s===stage?'#0f1a14':'transparent'); }});
    }

    function updateCardsModal(data) {
        try {
            const { pct, total, done, tip, model, stage, throughput, eta_s } = data || {};
            const bar = document.getElementById('cards-main-bar'); if (bar) bar.style.width = `${pct||0}%`;
            const stats = document.getElementById('cards-progress-stats'); if (stats) stats.textContent = `${done||0} / ${total||0} (${(pct||0).toFixed(1)}%) • ${throughput||''} • ETA ${eta_s||0}s`;
            const tipEl = document.getElementById('cards-quick-tip'); if (tipEl && tip) tipEl.textContent = tip;
            highlightStage(stage);
            const e1 = document.getElementById('cards-model-embed'); if (e1 && model && model.embed) e1.textContent = `embed: ${model.embed}`;
            const e2 = document.getElementById('cards-model-enrich'); if (e2 && model && model.enrich) e2.textContent = `enrich: ${model.enrich}`;
            const e3 = document.getElementById('cards-model-rerank'); if (e3 && model && model.rerank) e3.textContent = `rerank: ${model.rerank}`;
        } catch {}
    }

    function stopCardsStreams() {
        if (cardsJob.timer) { clearInterval(cardsJob.timer); cardsJob.timer = null; }
        if (cardsJob.sse) { try { cardsJob.sse.close(); } catch{} cardsJob.sse = null; }
    }

    async function startCardsBuild(repoOverride=null) {
        try {
            openCardsModal();
            const enrich = document.getElementById('cards-enrich-toggle')?.checked ? 1 : 0;
            const repo = repoOverride || (state?.config?.env?.REPO) || 'agro';
            const r = await fetch(api(`/api/cards/build/start?repo=${encodeURIComponent(repo)}&enrich=${enrich}`), { method: 'POST' });
            if (r.status === 409) {
                const d = await r.json();
                const err = document.getElementById('cards-builder-error'); if (err) { err.style.display='block'; err.textContent = d.detail || 'Job already running'; }
                return;
            }
            const d = await r.json();
            cardsJob.id = d.job_id;
            showStatus('Cards build started…', 'loading');
            // Set up SSE with fallback
            try {
                const es = new EventSource(api(`/api/cards/build/stream/${cardsJob.id}`));
                cardsJob.sse = es;
                es.addEventListener('progress', (ev) => { try { const data = JSON.parse(ev.data||'{}'); updateCardsModal(data); } catch{} });
                es.addEventListener('done', async (ev) => { stopCardsStreams(); updateCardsModal(JSON.parse(ev.data||'{}')); showStatus('Cards rebuilt', 'success'); await loadCards(); });
                es.addEventListener('error', (ev) => { /* will use polling fallback */ });
                es.addEventListener('cancelled', (ev) => { stopCardsStreams(); const e = document.getElementById('cards-builder-error'); if (e){ e.style.display='block'; e.textContent='Cancelled'; } });
            } catch (e) {
                // SSE not available; use polling
                cardsJob.timer = setInterval(async () => {
                    try { const s = await (await fetch(api(`/api/cards/build/status/${cardsJob.id}`))).json(); updateCardsModal(s); if ((s.status||'')==='done'){ stopCardsStreams(); await loadCards(); showStatus('Cards rebuilt', 'success'); } if ((s.status||'')==='error'){ stopCardsStreams(); const er=document.getElementById('cards-builder-error'); if(er){er.style.display='block'; er.textContent=s.error||'Error';} showStatus('Cards build failed', 'error'); } } catch {}
                }, 1500);
            }
        } catch (e) {
            showStatus('Failed to start cards build: '+e.message, 'error');
        }
    }

    async function refreshCards() {
        try {
            showStatus('Refreshing dashboard...', 'loading');
            await refreshDashboard();
            showStatus('Dashboard refreshed', 'success');
        } catch (e) {
            showStatus('Failed to refresh: ' + e.message, 'error');
            throw e;
        }
    }

    // ---------------- Add Model Flows ----------------
    async function updateEnv(envUpdates) {
        try {
            await fetch(api('/api/config'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ env: envUpdates, repos: [] })
            });
        } catch (e) {
            alert('Failed to update config: ' + e.message);
        }
    }

    async function upsertPrice(entry) {
        try {
            await fetch(api('/api/prices/upsert'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
        } catch (e) {
            console.warn('Price upsert failed:', e);
        }
    }

    function promptStr(msg, defVal = '') {
        const v = window.prompt(msg, defVal);
        return v === null ? null : v.trim();
    }

    async function addGenModelFlow() {
        const provider = promptStr('Provider (openai, anthropic, google, local)', 'openai');
        if (!provider) return;
        const model = promptStr('Model ID (e.g., gpt-4o-mini or qwen3-coder:14b)', 'gpt-4o-mini');
        if (!model) return;
        const baseUrl = promptStr('Base URL (optional; for proxies or local, e.g., http://127.0.0.1:11434)', '');
        let apiKey = '';
        if (provider !== 'local') {
            apiKey = promptStr('API Key (optional; shown locally only)', '') || '';
        }

        // Update env
        const env = { GEN_MODEL: model };
        if (provider === 'openai') {
            if (apiKey) env.OPENAI_API_KEY = apiKey;
            if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        } else if (provider === 'anthropic') {
            if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
        } else if (provider === 'google') {
            if (apiKey) env.GOOGLE_API_KEY = apiKey;
        } else if (provider === 'local') {
            if (baseUrl) env.OLLAMA_URL = baseUrl;
        }
        await updateEnv(env);
        await loadConfig();

        // Price entry (scaffold)
        const entry = { provider, model, family: 'gen', base_url: baseUrl || undefined };
        if (provider === 'local') entry.unit = 'request'; else entry.unit = '1k_tokens';
        await upsertPrice(entry);
        await loadPrices();
        alert('Generation model added.');
    }

    async function addEmbedModelFlow() {
        const provider = promptStr('Embedding provider (openai, voyage, local, mxbai)', 'openai');
        if (!provider) return;
        const model = promptStr('Embedding model ID (optional; depends on provider)', provider === 'openai' ? 'text-embedding-3-small' : '');
        const baseUrl = promptStr('Base URL (optional)', '');
        let apiKey = '';
        if (provider !== 'local' && provider !== 'mxbai') {
            apiKey = promptStr('API Key (optional)', '') || '';
        }

        const env = {};
        if (provider === 'openai') {
            env.EMBEDDING_TYPE = 'openai';
            if (apiKey) env.OPENAI_API_KEY = apiKey;
            if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        } else if (provider === 'voyage') {
            env.EMBEDDING_TYPE = 'voyage';
            if (apiKey) env.VOYAGE_API_KEY = apiKey;
        } else if (provider === 'mxbai') {
            env.EMBEDDING_TYPE = 'mxbai';
        } else if (provider === 'local') {
            env.EMBEDDING_TYPE = 'local';
        }
        await updateEnv(env);
        await loadConfig();

        const entry = { provider, model: model || provider + '-embed', family: 'embed', base_url: baseUrl || undefined };
        entry.unit = '1k_tokens';
        await upsertPrice(entry);
        await loadPrices();
        alert('Embedding model added.');
    }

    async function addRerankModelFlow() {
        const provider = promptStr('Rerank provider (cohere, local, hf)', 'cohere');
        if (!provider) return;
        let model = promptStr('Rerank model ID (e.g., rerank-3.5 or BAAI/bge-reranker-v2-m3)', provider === 'cohere' ? 'rerank-3.5' : 'BAAI/bge-reranker-v2-m3');
        const baseUrl = promptStr('Base URL (optional)', '');
        let apiKey = '';
        if (provider === 'cohere') {
            apiKey = promptStr('Cohere API Key (optional)', '') || '';
        }

        const env = {};
        if (provider === 'cohere') {
            env.RERANK_BACKEND = 'cohere';
            env.COHERE_RERANK_MODEL = model;
            if (apiKey) env.COHERE_API_KEY = apiKey;
        } else if (provider === 'local') {
            env.RERANK_BACKEND = 'local';
            env.RERANKER_MODEL = model;
        } else if (provider === 'hf') {
            env.RERANK_BACKEND = 'hf';
            env.RERANKER_MODEL = model;
        }
        await updateEnv(env);
        await loadConfig();

        const entry = { provider, model, family: 'rerank', base_url: baseUrl || undefined };
        entry.unit = provider === 'cohere' ? '1k_tokens' : 'request';
        await upsertPrice(entry);
        await loadPrices();
        alert('Rerank model added.');
    }

    async function addCostModelFlow() {
        const provider = promptStr('Provider', 'openai');
        if (!provider) return;
        const model = promptStr('Model ID', 'gpt-4o-mini');
        if (!model) return;
        const baseUrl = promptStr('Base URL (optional)', '');
        const unit = promptStr('Unit (1k_tokens or request)', provider === 'local' ? 'request' : '1k_tokens') || '1k_tokens';
        await upsertPrice({ provider, model, family: 'misc', base_url: baseUrl || undefined, unit });
        await loadPrices();
        alert('Model added to pricing catalog.');
    }


    // ============================================
    // Onboarding Wizard Controller
    // ============================================

    const onboardingState = {
        step: 1,
        maxStep: 5,
        projectDraft: {
            sourceType: 'folder', // 'folder' or 'github'
            folderPath: '',
            githubUrl: '',
            githubBranch: 'main',
            githubToken: '',
            saveToken: false
        },
        indexing: {
            running: false,
            stage: 'idle', // 'idle', 'scan', 'keywords', 'smart'
            progress: 0
        },
        questions: [
            { text: 'Where is hybrid retrieval implemented?', answer: null },
            { text: 'Where are indexing settings?', answer: null },
            { text: 'How do I change the default model?', answer: null }
        ],
        settings: {
            speed: 2, // 1-4
            quality: 2, // 1-3
            cloud: 1 // 1-2
        }
    };

    function showOnboardStep(n) {
        if (n < 1 || n > onboardingState.maxStep) return;
        onboardingState.step = n;

        // Update progress dots
        $$('.ob-dot').forEach((dot, i) => {
            dot.classList.remove('active', 'completed');
            if (i + 1 === n) dot.classList.add('active');
            else if (i + 1 < n) dot.classList.add('completed');
        });

        // Update steps
        $$('.ob-step').forEach((step, i) => {
            step.classList.toggle('active', i + 1 === n);
        });

        // Update navigation
        const backBtn = $('#onboard-back');
        const nextBtn = $('#onboard-next');
        if (backBtn) backBtn.style.display = n === 1 ? 'none' : 'block';
        if (nextBtn) {
            nextBtn.textContent = n === onboardingState.maxStep ? 'Done' : 'Next →';
        }

        // Save progress to localStorage
        try {
            localStorage.setItem('onboarding_step', String(n));
            localStorage.setItem('onboarding_state', JSON.stringify(onboardingState));
        } catch (e) { /* ignore */ }
    }

    function nextOnboard() {
        if (onboardingState.step === onboardingState.maxStep) {
            // Done - switch to dashboard
            switchTab('dashboard');
            try { localStorage.removeItem('onboarding_step'); } catch {}
            return;
        }

        // Validation
        if (onboardingState.step === 2) {
            const mode = onboardingState.projectDraft.sourceType;
            if (mode === 'folder') {
                const path = $('#onboard-folder-path');
                if (path && !path.value.trim()) {
                    alert('Please select a folder or enter a path');
                    return;
                }
                onboardingState.projectDraft.folderPath = path ? path.value.trim() : '';
            } else if (mode === 'github') {
                const url = $('#onboard-github-url');
                if (url && !url.value.trim()) {
                    alert('Please enter a GitHub repository URL');
                    return;
                }
                onboardingState.projectDraft.githubUrl = url ? url.value.trim() : '';
                const branch = $('#onboard-github-branch');
                const token = $('#onboard-github-token');
                onboardingState.projectDraft.githubBranch = branch && branch.value.trim() ? branch.value.trim() : 'main';
                onboardingState.projectDraft.githubToken = token ? token.value.trim() : '';
            }
        }

        // Start indexing when entering step 3
        if (onboardingState.step === 2) {
            setTimeout(() => startIndexing(), 500);
        }

        showOnboardStep(onboardingState.step + 1);
    }

    function backOnboard() {
        if (onboardingState.step > 1) {
            showOnboardStep(onboardingState.step - 1);
        }
    }

    async function startIndexing() {
        onboardingState.indexing.running = true;
        const bar = $('#onboard-index-bar');
        const status = $('#onboard-index-status');
        const log = $('#onboard-index-log');
        const nextBtn = $('#onboard-next');

        if (nextBtn) nextBtn.disabled = true;

        // Stage 1: Light scan
        updateIndexStage('scan', 20);
        if (status) status.textContent = 'Scanning files...';
        await new Promise(r => setTimeout(r, 1000));

        // Stage 2: Keywords
        updateIndexStage('keywords', 50);
        if (status) status.textContent = 'Building keyword index...';

        try {
            const res = await fetch(api('/api/index/start'), { method: 'POST' });
            if (!res.ok) throw new Error('Failed to start indexing');

            // Poll status
            let running = true;
            while (running) {
                await new Promise(r => setTimeout(r, 2000));
                const statusRes = await fetch(api('/api/index/status'));
                const data = await statusRes.json();

                if (log && data.lines) {
                    log.textContent = data.lines.join('\n');
                    log.scrollTop = log.scrollHeight;
                }

                running = data.running !== false;

                if (!running) {
                    updateIndexStage('keywords', 70);
                    if (status) status.textContent = 'Building cards...';

                    // Build cards
                    await fetch(api('/api/cards/build'), { method: 'POST' });

                    // Stage 3: Smart search (attempt)
                    updateIndexStage('smart', 100);
                    if (status) status.textContent = 'Indexing complete!';

                    if (nextBtn) nextBtn.disabled = false;
                    onboardingState.indexing.running = false;
                }
            }
        } catch (err) {
            console.error('Indexing error:', err);
            if (status) status.textContent = 'Indexing completed with keyword-only mode';
            $('#onboard-index-fallback').style.display = 'block';
            if (bar) bar.style.width = '70%';
            if (nextBtn) nextBtn.disabled = false;
            onboardingState.indexing.running = false;
        }
    }

    function updateIndexStage(stage, progress) {
        onboardingState.indexing.stage = stage;
        onboardingState.indexing.progress = progress;

        const bar = $('#onboard-index-bar');
        if (bar) bar.style.width = progress + '%';

        $$('.ob-stage').forEach(el => {
            const s = el.getAttribute('data-stage');
            el.classList.remove('active', 'completed');
            if (s === stage) el.classList.add('active');
            else if (['scan', 'keywords'].indexOf(s) < ['scan', 'keywords', 'smart'].indexOf(stage)) {
                el.classList.add('completed');
            }
        });
    }

    async function askQuestion(qIndex) {
        const input = $(`#onboard-q${qIndex}`);
        const answerDiv = $(`#onboard-ans-${qIndex}`);
        const traceLink = $(`#onboard-trace-${qIndex}`);
        const btn = $(`.ob-ask-btn[data-q="${qIndex}"]`);

        if (!input || !answerDiv) return;

        const question = input.value.trim();
        if (!question) return;

        if (btn) btn.disabled = true;
        answerDiv.textContent = 'Thinking...';
        answerDiv.classList.add('visible');

        try {
            const repo = state.config && state.config.REPO ? state.config.REPO : 'agro';
            const res = await fetch(api('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, repo })
            });

            if (!res.ok) throw new Error('Failed to get answer');

            const data = await res.json();
            answerDiv.textContent = data.answer || 'No answer received';
            onboardingState.questions[qIndex - 1].answer = data.answer;

            if (traceLink) traceLink.style.display = 'inline-block';
        } catch (err) {
            console.error('Question error:', err);
            answerDiv.textContent = 'Error: ' + err.message;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function showTrace(qIndex) {
        const panel = $(`#onboard-trace-panel-${qIndex}`);
        if (!panel) return;

        if (panel.style.display === 'block') {
            panel.style.display = 'none';
            return;
        }

        panel.textContent = 'Loading trace...';
        panel.style.display = 'block';

        try {
            const res = await fetch(api('/api/traces/latest'));
            if (!res.ok) throw new Error('Failed to load trace');

            const data = await res.json();
            panel.textContent = JSON.stringify(data, null, 2);
        } catch (err) {
            panel.textContent = 'Error loading trace: ' + err.message;
        }
    }

    function updateSettingsSummary() {
        const summary = $('#onboard-summary-content');
        if (!summary) return;

        const { speed, quality, cloud } = onboardingState.settings;

        const speedMap = {
            1: 'MQ_REWRITES=1, LANGGRAPH_FINAL_K=10',
            2: 'MQ_REWRITES=2, LANGGRAPH_FINAL_K=15',
            3: 'MQ_REWRITES=3, LANGGRAPH_FINAL_K=20',
            4: 'MQ_REWRITES=4, LANGGRAPH_FINAL_K=25'
        };

        const qualityMap = {
            1: 'RERANK_BACKEND=none, GEN_MODEL=local',
            2: 'RERANK_BACKEND=local, GEN_MODEL=gpt-4o-mini',
            3: 'RERANK_BACKEND=cohere, GEN_MODEL=gpt-4o, CONF_TOP1=0.55'
        };

        const cloudMap = {
            1: 'EMBEDDING_TYPE=local, VECTOR_BACKEND=qdrant (local)',
            2: 'EMBEDDING_TYPE=openai, VECTOR_BACKEND=qdrant (cloud)'
        };

        summary.innerHTML = `
            <div>Speed: ${speedMap[speed] || 'default'}</div>
            <div>Quality: ${qualityMap[quality] || 'default'}</div>
            <div>Cloud: ${cloudMap[cloud] || 'default'}</div>
        `;
    }

    async function saveAsProject() {
        const name = prompt('Enter a name for this project:');
        if (!name || !name.trim()) return;

        const { speed, quality, cloud } = onboardingState.settings;

        const profile = {
            name: name.trim(),
            sources: onboardingState.projectDraft,
            settings: {
                MQ_REWRITES: speed,
                LANGGRAPH_FINAL_K: 10 + (speed * 5),
                RERANK_BACKEND: quality === 1 ? 'none' : (quality === 2 ? 'local' : 'cohere'),
                GEN_MODEL: quality === 1 ? 'local' : 'gpt-4o-mini',
                EMBEDDING_TYPE: cloud === 1 ? 'local' : 'openai'
            },
            golden: onboardingState.questions.map(q => q.text)
        };

        try {
            const res = await fetch(api('/api/profiles/save'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profile)
            });

            if (!res.ok) throw new Error('Failed to save project');

            alert('Project saved successfully!');

            // Apply profile
            await fetch(api('/api/profiles/apply'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile_name: name.trim() })
            });
        } catch (err) {
            console.error('Save project error:', err);
            alert('Error saving project: ' + err.message);
        }
    }

    async function runTinyEval() {
        const box = $('#onboard-eval-progress');
        const bar = $('#onboard-eval-bar');
        const status = $('#onboard-eval-status');
        const result = $('#onboard-eval-result');

        if (!box) return;

        box.style.display = 'block';
        if (status) status.textContent = 'Running evaluation...';
        if (bar) bar.style.width = '30%';

        try {
            await fetch(api('/api/eval/run'), { method: 'POST' });

            // Poll status
            let running = true;
            while (running) {
                await new Promise(r => setTimeout(r, 2000));
                const statusRes = await fetch(api('/api/eval/status'));
                const data = await statusRes.json();

                running = data.running === true;

                if (!running) {
                    if (bar) bar.style.width = '100%';
                    if (status) status.textContent = 'Evaluation complete';

                    // Get results
                    const resRes = await fetch(api('/api/eval/results'));
                    const resData = await resRes.json();

                    if (result && resData) {
                        const score = resData.top1_accuracy || resData.topk_accuracy || 0;
                        result.textContent = `Retrieval Score: ${(score * 100).toFixed(1)}%`;
                    }
                }
            }
        } catch (err) {
            console.error('Eval error:', err);
            if (status) status.textContent = 'Evaluation failed';
            if (result) result.textContent = 'Error: ' + err.message;
        }
    }

    async function askHelpQuestion() {
        const input = $('#onboard-help-input');
        const results = $('#onboard-help-results');
        const btn = $('#onboard-help-send');

        if (!input || !results) return;

        const question = input.value.trim();
        if (!question) return;

        // Show immediate loading feedback
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Asking...';
            btn.style.opacity = '0.6';
        }

        results.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--fg-muted);"><div style="width:16px;height:16px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div> Thinking...</div>';
        results.classList.add('visible');

        try {
            const repo = state.config && state.config.REPO ? state.config.REPO : 'agro';
            const res = await fetch(api('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, repo })
            });

            if (!res.ok) throw new Error('Failed to get answer');

            const data = await res.json();
            // Format answer as readable text, not code block
            const answer = (data.answer || 'No answer received').replace(/\n/g, '<br>');
            results.innerHTML = answer;
        } catch (err) {
            console.error('Help question error:', err);
            results.innerHTML = '<span style="color:var(--err);">Error: ' + err.message + '</span>';
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Ask';
                btn.style.opacity = '1';
            }
        }
    }

    function initOnboarding() {
        // Try to resume from localStorage
        try {
            const savedStep = localStorage.getItem('onboarding_step');
            const savedState = localStorage.getItem('onboarding_state');
            if (savedStep) {
                const step = parseInt(savedStep, 10);
                if (step >= 1 && step <= onboardingState.maxStep) {
                    onboardingState.step = step;
                }
            }
            if (savedState) {
                const parsed = JSON.parse(savedState);
                Object.assign(onboardingState, parsed);
            }
        } catch (e) { /* ignore */ }

        // Wire Step 1 - choice cards
        $$('.ob-card').forEach(card => {
            card.addEventListener('click', () => {
                const choice = card.getAttribute('data-choice');
                onboardingState.projectDraft.sourceType = choice;
                nextOnboard();
            });
        });

        // Wire Step 2 - mode tabs
        $$('.ob-mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.getAttribute('data-mode');
                onboardingState.projectDraft.sourceType = mode;

                $$('.ob-mode-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                $$('.ob-mode-content').forEach(c => c.classList.remove('active'));
                $(`#onboard-${mode}-mode`).classList.add('active');
            });
        });

        // Wire folder picker
        const folderBtn = $('#onboard-folder-btn');
        const folderPicker = $('#onboard-folder-picker');
        const folderDisplay = $('#onboard-folder-display');
        const folderPath = $('#onboard-folder-path');

        if (folderBtn && folderPicker) {
            folderBtn.addEventListener('click', () => folderPicker.click());

            folderPicker.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    const path = e.target.files[0].webkitRelativePath || e.target.files[0].path || '';
                    const folderName = path.split('/')[0] || 'Selected folder';
                    if (folderDisplay) folderDisplay.textContent = folderName;
                    if (folderPath) folderPath.value = folderName;
                }
            });
        }

        // Wire Step 4 - Ask buttons
        $$('.ob-ask-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const qIndex = parseInt(btn.getAttribute('data-q'), 10);
                askQuestion(qIndex);
            });
        });

        // Wire trace links
        for (let i = 1; i <= 3; i++) {
            const link = $(`#onboard-trace-${i}`);
            if (link) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    showTrace(i);
                });
            }
        }

        // Wire Step 4 - Save golden
        const saveGolden = $('#onboard-save-golden');
        if (saveGolden) {
            saveGolden.addEventListener('click', () => {
                alert('Golden questions saved! (Feature placeholder)');
            });
        }

        // Wire Step 5 - Sliders
        const speedSlider = $('#onboard-slider-speed');
        const qualitySlider = $('#onboard-slider-quality');
        const cloudSlider = $('#onboard-slider-cloud');

        [speedSlider, qualitySlider, cloudSlider].forEach(slider => {
            if (slider) {
                slider.addEventListener('input', () => {
                    if (speedSlider) onboardingState.settings.speed = parseInt(speedSlider.value, 10);
                    if (qualitySlider) onboardingState.settings.quality = parseInt(qualitySlider.value, 10);
                    if (cloudSlider) onboardingState.settings.cloud = parseInt(cloudSlider.value, 10);
                    updateSettingsSummary();
                });
            }
        });

        updateSettingsSummary();

        // Wire Step 5 - Actions
        const saveProject = $('#onboard-save-project');
        const runEval = $('#onboard-run-eval');

        if (saveProject) saveProject.addEventListener('click', saveAsProject);
        if (runEval) runEval.addEventListener('click', runTinyEval);

        // Wire help panel
        const helpSend = $('#onboard-help-send');
        if (helpSend) helpSend.addEventListener('click', askHelpQuestion);

        $$('.ob-help-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const q = pill.getAttribute('data-q');
                const input = $('#onboard-help-input');
                if (input && q) {
                    input.value = q;
                    askHelpQuestion();
                }
            });
        });

        const openChat = $('#onboard-open-chat');
        if (openChat) {
            openChat.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab('chat');
            });
        }

        // Wire navigation
        const backBtn = $('#onboard-back');
        const nextBtn = $('#onboard-next');

        if (backBtn) backBtn.addEventListener('click', backOnboard);
        if (nextBtn) nextBtn.addEventListener('click', nextOnboard);

        // Show current step
        showOnboardStep(onboardingState.step);
    }

    // Initialize onboarding when tab is first opened
    function ensureOnboardingInit() {
        if (!onboardingState._initialized) {
            initOnboarding();
            onboardingState._initialized = true;
        }
    }
})();
