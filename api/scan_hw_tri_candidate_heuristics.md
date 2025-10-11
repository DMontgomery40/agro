# AGRO — Multi‑GPU Addendum (scan_hw + tri‑candidate + heuristics)

This addendum makes **multi‑GPU** a first‑class concern in both the hardware scan and the auto‑plan chooser. It’s copy/paste‑ready so you can drop it into your existing stubs.

---

## 1) Backend — Enhanced `/api/scan-hw` with multi‑GPU, VRAM totals, NVLink/MIG hints
Replace the existing `scan_hw()` with the version below.

```python
@app.post("/api/scan-hw")
def scan_hw() -> Dict[str, Any]:
    import re, shutil, subprocess, platform

    def _nvidia_gpus():
        gpus: List[Dict[str, Any]] = []
        cuda_version: Optional[str] = None
        nvlink_present: Optional[bool] = None
        mig_present: Optional[bool] = None

        if not shutil.which("nvidia-smi"):
            return gpus, cuda_version, nvlink_present, mig_present

        # CUDA banner (e.g., "CUDA Version: 12.5")
        try:
            raw = subprocess.check_output(["nvidia-smi"], timeout=2).decode(errors="ignore")
            m = re.search(r"CUDA Version:\s*([0-9]+\.[0-9]+)", raw)
            if m:
                cuda_version = m.group(1)
        except Exception:
            pass

        # GPU inventory: index, bus, name, vram, driver, compute cap
        try:
            q = subprocess.check_output([
                "nvidia-smi",
                "--query-gpu=index,pci.bus_id,name,memory.total,driver_version,compute_cap",
                "--format=csv,noheader,nounits",
            ], timeout=2).decode()
            for line in q.splitlines():
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 6:
                    idx, bus, name, vram_mb, driver, cc = parts[:6]
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

        # NVLink / topology hint (best‑effort)
        try:
            topo = subprocess.check_output(["nvidia-smi", "topo", "-m"], timeout=2).decode(errors="ignore").lower()
            nvlink_present = ("nvlink" in topo) or ("nvswitch" in topo)
        except Exception:
            nvlink_present = None

        # MIG hint (A100/H100 etc.)
        try:
            q2 = subprocess.check_output(["nvidia-smi", "-q"], timeout=2).decode(errors="ignore").lower()
            mig_present = ("mig mode" in q2) or ("multi instance" in q2)
        except Exception:
            mig_present = None

        return gpus, cuda_version, nvlink_present, mig_present

    gpus, cuda_ver, nvlink_present, mig_present = _nvidia_gpus()

    total_vram_mb = sum([g.get("vram_mb") or 0 for g in gpus])
    max_vram_mb = max([g.get("vram_mb") or 0 for g in gpus], default=0)

    info = {
        "os": platform.platform(),
        "cpu_cores": _cpu_cores(),
        "mem_gb": _mem_gb(),
        "gpus": gpus,                        # list[ {index,bus,name,vram_mb,driver_version,compute_cap} ]
        "gpu_count": len(gpus),
        "total_vram_mb": total_vram_mb,
        "max_vram_mb": max_vram_mb,
        "cuda_version": cuda_ver,            # e.g., "12.5"
        "nvlink_present": nvlink_present,    # True/False/None
        "mig_present": mig_present,          # True/False/None
        "nvidia_container_toolkit": shutil.which("nvidia-container-toolkit") is not None,
    }

    runtimes = _detect_runtimes()
    # Reflect actual GPU discovery, not just presence of nvidia-smi
    runtimes["cuda"] = bool(gpus)

    return {"runtimes": runtimes, "info": info}
```

**What you now get back:**
- `gpu_count`, `gpus[]`, `total_vram_mb`, `max_vram_mb`, `cuda_version`, `nvlink_present`, `mig_present`.

---

## 2) Frontend — CUDA/Multi‑GPU aware `generateCandidates()`
Replace your current function with this version (adds an **MGPU** plan when `gpu_count >= 2`).

