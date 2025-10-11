# AGRO — Unified Memory & AMD Detection Addendum

> This addendum makes **AMD (EPYC/Ryzen) & Unified Memory (UMA)** first‑class in the hardware scan and in the auto‑plan chooser. It also strengthens Apple Silicon detection and surfaces **system RAM** as a primary resource when GPUs aren’t the right lever.

---

## 1) Backend — Enhanced `/api/scan-hw` (AMD vendor, UMA/NUMA, RAM emphasis, Apple Silicon)
Replace your existing `scan_hw()` with this version or merge the additions if you already applied the CUDA patch.

```python
@app.post("/api/scan-hw")
def scan_hw() -> Dict[str, Any]:
    import os, re, shutil, subprocess, platform

    # --- CPU vendor / model ---
    cpu_vendor = None
    cpu_model = None
    try:
        if platform.system() == "Linux" and shutil.which("lscpu"):
            out = subprocess.check_output(["lscpu"], timeout=2).decode(errors="ignore")
            m = re.search(r"Vendor ID:\s*(.+)", out)
            if m: cpu_vendor = m.group(1).strip()
            m = re.search(r"Model name:\s*(.+)", out)
            if m: cpu_model = m.group(1).strip()
        elif platform.system() == "Darwin":
            if shutil.which("sysctl"):
                try:
                    cpu_model = subprocess.check_output(["sysctl","-n","machdep.cpu.brand_string"], timeout=2).decode().strip()
                except Exception:
                    pass
            cpu_vendor = "Apple" if cpu_model and "Apple" in cpu_model else "Apple"
    except Exception:
        pass

    # --- Apple Silicon (CoreML/ANE) flag ---
    is_apple_silicon = (platform.system()=="Darwin" and platform.machine().lower() in ("arm64","aarch64"))

    # --- System RAM (GB) ---
    mem_gb = _mem_gb()  # already defined helper

    # --- UMA / NUMA detection ---
    uma = None
    numa_nodes = None
    if platform.system()=="Linux" and shutil.which("numactl"):
        try:
            hw = subprocess.check_output(["numactl","--hardware"], timeout=2).decode(errors="ignore")
            m = re.search(r"available:\s*(\d+) nodes", hw)
            if m:
                numa_nodes = int(m.group(1))
                uma = (numa_nodes <= 1)
        except Exception:
            pass
    # on macOS assume UMA
    if platform.system()=="Darwin":
        uma = True
        numa_nodes = 1

    # --- NVIDIA / CUDA discovery (if you also applied GPU patch) ---
    gpus = []
    cuda_version = None
    if shutil.which("nvidia-smi"):
        try:
            raw = subprocess.check_output(["nvidia-smi"], timeout=2).decode(errors="ignore")
            m = re.search(r"CUDA Version:\s*([0-9]+\.[0-9]+)", raw)
            if m: cuda_version = m.group(1)
        except Exception:
            pass
        try:
            q = subprocess.check_output([
                "nvidia-smi",
                "--query-gpu=index,pci.bus_id,name,memory.total,driver_version,compute_cap",
                "--format=csv,noheader,nounits",
            ], timeout=2).decode()
            for line in q.splitlines():
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 6:
                    idx,bus,name,vram_mb,driver,cc = parts[:6]
                    try: vram_mb = int(vram_mb)
                    except Exception: vram_mb = None
                    gpus.append({
                        "index": int(idx),
                        "bus": bus,
                        "name": name,
                        "vram_mb": vram_mb,
                        "driver_version": driver,
                        "compute_cap": cc,
                    })
        except Exception:
            pass

    info = {
        "os": platform.platform(),
        "cpu_vendor": cpu_vendor,            # e.g., AuthenticAMD, GenuineIntel, Apple
        "cpu_model": cpu_model,              # full model string
        "is_apple_silicon": bool(is_apple_silicon),
        "mem_gb": mem_gb,                    # primary resource for UMA systems
        "uma": uma,                          # True/False/None
        "numa_nodes": numa_nodes,            # int/None
        "gpus": gpus,                        # list (may be empty)
        "cuda_version": cuda_version,        # e.g., 12.5
        "nvidia_container_toolkit": shutil.which("nvidia-container-toolkit") is not None,
    }

    runtimes = _detect_runtimes()
    # refine CUDA flag to reflect real GPU presence
    runtimes["cuda"] = bool(gpus)
    # keep existing coreml/ollama flags, etc.

    return {"runtimes": runtimes, "info": info}
```

