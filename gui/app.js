// AGRO GUI app.js (complete with all handlers)
(function () {
    // Backend API base: respects ?api= override; defaults to local FastAPI
    const API_BASE = (() => {
        try {
            const u = new URL(window.location.href);
            const q = new URLSearchParams(u.search);
            const override = q.get('api');
            if (override) return override.replace(/\/$/, '');
            // Prefer same-origin whenever we were served over HTTP(S)
            if (u.protocol.startsWith('http')) return u.origin;
            // Fallback to local default
            return 'http://127.0.0.1:8012';
        } catch { return 'http://127.0.0.1:8012'; }
    })();
    // Expose the resolved API base for diagnostics
    try { window.API_BASE = API_BASE; } catch {}
    const api = (p) => `${API_BASE}${p}`;
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const state = {
        prices: null,
        config: null,
        profiles: [],
        defaultProfile: null,
    };

    // ---------------- Tabs ----------------
    let storageCalculatorLoaded = false;

    function loadStorageCalculator() {
        if (storageCalculatorLoaded) return;
        const container = document.getElementById('storage-calculator-container');
        if (!container) return;

        // Load the HTML template
        if (typeof getStorageCalculatorHTML === 'function') {
            container.innerHTML = getStorageCalculatorHTML();

            // Initialize the calculator
            if (typeof initStorageCalculator === 'function') {
                initStorageCalculator();
            }

            storageCalculatorLoaded = true;
        }
    }

    function switchTab(tabName) {
        const groups = {
            models: ['generation','embeddings','reranking'],
            retrieval: ['retrieval','confidence','cards'],
            repos: ['repos','indexing'],
            // Show full Tools group: base panel + eval + misc
            // Note: there is no 'tab-calculator' anymore; storage has its own tab
            tools: ['tools','eval','misc'],
            infra: ['infra'],
            dashboard: ['dashboard'],
            storage: ['storage']
        };
        const show = groups[tabName] || [tabName];
        $$('.tab-content').forEach(el => el.classList.remove('active'));
        show.forEach(id => { const el = document.getElementById(`tab-${id}`); if (el) el.classList.add('active'); });
        $$('.tab-bar button').forEach(el => el.classList.remove('active'));
        const btn = document.querySelector(`.tab-bar button[data-tab="${tabName}"]`);
        if (btn) btn.classList.add('active');

        // Load storage calculator when the tab is opened
        if (tabName === 'storage') {
            loadStorageCalculator();
        }
    }

    function bindTabs() {
        $$('.tab-bar button').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                switchTab(tab);
            });
        });
    }

    // ---------------- Tooltips (modular) ----------------
    // Delegates to external module /gui/js/tooltips.js

    // ---------------- Global Search ----------------
    function clearHighlights() { $$('.hl').forEach(m => { const t=document.createTextNode(m.textContent); m.replaceWith(t); }); }
    function highlightMatches(root, q) {
        if (!q) return; const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'ig');
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const hits = [];
        while (walker.nextNode()) {
            const n = walker.currentNode; if (!n.nodeValue || !n.parentElement) continue;
            if (/SCRIPT|STYLE|IFRAME/.test(n.parentElement.tagName)) continue;
            const m = n.nodeValue.match(rx); if (!m) continue;
            const span = document.createElement('mark'); span.className='hl'; span.textContent = n.nodeValue;
            const html = n.nodeValue.replace(rx, s => `<mark class="hl">${s}</mark>`);
            const frag = document.createElement('span'); frag.innerHTML = html;
            n.parentElement.replaceChild(frag, n);
            hits.push(frag.querySelector('mark.hl'));
        }
        return hits;
    }

    function bindGlobalSearch() {
        const box = document.getElementById('global-search');
        if (!box) return;
        function run(q, jump=false) {
            clearHighlights();
            if (!q) return;
            const hits = highlightMatches(document.querySelector('.content'), q);
            if (jump && hits && hits.length) hits[0].scrollIntoView({behavior:'smooth', block:'center'});
        }
        box.addEventListener('keydown', (e)=>{ if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); box.focus(); box.select(); }});
        box.addEventListener('input', ()=> run(box.value.trim()));
        box.addEventListener('keydown', (e)=>{ if (e.key==='Enter') run(box.value.trim(), true); });
    }

    // ---------------- Git Hooks ----------------
    async function refreshHooksStatus(){
        try{
            const d = await (await fetch(api('/api/git/hooks/status'))).json();
            const el = $('#hooks-status'); if (el) el.textContent = (d.post_checkout && d.post_commit) ? `Installed @ ${d.dir}` : 'Not installed';
        }catch{ const el=$('#hooks-status'); if(el) el.textContent='Status unavailable'; }
    }

    async function installHooks(){
        try{
            const r = await fetch(api('/api/git/hooks/install'), { method:'POST' });
            const d = await r.json();
            alert(d.message || 'Hooks installed');
            await refreshHooksStatus();
        }catch(e){ alert('Failed to install hooks: ' + e.message); }
    }

    // ---------------- Health ----------------
    async function checkHealth() {
        try {
            const r = await fetch(api('/health'));
            const d = await r.json();
            $('#health-status').textContent = d.ok || d.status === 'healthy' ? `OK @ ${d.ts || new Date().toISOString()}` : 'Not OK';
        } catch (e) {
            $('#health-status').textContent = 'Error';
        }
    }

    // ---------------- Config ----------------
    async function loadConfig() {
        try {
            try { await fetch(api('/api/env/reload'), { method: 'POST' }); } catch {}
            const r = await fetch(api('/api/config'));
            const d = await r.json();
            state.config = d;
            populateConfigForm(d);
        } catch (e) {
            console.error('Failed to load config:', e);
        }
    }

    function populateConfigForm(data) {
        const env = data.env || {};

        // Fill all env variable fields
        Object.entries(env).forEach(([k, v]) => {
            const field = document.querySelector(`[name="${k}"]`);
            if (!field) return;

            if (field.type === 'checkbox') {
                field.checked = String(v).toLowerCase() === 'true' || v === '1' || v === true;
            } else if (field.tagName === 'SELECT') {
                field.value = v;
            } else {
                field.value = v;
            }
        });

        // Populate repo select
        const repoSelect = $('#repo-select');
        if (repoSelect) {
            repoSelect.innerHTML = '';
            (data.repos || []).forEach((repo) => {
                const opt = document.createElement('option');
                opt.value = repo.name;
                opt.textContent = repo.name;
                repoSelect.appendChild(opt);
            });
            if (env.REPO) {
                repoSelect.value = env.REPO;
            } else if (data.default_repo) {
                repoSelect.value = data.default_repo;
            }
        }

        // Seed cost panel defaults from pricing if fields are empty
        if (state.prices && Array.isArray(state.prices.models) && state.prices.models.length) {
            if (!$('#cost-provider').value) $('#cost-provider').value = state.prices.models[0].provider || '';
            if (!$('#cost-model').value) $('#cost-model').value = state.prices.models[0].model || '';
        }

        // Cost panel autopopulate from env
        try {
            // Generation provider heuristic: use GEN_MODEL hint if present; otherwise env keys
            let provGuess = '';
            const gm = env.GEN_MODEL || '';
            if (/^gpt-|^o\w+:/i.test(gm)) provGuess = 'openai';
            else if (/^claude/i.test(gm)) provGuess = 'anthropic';
            else if (/^gemini/i.test(gm)) provGuess = 'google';
            else if (env.OLLAMA_URL) provGuess = 'local';
            else if (env.OPENAI_API_KEY) provGuess = 'openai';
            else if (env.ANTHROPIC_API_KEY) provGuess = 'anthropic';
            else if (env.GOOGLE_API_KEY) provGuess = 'google';
            if (provGuess) $('#cost-provider').value = provGuess;
            if (env.GEN_MODEL) $('#cost-model').value = env.GEN_MODEL;

            // Embeddings
            if (env.EMBEDDING_TYPE) {
                const ep = document.getElementById('cost-embed-provider'); if (ep) ep.value = env.EMBEDDING_TYPE;
                if (env.EMBEDDING_TYPE === 'openai' && document.getElementById('cost-embed-model') && !$('#cost-embed-model').value) $('#cost-embed-model').value = 'text-embedding-3-small';
                if (env.EMBEDDING_TYPE === 'voyage' && document.getElementById('cost-embed-model') && !$('#cost-embed-model').value) $('#cost-embed-model').value = 'voyage-3-large-embed';
            }
            // Reranker
            if (env.RERANK_BACKEND) {
                const rp = document.getElementById('cost-rerank-provider'); if (rp) rp.value = env.RERANK_BACKEND;
            }
            if (env.COHERE_RERANK_MODEL && document.getElementById('cost-rerank-model')) $('#cost-rerank-model').value = env.COHERE_RERANK_MODEL;
            if (env.RERANKER_MODEL && document.getElementById('cost-rerank-model') && !$('#cost-rerank-model').value) $('#cost-rerank-model').value = env.RERANKER_MODEL;
        } catch {}

        // Wizard defaults: seed from env
        try { seedWizardFromEnv(env); } catch {}
        updateWizardSummary();

        // Populate repos metadata editor
        const reposSection = $('#repos-section');
        if (reposSection) {
            reposSection.innerHTML = '';
            (data.repos || []).forEach((repo) => {
                const div = document.createElement('div');
                div.style.cssText = 'background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 6px; padding: 16px; margin-bottom: 16px;';
                const rname = repo.name;
                div.innerHTML = `
                    <h4 style=\"color: #00ff88; font-size: 14px; margin-bottom: 12px;\">Repo: ${repo.name}</h4>
                    <div class=\"input-group\" style=\"margin-bottom: 12px;\">
                        <label>Path</label>
                        <input type=\"text\" name=\"repo_path_${repo.name}\" value=\"${repo.path || ''}\" />
                    </div>
                    <div class=\"input-group\" style=\"margin-bottom: 12px;\">
                        <label>Keywords (comma-separated)</label>
                        <input type=\"text\" name=\"repo_keywords_${repo.name}\" value=\"${(repo.keywords||[]).join(',')}\" list=\"keywords-list\" placeholder=\"search or type to add\" />
                    </div>
                    <div class=\"input-group\" style=\"margin-bottom: 12px;\">
                        <label>Path Boosts (comma-separated)</label>
                        <input type=\"text\" name=\"repo_pathboosts_${repo.name}\" value=\"${(repo.path_boosts||[]).join(',')}\" />
                    </div>
                    <div class=\"input-group\">
                        <label>Layer Bonuses (JSON)</label>
                        <textarea name=\"repo_layerbonuses_${repo.name}\" rows=\"3\">${repo.layer_bonuses ? JSON.stringify(repo.layer_bonuses, null, 2) : ''}</textarea>
                    </div>
                    <div class=\"input-group full-width\" style=\"margin-top:12px;\">
                        <label>Keyword Manager</label>
                        <div style=\"display:grid; grid-template-columns: 1fr auto 1fr; gap:8px; align-items:center;\">
                            <div>
                                <div style=\"display:flex; gap:6px; margin-bottom:6px;\">
                                    <input type=\"text\" id=\"kw-filter-${rname}\" placeholder=\"filter...\" style=\"width:60%;\">
                                    <select id=\"kw-src-${rname}\">
                                        <option value=\"all\">All</option>
                                        <option value=\"discriminative\">Discriminative</option>
                                        <option value=\"semantic\">Semantic</option>
                                        <option value=\"repos\">Repo</option>
                                    </select>
                                </div>
                                <select id=\"kw-all-${rname}\" multiple size=\"8\" style=\"width:100%;\"></select>
                            </div>
                            <div style=\"display:flex; flex-direction:column; gap:8px;\">
                                <button class=\"small-button\" id=\"kw-add-${rname}\">&gt;&gt;</button>
                                <button class=\"small-button\" id=\"kw-rem-${rname}\">&lt;&lt;</button>
                            </div>
                            <div>
                                <div class=\"small\" style=\"margin-bottom:6px;\">Repo Keywords</div>
                                <select id=\"kw-repo-${rname}\" multiple size=\"8\" style=\"width:100%;\"></select>
                            </div>
                        </div>
                    </div>
                `;
                reposSection.appendChild(div);

                // Hook keyword manager events
                const fld = div.querySelector(`[name=\"repo_keywords_${rname}\"]`);
                const allSel = div.querySelector(`#kw-all-${rname}`);
                const repoSel = div.querySelector(`#kw-repo-${rname}`);
                const srcSel = div.querySelector(`#kw-src-${rname}`);
                // Ensure LLM source option is available
                try {
                    if (srcSel && !Array.from(srcSel.options).some(o => o.value === 'llm')) {
                        const opt = document.createElement('option');
                        opt.value = 'llm';
                        opt.textContent = 'LLM';
                        const before = Array.from(srcSel.options).find(o => o.value === 'repos');
                        if (before) srcSel.insertBefore(opt, before); else srcSel.appendChild(opt);
                    }
                } catch {}
                const filter = div.querySelector(`#kw-filter-${rname}`);
                const addBtn = div.querySelector(`#kw-add-${rname}`);
                const remBtn = div.querySelector(`#kw-rem-${rname}`);

                function currentRepoKws() {
                    return (fld.value || '').split(',').map(s => s.trim()).filter(Boolean);
                }
                function setRepoKws(arr) {
                    fld.value = arr.join(',');
                    // repaint repo list
                    repoSel.innerHTML = '';
                    arr.forEach(k => { const o=document.createElement('option'); o.value=k; o.textContent=k; repoSel.appendChild(o); });
                }
                function sourceList() {
                    const cat = (srcSel.value||'all');
                    const catMap = (state.keywordsCatalog||{});
                    let base = [];
                    if (cat === 'all') base = catMap.keywords||[]; else base = catMap[cat]||[];
                    const f = (filter.value||'').toLowerCase();
                    const inRepo = new Set(currentRepoKws());
                    return base.filter(k => !inRepo.has(k) && (!f || k.toLowerCase().includes(f)));
                }
                function paintSource() {
                    allSel.innerHTML = '';
                    sourceList().slice(0,500).forEach(k => { const o=document.createElement('option'); o.value=k; o.textContent=k; allSel.appendChild(o); });
                }
                addBtn.addEventListener('click', () => {
                    const cur = currentRepoKws();
                    const selected = Array.from(allSel.selectedOptions).map(o=>o.value);
                    const next = Array.from(new Set([...cur, ...selected]));
                    setRepoKws(next); paintSource();
                });
                remBtn.addEventListener('click', () => {
                    const cur = currentRepoKws();
                    const remove = new Set(Array.from(repoSel.selectedOptions).map(o=>o.value));
                    const next = cur.filter(k => !remove.has(k));
                    setRepoKws(next); paintSource();
                });
                srcSel.addEventListener('change', paintSource);
                filter.addEventListener('input', paintSource);

                // initial fill using existing values + catalog (if loaded later, loadKeywords will repaint)
                setRepoKws((repo.keywords||[]));
                if (state.keywordsCatalog) paintSource();
            });
        }

        // Attach tooltips after DOM is populated
        try { window.Tooltips && window.Tooltips.attachTooltips && window.Tooltips.attachTooltips(); } catch {}
    }

    function gatherConfigForm() {
        const update = { env: {}, repos: [] };

        // Gather all env vars from form
        const envFields = $$('[name]').filter(f => !f.name.startsWith('repo_'));
        envFields.forEach(field => {
            const key = field.name;
            let val;

            if (field.type === 'checkbox') {
                val = field.checked;
            } else if (field.type === 'number') {
                val = field.value;
            } else {
                val = field.value;
            }

            if (val !== '' && val !== null && val !== undefined) {
                update.env[key] = val;
            }
        });

        // Gather repo-specific fields
        const repoFields = $$('[name^="repo_"]');
        const repoMap = {};

        repoFields.forEach(field => {
            const parts = field.name.split('_');
            const fieldType = parts[1]; // path, keywords, pathboosts, layerbonuses
            const repoName = parts.slice(2).join('_');

            if (!repoMap[repoName]) {
                repoMap[repoName] = { name: repoName };
            }

            if (fieldType === 'keywords' || fieldType === 'pathboosts') {
                const key = fieldType === 'pathboosts' ? 'path_boosts' : 'keywords';
                repoMap[repoName][key] = field.value.split(',').map(s => s.trim()).filter(Boolean);
            } else if (fieldType === 'layerbonuses') {
                try {
                    repoMap[repoName]['layer_bonuses'] = field.value ? JSON.parse(field.value) : {};
                } catch (e) {
                    alert(`Invalid JSON for ${repoName} layer_bonuses: ${e.message}`);
                    return null;
                }
            } else if (fieldType === 'path') {
                repoMap[repoName]['path'] = field.value;
            }
        });

        update.repos = Object.values(repoMap);
        return update;
    }

    async function saveConfig() {
        const body = gatherConfigForm();
        if (!body) return;

        try {
            const r = await fetch(api('/api/config'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!r.ok) {
                alert('Save failed');
                return;
            }

            const result = await r.json();
            if (result.status === 'success') {
                alert('Configuration updated successfully!');
                await loadConfig(); // Reload to confirm
            }
        } catch (e) {
            alert('Error saving config: ' + e.message);
        }
    }

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
        setOpts(modelList, allModels);
        const genModels = unique(models
            .filter(m => (m.family||'').includes('gen') || ['openai','anthropic','google','local','mistral','meta'].includes((m.provider||'').toLowerCase()))
            .map(m => m.model));
        const rrModels = unique(models
            .filter(m => (m.family||'').includes('rerank') || ['cohere'].includes((m.provider||'').toLowerCase()) || (m.model||'').toLowerCase().includes('rerank'))
            .map(m => m.model));
        const embModels = unique(models
            .filter(m => (m.family||'').includes('embed') || (m.embed_per_1k||0) > 0)
            .map(m => m.model));
        setOpts(genList, genModels);
        setOpts(rrList, rrModels);
        setOpts(embList, embModels);

        if (!$('#cost-provider').value && providers.length) $('#cost-provider').value = providers[0];
        if (!$('#cost-model').value && allModels.length) $('#cost-model').value = allModels[0];

        // Filter model options when provider changes AND update the input value
        const onProv = () => {
            const modelInput = $('#cost-model');
            if (!modelInput) return;

            const p = $('#cost-provider').value.trim().toLowerCase();
            const provModels = unique(models.filter(m => (m.provider||'').toLowerCase()===p).map(m => m.model));
            const filtered = provModels.length ? provModels : allModels;

            setOpts(modelList, filtered);

            // Auto-select first model from this provider if current model doesn't match
            if (!filtered.includes(modelInput.value)) {
                modelInput.value = filtered[0] || '';
            }
        };

        if (providerSelect) providerSelect.addEventListener('change', onProv);
        onProv(); // Initialize
    }

    function buildCostPayload() {
        const payload = {
            provider: $('#cost-provider').value.trim(),
            model: $('#cost-model').value.trim(),
            tokens_in: parseInt($('#cost-in').value, 10) || 0,
            tokens_out: parseInt($('#cost-out').value, 10) || 0,
            embeds: parseInt($('#cost-embeds').value, 10) || 0,
            reranks: parseInt($('#cost-rerank').value, 10) || 0,
            requests_per_day: parseInt($('#cost-rpd').value, 10) || 0,
        };
        // Optional per-component providers/models for full pipeline costing
        const ep = document.getElementById('cost-embed-provider');
        const em = document.getElementById('cost-embed-model');
        const rp = document.getElementById('cost-rerank-provider');
        const rm = document.getElementById('cost-rerank-model');
        if (ep && ep.value) payload.embed_provider = ep.value.trim();
        if (em && em.value) payload.embed_model = em.value.trim();
        if (rp && rp.value) payload.rerank_provider = rp.value.trim();
        if (rm && rm.value) payload.rerank_model = rm.value.trim();
        // MQ rewrites from current config (affects per-request embed/rerank cost)
        const mq = parseInt((state.config?.env?.MQ_REWRITES)||'1', 10) || 1;
        payload.mq_rewrites = mq;
        return payload;
    }

    async function estimateCost() {
        const basic = buildCostPayload();
        // Pipeline payload includes gen model+provider and uses env to resolve embed/rerank (cohere/openai etc.)
        const pipeline = {
            gen_provider: basic.provider,
            gen_model: basic.model,
            tokens_in: basic.tokens_in,
            tokens_out: basic.tokens_out,
            embeds: basic.embeds,
            reranks: basic.reranks,
            requests_per_day: basic.requests_per_day,
        };

        try {
            let r = await fetch(api('/api/cost/estimate_pipeline'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pipeline)
            });
            if (!r.ok) {
                // Fallback to legacy single‑row estimator
                r = await fetch(api('/api/cost/estimate'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(basic) });
            }
            const d = await r.json();
            $('#cost-daily').textContent = `$${Number(d.daily||0).toFixed(4)}`;
            $('#cost-monthly').textContent = `$${Number(d.monthly||0).toFixed(2)}`;
        } catch (e) {
            alert('Cost estimation failed: ' + e.message);
        }
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
            ul.innerHTML = '';
            state.profiles.forEach((name) => {
                const li = document.createElement('li');
                li.textContent = name;
                li.style.cssText = 'padding: 4px 0; color: #888;';
                ul.appendChild(li);
            });
        } catch (e) {
            console.error('Failed to load profiles:', e);
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
    function bindDropzone() {
        const dz = $('#dropzone');
        const fi = $('#file-input');

        function openPicker() {
            fi.click();
        }

        dz.addEventListener('click', openPicker);

        dz.addEventListener('dragover', (e) => {
            e.preventDefault();
            dz.style.background = '#111111';
        });

        dz.addEventListener('dragleave', (e) => {
            dz.style.background = '';
        });

        dz.addEventListener('drop', async (e) => {
            e.preventDefault();
            dz.style.background = '';
            const file = e.dataTransfer.files?.[0];
            if (file) await ingestFile(file);
        });

        fi.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (file) await ingestFile(file);
            fi.value = '';
        });
    }

    async function ingestFile(file) {
        const persist = $('#persist-secrets').checked;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('persist', String(persist));

        try {
            const r = await fetch(api('/api/secrets/ingest'), {
                method: 'POST',
                body: fd
            });

            const d = await r.json();
            $('#ingest-out').textContent = JSON.stringify(d, null, 2);
            await loadConfig();
        } catch (e) {
            alert('Secrets ingest failed: ' + e.message);
        }
    }

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
        const id = setInterval(tick, 900);
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
                        if (cta) cta.addEventListener('click', async () => {
                            switchTab('repos');
                            const b = document.getElementById('btn-cards-build');
                            if (b) { b.click(); showStatus('Building cards...', 'loading'); }
                        });
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
        const btnCardsBuild = document.getElementById('btn-cards-build');
        if (btnCardsBuild) btnCardsBuild.addEventListener('click', buildCards);
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

    // ---------------- Init ----------------
    async function init() {
        bindTabs();
        bindActions();
        bindGlobalSearchLive();
        bindDropzone();
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

    window.addEventListener('DOMContentLoaded', init);

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
    function bindGlobalSearchLive() {
        const box = document.getElementById('global-search');
        if (!box) return;
        const pop = document.getElementById('search-results');
        let index = [];
        let items = []; let cursor = -1;
        function ensureIndex(){
            if (index.length) return index;
            const idx=[];
            $$('.settings-section').forEach(sec=>{
                const title = (sec.querySelector('h3')?.textContent||'').toLowerCase();
                sec.querySelectorAll('.input-group').forEach(g=>{
                    const label=(g.querySelector('label')?.textContent||'').trim();
                    const input=g.querySelector('input,select,textarea');
                    if (!input) return;
                    const name=input.name||input.id||''; const ph=input.getAttribute('placeholder')||'';
                    const content=(title+' '+label+' '+name+' '+ph).toLowerCase();
                    idx.push({label: `${label||name} — ${title}`, el: input, content});
                });
            });
            index = idx; return idx;
        }
        function sectionGroupFor(el){
            const tc = el.closest('.tab-content'); if (!tc) return 'dashboard';
            const id = tc.id.replace('tab-','');
            const map = { generation:'models', embeddings:'models', reranking:'models', retrieval:'retrieval', confidence:'retrieval', cards:'retrieval', repos:'repos', indexing:'repos', infra:'infra', calculator:'tools', eval:'tools', misc:'tools', dashboard:'dashboard' };
            return map[id] || id;
        }
        function go(item){
            const tab = sectionGroupFor(item.el); switchTab(tab);
            item.el.classList.add('search-hit'); item.el.scrollIntoView({behavior:'smooth', block:'center'});
            setTimeout(()=> item.el.classList.remove('search-hit'), 1200);
            if (pop) pop.style.display='none';
        }
        function render(){
            if (!pop) return; pop.innerHTML='';
            if (!items.length){ pop.style.display='none'; return; }
            items.slice(0,12).forEach((r,i)=>{
                const div=document.createElement('div'); div.className='item'+(i===cursor?' active':'');
                div.textContent=r.label; div.addEventListener('click',()=>go(r)); pop.appendChild(div);
            });
            pop.style.display='block';
        }
        function search(q){
            const s=q.trim().toLowerCase(); if(!s){ items=[]; render(); return; }
            ensureIndex(); items = index.filter(x=> x.content.includes(s)); cursor=0; render();
        }
        document.addEventListener('click', (e)=>{ if (pop && !pop.contains(e.target) && e.target!==box) pop.style.display='none'; });
        box.addEventListener('keydown', (e)=>{ if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); box.focus(); box.select(); }});
        box.addEventListener('input', ()=> search(box.value));
        box.addEventListener('keydown', (e)=>{
            if (!pop || pop.style.display!=='block') return;
            if (e.key==='ArrowDown'){ e.preventDefault(); cursor=Math.min(cursor+1, items.length-1); render(); }
            else if (e.key==='ArrowUp'){ e.preventDefault(); cursor=Math.max(cursor-1,0); render(); }
            else if (e.key==='Enter'){ e.preventDefault(); if(items[cursor]) go(items[cursor]); }
        });
    }

    // ---------------- Autotune ----------------
    async function refreshAutotune() {
        try {
            const r = await fetch(api('/api/autotune/status'));
            if (!r.ok) {
                if (r.status === 403 || r.status === 402) {
                    $('#autotune-mode').textContent = 'Pro required (set Edition to pro)';
                } else {
                    $('#autotune-mode').textContent = '—';
                }
                $('#autotune-enabled').checked = false;
                return;
            }
            const d = await r.json();
            $('#autotune-enabled').checked = !!d.enabled;
            $('#autotune-mode').textContent = d.current_mode || '—';
        } catch (e) {
            $('#autotune-mode').textContent = '—';
        }
    }

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
    function getNum(id){ const v=document.getElementById(id); if (!v) return 0; return parseInt((v.value||'').toString().replace(/,/g,'').replace(/\s/g,''),10)||0; }
    function setNum(id, n){ const el=document.getElementById(id); if (!el) return; el.value = (Number(n)||0).toLocaleString('en-US'); }
    function attachCommaFormatting(ids){ ids.forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.addEventListener('focus',()=>{ el.value = el.value.replace(/,/g,''); }); el.addEventListener('blur',()=>{ const num=getNum(id); if(num >= 0) el.value = num.toLocaleString('en-US'); }); }); }
    function wireDayConverters(){ const recalc=()=>{ const rpd=getNum('cost-rpd'); const inDay=getNum('cost-in-day'); const outDay=getNum('cost-out-day'); if(rpd>0){ if(inDay>0) setNum('cost-in', Math.floor(inDay/rpd)); if(outDay>0) setNum('cost-out', Math.floor(outDay/rpd)); } }; ['cost-in-day','cost-out-day','cost-rpd'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', recalc); }); recalc(); }

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
    async function loadKeywords() {
        try {
            const r = await fetch(api('/api/keywords'));
            const d = await r.json();
            state.keywordsCatalog = d;
            const list = document.getElementById('keywords-list');
            if (list) {
                list.innerHTML = '';
                (d.keywords || []).forEach(k => {
                    const opt = document.createElement('option'); opt.value = k; list.appendChild(opt);
                });
            }
            const kc = document.getElementById('keywords-count');
            if (kc) kc.textContent = String((d.keywords||[]).length);
            // repaint per-repo managers if present
            ($$('#repos-section > div') || []).forEach(div => {
                const srcSel = div.querySelector('[id^="kw-src-"]');
                const filter = div.querySelector('[id^="kw-filter-"]');
                const allSel = div.querySelector('[id^="kw-all-"]');
                const fld = div.querySelector('[name^="repo_keywords_"]');
                if (srcSel && filter && allSel && fld) {
                    const cat = (srcSel.value||'all');
                    const catMap = d; let base = cat==='all' ? (d.keywords||[]) : (d[cat]||[]);
                    const f=(filter.value||'').toLowerCase(); const inRepo=new Set((fld.value||'').split(',').map(s=>s.trim()).filter(Boolean));
                    allSel.innerHTML=''; base.filter(k=>!inRepo.has(k)&&(!f||k.toLowerCase().includes(f))).slice(0,500).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k;allSel.appendChild(o);});
                }
            });
        } catch (e) { console.warn('keywords load failed', e); }
    }

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

    async function buildCards() {
        try {
            showStatus('Building cards...', 'loading');
            await fetch(api('/api/cards/build'), { method: 'POST' });
            await refreshCards();
            showStatus('Cards built successfully', 'success');
        } catch (e) {
            showStatus('Failed to build cards: ' + e.message, 'error');
            throw e;
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
})();