```javascript
function generateCandidates(scan, budget) {
  const hasCUDA = !!(scan?.runtimes?.cuda);
  const gpus = scan?.info?.gpus || [];
  const gpuCount = scan?.info?.gpu_count || gpus.length || 0;
  const maxVRAM = scan?.info?.max_vram_mb || gpus.reduce((m, g) => Math.max(m, g.vram_mb || 0), 0);
  const totalVRAM = scan?.info?.total_vram_mb || 0;
  const mem = (scan?.info?.mem_gb || 8);

  // MGPU candidate first when 2+ GPUs detected
  const mgpuCand = (hasCUDA && gpuCount >= 2) ? {
    name: 'cuda_mgpu',
    env: {
      // Very rough: if you have >= 48GB combined, prefer a larger shardable model
      GEN_MODEL: (totalVRAM >= 48000) ? 'qwen3-coder:32b' : 'qwen3-coder:14b',
      EMBEDDING_TYPE: 'local',
      RERANK_BACKEND: 'local',
      MQ_REWRITES: (totalVRAM >= 48000) ? '6' : '4',
      FINAL_K: (totalVRAM >= 48000) ? '20' : '12',
      TOPK_DENSE: '120', TOPK_SPARSE: '120',
      HYDRATION_MODE: 'lazy',
      CUDA_ENABLED: 'true',
      CUDA_MGPU: 'true',             // signal to backend/runtime
      CUDA_GPUS: String(gpuCount),   // e.g., "2"
      CUDA_TP_DEGREE: String(Math.min(gpuCount, 2)) // simple default TP degree
    }
  } : null;

  // Single‑GPU CUDA plan (if present) falls back after MGPU
  const cudaCand = (hasCUDA && gpuCount === 1) ? {
    name: 'cuda_local',
    env: {
      GEN_MODEL: (maxVRAM >= 24576) ? 'qwen3-coder:32b' : 'qwen3-coder:14b',
      EMBEDDING_TYPE: 'local', RERANK_BACKEND: 'local',
      MQ_REWRITES: (maxVRAM >= 24576) ? '6' : '4',
      FINAL_K: (maxVRAM >= 24576) ? '20' : '12',
      TOPK_DENSE: '120', TOPK_SPARSE: '120', HYDRATION_MODE: 'lazy', CUDA_ENABLED: 'true'
    }
  } : null;

  const localCPU = {
    name: 'local_cpu',
    env: { GEN_MODEL: 'qwen3-coder:14b', EMBEDDING_TYPE: 'local', RERANK_BACKEND: 'local', MQ_REWRITES: mem >= 32 ? '4' : '3', FINAL_K: mem >= 32 ? '10' : '8', TOPK_DENSE: '60', TOPK_SPARSE: '60', HYDRATION_MODE: 'lazy' }
  };

  const cheapCloud = {
    name: 'cheap_cloud',
    env: { GEN_MODEL: 'gpt-4o-mini', EMBEDDING_TYPE: 'openai', RERANK_BACKEND: 'local', MQ_REWRITES: budget > 25 ? '4' : '3', FINAL_K: budget > 25 ? '10' : '8', TOPK_DENSE: '75', TOPK_SPARSE: '75', HYDRATION_MODE: 'lazy' }
  };

  const premium = {
    name: 'premium',
    env: { GEN_MODEL: 'gpt-4o-mini', EMBEDDING_TYPE: 'openai', RERANK_BACKEND: 'cohere', MQ_REWRITES: budget > 100 ? '6' : '4', FINAL_K: budget > 100 ? '20' : '12', TOPK_DENSE: '120', TOPK_SPARSE: '120', HYDRATION_MODE: 'lazy' }
  };

  return [mgpuCand, cudaCand, localCPU, cheapCloud, premium].filter(Boolean);
}
```

> Notes
> - We don’t assume VRAM is shared; **MGPU is expressed via TP degree** env knobs (`CUDA_TP_DEGREE`, `CUDA_GPUS`) that your runtime can consume.
> - If you later add a launcher for tensor parallel/pipeline parallel, read these envs to configure shards.

---

## 3) Optional Enterprise rules (no background scans)
Add examples to `compat_rules.json` to warn when kernel/driver churn is likely to bite NVIDIA stacks.

```json
{
  "rules": [
    {
      "id": "pve-nvidia-dkms-risk",
      "title": "Proxmox kernel upgrades may require NVIDIA DKMS rebuild",
      "severity": "medium",
      "conditions": [
        {"fact": "os.name", "op": "=", "value": "Proxmox"},
        {"fact": "env.CUDA_ENABLED", "op": "=", "value": "true"}
      ],
      "message": "After PVE kernel updates, the NVIDIA module may be out-of-tree and require DKMS rebuild.",
      "workaround": "Plan a maintenance window: update headers, rebuild DKMS, verify with nvidia-smi.",
      "refs": []
    }
  ]
}
```

---

## 4) Sanity: quick read‑only GPU check (optional)

```bash
echo "=== NVIDIA (driver / CUDA / GPUs) ===" && \
(nvidia-smi || echo "nvidia-smi not found") && \
echo "=== GPUs (index / bus / name / VRAM / driver / CC) ===" && \
(nvidia-smi --query-gpu=index,pci.bus_id,name,memory.total,driver_version,compute_cap --format=csv,noheader,nounits || true) && \
echo "=== Topology ===" && \
(nvidia-smi topo -m || true) && \
echo "=== Container Toolkit ===" && \
(command -v nvidia-container-toolkit >/dev/null 2>&1 && echo present || echo missing)
```

---

### What’s still intentionally out of scope in this patch
- **ROCm/AMD**: can be added later via `rocminfo` detector and a separate ROCm candidate.
- **TPU/MPU/Coral**: not included per your call. If someone needs Coral, they can open an issue.
- **Automatic TP launcher**: this addendum only sets envs (`CUDA_MGPU`, `CUDA_TP_DEGREE`, `CUDA_GPUS`). Your runtime launcher should read these and spawn accordingly.