**What this surfaces:**
- `cpu_vendor`/`cpu_model` (detect **AMD EPYC/Ryzen**, Intel, Apple),
- `is_apple_silicon`,
- `mem_gb` (primary lever for UMA builds),
- `uma` and `numa_nodes` (Linux via `numactl`; macOS assumed UMA),
- NVIDIA details if present (kept from the CUDA patch).

---

## 2) Frontend — UMA/Apple/AMD‑aware candidates (no CPU‑LLM, but RAM‑heavy retrieval)
Replace/merge with your current CUDA/MGPU candidates. This adds **Apple‑UMA** and **AMD‑UMA** candidates that *do not try to run a local LLM on CPU*, but exploit **system RAM** to push retrieval quality while keeping GEN in the cloud.

```javascript
function generateCandidates(scan, budget) {
  const hasCUDA = !!(scan?.runtimes?.cuda);
  const gpus = scan?.info?.gpus || [];
  const gpuCount = scan?.info?.gpu_count || gpus.length || 0;
  const maxVRAM = gpus.reduce((m, g) => Math.max(m, g.vram_mb || 0), 0);
  const totalVRAM = (scan?.info?.total_vram_mb) || gpus.reduce((s,g)=> s + (g.vram_mb||0), 0);
  const memGB = scan?.info?.mem_gb || 8;
  const uma = scan?.info?.uma === true;
  const cpuVendor = (scan?.info?.cpu_vendor || '').toLowerCase();
  const isApple = !!scan?.info?.is_apple_silicon;

  // 1) MGPU CUDA → prefer first if available
  const mgpu = (hasCUDA && gpuCount >= 2) ? {
    name: 'cuda_mgpu',
    env: {
      GEN_MODEL: (totalVRAM >= 48000) ? 'qwen3-coder:32b' : 'qwen3-coder:14b',
      EMBEDDING_TYPE: 'local', RERANK_BACKEND: 'local',
      MQ_REWRITES: (totalVRAM >= 48000) ? '6' : '4',
      FINAL_K: (totalVRAM >= 48000) ? '20' : '12',
      TOPK_DENSE: '120', TOPK_SPARSE: '120', HYDRATION_MODE: 'lazy',
      CUDA_ENABLED: 'true', CUDA_MGPU: 'true', CUDA_GPUS: String(gpuCount), CUDA_TP_DEGREE: String(Math.min(gpuCount,2))
    }
  } : null;

  // 2) Single‑GPU CUDA
  const sGpu = (hasCUDA && gpuCount === 1) ? {
    name: 'cuda_local',
    env: {
      GEN_MODEL: (maxVRAM >= 24576) ? 'qwen3-coder:32b' : 'qwen3-coder:14b',
      EMBEDDING_TYPE: 'local', RERANK_BACKEND: 'local',
      MQ_REWRITES: (maxVRAM >= 24576) ? '6' : '4',
      FINAL_K: (maxVRAM >= 24576) ? '20' : '12',
      TOPK_DENSE: '120', TOPK_SPARSE: '120', HYDRATION_MODE: 'lazy', CUDA_ENABLED: 'true'
    }
  } : null;

  // 3) Apple‑UMA (CoreML for some pipelines, but keep GEN cloud unless user overrides)
  const appleUMA = isApple ? {
    name: 'apple_uma',
    env: {
      GEN_MODEL: 'gpt-4o-mini',                 // keep GEN cloud; optional CoreML override elsewhere
      EMBEDDING_TYPE: 'local',                  // local embedders OK on Apple
      RERANK_BACKEND: 'local',
      MQ_REWRITES: (memGB >= 64) ? '6' : '4',
      FINAL_K: (memGB >= 64) ? '20' : '12',
      TOPK_DENSE: (memGB >= 64) ? '120' : '90',
      TOPK_SPARSE: (memGB >= 64) ? '120' : '90',
      HYDRATION_MODE: 'lazy',
      UMA: 'true', INDEX_SHARD_CACHE_GB: String(Math.min(64, Math.floor(memGB/2)))
    }
  } : null;

  // 4) AMD‑UMA (EPYC/Ryzen with big RAM → push retrieval; GEN stays cloud)
  const amdUMA = (!isApple && uma && cpuVendor.includes('amd')) ? {
    name: 'amd_uma',
    env: {
      GEN_MODEL: 'gpt-4o-mini',                 // cloud GEN by default
      EMBEDDING_TYPE: 'local', RERANK_BACKEND: 'local',
      MQ_REWRITES: (memGB >= 128) ? '8' : '6',
      FINAL_K: (memGB >= 128) ? '24' : '16',
      TOPK_DENSE: (memGB >= 128) ? '150' : '120',
      TOPK_SPARSE: (memGB >= 128) ? '150' : '120',
      HYDRATION_MODE: 'lazy', UMA: 'true', INDEX_SHARD_CACHE_GB: String(Math.min(128, Math.floor(memGB*0.5)))
    }
  } : null;

  // 5) Cloud fallbacks
  const cheapCloud = { name: 'cheap_cloud', env: { GEN_MODEL:'gpt-4o-mini', EMBEDDING_TYPE:'openai', RERANK_BACKEND:'local', MQ_REWRITES:'4', FINAL_K:'10', TOPK_DENSE:'75', TOPK_SPARSE:'75', HYDRATION_MODE:'lazy' } };
  const premium = { name: 'premium', env: { GEN_MODEL:'gpt-4o-mini', EMBEDDING_TYPE:'openai', RERANK_BACKEND:'cohere', MQ_REWRITES:'6', FINAL_K:'20', TOPK_DENSE:'120', TOPK_SPARSE:'120', HYDRATION_MODE:'lazy' } };

  return [mgpu, sGpu, appleUMA, amdUMA, cheapCloud, premium].filter(Boolean);
}
```

