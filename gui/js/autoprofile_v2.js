;(function(){
  function apiBase(){
    try{
      const u = new URL(window.location.href);
      const q = new URLSearchParams(u.search);
      const override = q.get('api');
      if (override) return override.replace(/\/$/, '');
      if (u.port === '8012') return u.origin;
      return 'http://127.0.0.1:8012';
    }catch{ return 'http://127.0.0.1:8012'; }
  }
  function api(path){ return apiBase() + path; }
  async function getConfig(){
    try{ const r = await fetch(api('/api/config')); return await r.json(); }catch{ return { env:{}, repos:[] }; }
  }
  function csvToList(s){ return (String(s||'').split(',').map(x=>x.trim()).filter(Boolean)); }
  function readAdvanced(){
    const mode = document.getElementById('apv2-mode')?.value || 'balanced';
    const budgetOverride = parseFloat(document.getElementById('apv2-budget')?.value || '');
    const prov = Array.from(document.querySelectorAll('.apv2-prov'))
      .filter(cb => cb.checked).map(cb => cb.value);
    const regions = csvToList(document.getElementById('apv2-regions')?.value||'');
    const compliance = csvToList(document.getElementById('apv2-compliance')?.value||'');
    const wl = {
      requests_per_day: parseInt(document.getElementById('apv2-rpd')?.value||'')||undefined,
      tokens_in_per_req: parseInt(document.getElementById('apv2-tin')?.value||'')||undefined,
      tokens_out_per_req: parseInt(document.getElementById('apv2-tout')?.value||'')||undefined,
      mq_rewrites: parseInt(document.getElementById('apv2-mq')?.value||'')||undefined,
      embed_tokens_per_req: parseInt(document.getElementById('apv2-embt')?.value||'')||undefined,
      rerank_tokens_per_req: parseInt(document.getElementById('apv2-rrt')?.value||'')||undefined,
    };
    const slo = {
      latency_target_ms: parseInt(document.getElementById('apv2-latency')?.value||'')||undefined,
      min_qps: parseFloat(document.getElementById('apv2-minqps')?.value||'')||undefined,
    };
    return { mode, budgetOverride, prov, regions, compliance, workload: wl, slo };
  }
  function setPlaceholderLoading(){
    const placeholder = document.getElementById('profile-placeholder');
    const results = document.getElementById('profile-results-content');
    if (placeholder) {
      placeholder.style.display='flex';
      placeholder.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style=\"width:48px;height:48px;border:3px solid #2a2a2a;border-top-color:#00ff88;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px;\"></div>
          <p style=\"font-size:14px;color:#666;\">Selecting profile with v2 engine...</p>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;
    }
    if (results) results.style.display='none';
  }
  function renderResult(env, reason, scan, budget){
    const results = document.getElementById('profile-results-content');
    const placeholder = document.getElementById('profile-placeholder');
    if (window.ProfileRenderer && results) {
      try{
        const html = window.ProfileRenderer.renderProfileResults(env, scan, budget);
        results.innerHTML = html;
        if (window.ProfileRenderer.bindTooltips) window.ProfileRenderer.bindTooltips(results);
        if (placeholder) placeholder.style.display='none';
        results.style.display='block';
      }catch(err){
        results.innerHTML = '<pre style="color:#ff6b6b;padding:20px;">'+(err?.message||String(err))+'</pre>';
        results.style.display='block';
        if (placeholder) placeholder.style.display='none';
      }
    }
  }
  async function ensureScan(){
    try {
      const out = document.getElementById('scan-out');
      if (out && out.dataset.scanData){ return JSON.parse(out.dataset.scanData); }
    }catch{}
    try{ const r = await fetch(api('/api/scan-hw'), { method:'POST' }); return await r.json(); }catch{ return null; }
  }

  async function run(){
    setPlaceholderLoading();
    const cfg = await getConfig();
    const env = (cfg && cfg.env) || {};
    const scan = await ensureScan();
    const budget = parseFloat(document.getElementById('budget')?.value||'0');
    const adv = readAdvanced();
    const payload = {
      hardware: { runtimes: (scan && scan.runtimes) || {}, meta: (scan && scan.info) || {} },
      policy: { providers_allowed: adv.prov.length? adv.prov : undefined, regions_allowed: adv.regions.length? adv.regions: undefined, compliance: adv.compliance.length? adv.compliance: undefined },
      workload: Object.fromEntries(Object.entries(adv.workload).filter(([_,v])=> v!==undefined)),
      objective: {
        mode: adv.mode,
        monthly_budget_usd: isNaN(adv.budgetOverride)? budget : adv.budgetOverride,
        latency_target_ms: adv.slo.latency_target_ms,
        min_qps: adv.slo.min_qps,
      },
      defaults: { gen_model: env.GEN_MODEL || '' }
    };
    try{
      const r = await fetch(api('/api/profile/autoselect'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!r.ok){ const txt = await r.text(); throw new Error(txt || 'autoselect failed'); }
      const data = await r.json();
      renderResult(data.env, data.reason, scan, payload.objective.monthly_budget_usd || budget);
    }catch(err){
      const results = document.getElementById('profile-results-content');
      const placeholder = document.getElementById('profile-placeholder');
      if (results){ results.innerHTML = '<pre style="color:#ff6b6b;padding:20px;">'+(err?.message||String(err))+'</pre>'; results.style.display='block'; }
      if (placeholder) placeholder.style.display='none';
    }
  }

  window.AutoProfileV2 = { run };
})();