**Why this shape:**
- **We do not run CPU LLMs** for AMD UMA by default (your call) — we lean on RAM to maximize retrieval (MQ, Final‑K, top‑k) and keep GEN in the cloud.
- Apple Silicon gets the same **RAM‑scaled retrieval** (and you can still wire CoreML GEN toggle elsewhere).
- CUDA/MGPU stay first because that’s the common heavy local GEN path.

---

## 3) (Optional) Enterprise advisory rules for UMA
Add examples to `compat_rules.json` to nudge UMA users about memory pressure.

```json
{
  "rules": [
    {
      "id": "uma-high-mem-pressure",
      "title": "High memory pressure expected with large FINAL_K / TOPK on UMA systems",
      "severity": "medium",
      "conditions": [
        {"fact": "env.UMA", "op": "=", "value": "true"},
        {"fact": "env.FINAL_K", "op": ">=", "value": "20"}
      ],
      "message": "UMA configs push more RAM; consider INDEX_SHARD_CACHE_GB and monitoring swap." ,
      "workaround": "Reduce FINAL_K / TOPK or increase RAM; ensure swap is configured.",
      "refs": []
    }
  ]
}
```

---

### TL;DR
- **AMD (EPYC/Ryzen) and Apple Silicon** are now explicitly detected.
- **UMA/NUMA** detection decides whether to scale **retrieval** off **system RAM**.
- CUDA/MGPU paths remain first‑class for local GEN.
- No ROCm/TPU/Coral added (per your direction). If you want ROCm later, we can add a separate ROCm detector and candidate.

