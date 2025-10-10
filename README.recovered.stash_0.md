# AGRO

## another good rag option

---

This is a RAG (Retrieval-Augmented Generation) engine that:
- Maintains **strict separation** between repositories (never mixes them)
- Uses **hybrid search** (BM25 + dense embeddings + reranking)
- Provides **MCP tools** (stdio + HTTP modes) for Codex and Claude Code
- Includes **eval harness** with regression tracking
- Supports **multi-query expansion** and **local code hydration**
- Features **interactive CLI chat** with conversation memory

### Positioning (what we are — and aren’t)
- RAG-first: this repo is the retrieval + answer engine (your runtime).
- Codex/Claude are clients that call into this engine via MCP; they “wrap” the RAG, not the other way around.
- We are not an agent framework. We expose MCP tools (rag_answer, rag_search); external UIs invoke them.
- Your code and indexes remain local; MCP registration simply plugs your RAG into external UIs.

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>AGRO - Enterprise RAG Storage Calculator v1.2.1</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a; color: #ffffff; line-height: 1.6; padding: 40px 20px;
        }
        .main-container { max-width: 1400px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #2a2a2a; }
        .header h1 { font-size: 32px; font-weight: 300; letter-spacing: -1px; margin-bottom: 8px; }
        .header .brand { font-weight: 700; color: #00ff88; }
        .header .subtitle { color: #888; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }
        .calculators-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
        @media (max-width:1024px){ .calculators-grid { grid-template-columns: 1fr; } }
        .calculator { background:#111111; border:1px solid #2a2a2a; border-radius:8px; padding:24px; }
        .calculator-title { font-size:18px; font-weight:600; margin-bottom:20px; padding-bottom:12px; border-bottom:1px solid #2a2a2a; display:flex; align-items:center; gap:10px; }
        .calculator-badge { background:#00ff88; color:#000; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; text-transform:uppercase; }
        .input-section { margin-bottom:24px; }
        .input-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
        .input-group { display:flex; flex-direction:column; }
        .input-group.full-width { grid-column: span 2; }
        label { font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; font-weight:500; }
        .label-with-tooltip { display:flex; align-items:center; gap:6px; }
        .tooltip {
            display:inline-block; width:14px; height:14px; background:#333; color:#888; border-radius:50%;
            font-size:10px; text-align:center; line-height:14px; cursor:help; position:relative; font-weight:400;
        }
        .tooltip:focus,
        .tooltip:hover {
            background:#00ff88; color:#000; outline: none;
        }
        .tooltip:focus::after,
        .tooltip:hover::after {
            content: attr(data-tooltip);
            position:absolute; bottom:22px; left:50%; transform:translateX(-50%);
            background:#fff; color:#000; padding:8px 12px; border-radius:6px; font-size:12px;
            white-space:normal; z-index:20; max-width:280px; box-shadow:0 4px 12px rgba(0,0,0,0.3);
        }
        input, select {
            background:#1a1a1a; border:1px solid #333; color:#fff; padding:8px 12px; border-radius:4px;
            font-size:14px; font-family:'SF Mono','Monaco','Inconsolata',monospace; transition:all .18s;
        }
        input:focus, select:focus { outline:none; border-color:#00ff88; background:#1f1f1f; }
        .unit-input { display:flex; gap:8px; }
        .unit-input input { flex:1; }
        .unit-input select { width:70px; }
        .results { background:#0a0a0a; border:1px solid #2a2a2a; border-radius:4px; padding:16px; margin-top:20px; }
        .result-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
        .result-item { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a1a1a; }
        .result-label { font-size:12px; color:#666; text-transform:uppercase; letter-spacing:0.5px; }
        .result-value { font-size:14px; font-weight:600; color:#fff; font-family:'SF Mono','Monaco','Inconsolata',monospace; }
        .total-row { margin-top:16px; padding-top:16px; border-top:2px solid #2a2a2a; }
        .total-row .result-item { border:none; padding:12px; background:#1a1a1a; border-radius:4px; margin-bottom:8px; }
        .total-row .result-value { font-size:18px; color:#00ff88; }
        .warning { background:#331a00; border:1px solid #664400; color:#ffaa00; padding:8px 12px; border-radius:4px; font-size:12px; margin-top:8px; }
        .success { background:#003311; border:1px solid #006622; color:#00ff88; padding:8px 12px; border-radius:4px; font-size:12px; margin-top:8px; }
        .plans-section { margin-top:20px; padding-top:20px; border-top:1px solid #2a2a2a; }
        .plan-title { font-size:12px; text-transform:uppercase; color:#666; margin-bottom:12px; letter-spacing:1px; }
        .plan-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .plan-card { background:#0a0a0a; border:1px solid #2a2a2a; padding:12px; border-radius:4px; }
        .plan-card.fits { border-color:#006622; }
        .plan-card.exceeds { border-color:#664400; }
        .plan-name { font-size:14px; font-weight:600; margin-bottom:8px; }
        .plan-details { font-size:11px; color:#888; line-height:1.6; }
        .plan-total { margin-top:8px; padding-top:8px; border-top:1px solid #2a2a2a; font-size:14px; font-weight:600; }
        .fits .plan-total { color:#00ff88; }
        .exceeds .plan-total { color:#ffaa00; }
        .footer { text-align:center; margin-top:40px; padding-top:20px; border-top:1px solid #2a2a2a; color:#666; font-size:12px; }
        .footer a { color:#00ff88; text-decoration:none; }
        /* visible inline chunk warnings */
        .inline-warn { color:#ffb86b; font-size:12px; margin-top:6px; display:none; }
        /* copy button */
        .copy-btn { margin-top:12px; padding:8px 10px; border-radius:6px; background:#222; border:1px solid #333; color:#fff; cursor:pointer; }
        .copy-btn:active { transform: translateY(1px); }
    </style>
</head>
<body>
    <div class="main-container">
        <div class="header">
            <h1><span class="brand">AGRO</span> Storage Calculator Suite</h1>
            <p class="subtitle">Another Good RAG Option • Enterprise Memory Planning</p>
            <div style="max-width:800px;margin:20px auto 0;padding:15px;background:#1a1a1a;border-radius:8px;border:1px solid #333;">
                <p style="color:#aaa;font-size:13px;line-height:1.6;text-align:left;">
                    <strong style="color:#fff;">Left:</strong> Calculate exact storage needs for your configuration.<br>
                    <strong style="color:#fff;">Right:</strong> See if your data fits within a target limit using different strategies.
                </p>
            </div>
        </div>

        <div class="calculators-grid">
            <!-- Calculator 1 -->
            <div class="calculator">
                <div class="calculator-title">
                    Storage Requirements <span class="calculator-badge">Full Stack</span>
                </div>

                <p style="font-size:12px;color:#888;margin-bottom:20px;line-height:1.5;">
                    Calculate total storage for your chosen configuration with all components.
                </p>

                <div class="input-section">
                    <div class="input-row">
                        <div class="input-group">
                            <label for="calc1-repoSize">
                                <div class="label-with-tooltip">Repository Size
                                    <span class="tooltip" tabindex="0" data-tooltip="Total size of your data/documents to index">?</span>
                                </div>
                            </label>
                            <div class="unit-input">
                                <input type="number" id="calc1-repoSize" value="5" step="0.1" min="0.1" aria-label="Repository size value">
                                <select id="calc1-repoUnit" aria-label="Repository size unit">
                                    <option value="1073741824" selected>GiB</option>
                                    <option value="1099511627776">TiB</option>
                                    <option value="1048576">MiB</option>
                                </select>
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="calc1-chunkSize">
                                <div class="label-with-tooltip">Chunk Size
                                    <span class="tooltip" tabindex="0" data-tooltip="Size of text chunks for embedding. Typically 1–8 KiB">?</span>
                                </div>
                            </label>
                            <div class="unit-input">
                                <input type="number" id="calc1-chunkSize" value="4" step="1" min="1" aria-label="Chunk size value (KiB)">
                                <select id="calc1-chunkUnit" aria-label="Chunk size unit">
                                    <option value="1024" selected>KiB</option>
                                    <option value="1048576">MiB</option>
                                </select>
                            </div>
                            <div id="chunk-warning-1" class="inline-warn">⚠ chunk size must be > 0</div>
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label for="calc1-embDim">
                                <div class="label-with-tooltip">Embedding Dimension
                                    <span class="tooltip" tabindex="0" data-tooltip="Vector size examples: 128, 256, 512, 768, 1536">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc1-embDim" value="512" step="1" min="1" aria-label="Embedding dimension">
                        </div>
                        <div class="input-group">
                            <label for="calc1-precision">
                                <div class="label-with-tooltip">Precision
                                    <span class="tooltip" tabindex="0" data-tooltip="float32: full precision, float16: half size, int8: quarter size">?</span>
                                </div>
                            </label>
                            <select id="calc1-precision" aria-label="Data precision">
                                <option value="4" selected>float32</option>
                                <option value="2">float16</option>
                                <option value="1">int8</option>
                            </select>
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label for="calc1-qdrant">
                                <div class="label-with-tooltip">Qdrant Overhead
                                    <span class="tooltip" tabindex="0" data-tooltip="Vector DB index overhead multiplier (common: 1.2–1.8)">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc1-qdrant" value="1.5" step="0.1" min="1" aria-label="Qdrant overhead multiplier">
                        </div>
                        <div class="input-group">
                            <label for="calc1-hydration">
                                <div class="label-with-tooltip">Hydration %
                                    <span class="tooltip" tabindex="0" data-tooltip="% of raw data kept in RAM for instant retrieval. 0% = fetch on demand">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc1-hydration" value="100" step="10" min="0" max="100" aria-label="Hydration percentage">
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label for="calc1-redis">
                                <div class="label-with-tooltip">Redis Cache (MiB)
                                    <span class="tooltip" tabindex="0" data-tooltip="Session/chat memory storage; adjust to load expected sessions">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc1-redis" value="400" step="50" min="0" aria-label="Redis cache size (MiB)">
                        </div>
                        <div class="input-group">
                            <label for="calc1-replication">
                                <div class="label-with-tooltip">Replication Factor
                                    <span class="tooltip" tabindex="0" data-tooltip="Number of copies for HA/scaling">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc1-replication" value="3" step="1" min="1" aria-label="Replication factor">
                        </div>
                    </div>
                </div>

                <div class="results">
                    <div class="result-grid">
                        <div class="result-item"><span class="result-label">Chunks</span><span class="result-value" id="calc1-chunks">-</span></div>
                        <div class="result-item"><span class="result-label">Raw Embeddings</span><span class="result-value" id="calc1-embeddings">-</span></div>
                        <div class="result-item"><span class="result-label">Qdrant</span><span class="result-value" id="calc1-qdrantSize">-</span></div>
                        <div class="result-item"><span class="result-label">BM25 Index</span><span class="result-value" id="calc1-bm25">-</span></div>
                        <div class="result-item"><span class="result-label">Cards/Summary</span><span class="result-value" id="calc1-cards">-</span></div>
                        <div class="result-item"><span class="result-label">Hydration</span><span class="result-value" id="calc1-hydr">-</span></div>
                        <div class="result-item"><span class="result-label">Reranker</span><span class="result-value" id="calc1-reranker">-</span></div>
                        <div class="result-item"><span class="result-label">Redis</span><span class="result-value" id="calc1-redisSize">-</span></div>
                    </div>

                    <div class="total-row">
                        <div class="result-item"><span class="result-label">Single Instance</span><span class="result-value" id="calc1-single">-</span></div>
                        <div class="result-item"><span class="result-label">Replicated (×<span id="calc1-repFactor">3</span>)</span><span class="result-value" id="calc1-replicated">-</span></div>
                    </div>

                    <button id="copy-math" class="copy-btn">Copy byte math</button>
                </div>
            </div>

            <!-- Calculator 2 -->
            <div class="calculator">
                <div class="calculator-title">Optimization Planner <span class="calculator-badge">Fit Analysis</span></div>

                <p style="font-size:12px;color:#888;margin-bottom:20px;line-height:1.5;">
                    Compare two strategies: <strong>Minimal</strong> (smallest footprint, fetch on demand) vs <strong>Low Latency</strong> (everything in RAM).
                </p>

                <div class="input-section">
                    <div class="input-row">
                        <div class="input-group">
                            <label for="calc2-repoSize">
                                <div class="label-with-tooltip">Repository Size
                                    <span class="tooltip" tabindex="0" data-tooltip="Same as left calculator - your total data">?</span>
                                </div>
                            </label>
                            <div class="unit-input">
                                <input type="number" id="calc2-repoSize" value="5" step="0.1" min="0.1" aria-label="Repository size value">
                                <select id="calc2-repoUnit" aria-label="Repository size unit">
                                    <option value="1073741824" selected>GiB</option>
                                    <option value="1099511627776">TiB</option>
                                    <option value="1048576">MiB</option>
                                </select>
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="calc2-targetSize">
                                <div class="label-with-tooltip">Target Limit
                                    <span class="tooltip" tabindex="0" data-tooltip="Maximum storage you want to fit into (for plan fitting)">?</span>
                                </div>
                            </label>
                            <div class="unit-input">
                                <input type="number" id="calc2-targetSize" value="5" step="0.5" min="0.1" aria-label="Target storage limit">
                                <select id="calc2-targetUnit" aria-label="Target limit unit">
                                    <option value="1073741824" selected>GiB</option>
                                    <option value="1099511627776">TiB</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label for="calc2-chunkSize">
                                <div class="label-with-tooltip">Chunk Size
                                    <span class="tooltip" tabindex="0" data-tooltip="Smaller chunks = more vectors = more storage">?</span>
                                </div>
                            </label>
                            <div class="unit-input">
                                <input type="number" id="calc2-chunkSize" value="4" step="1" min="1" aria-label="Chunk size value (KiB)">
                                <select id="calc2-chunkUnit" aria-label="Chunk size unit">
                                    <option value="1024" selected>KiB</option>
                                    <option value="1048576">MiB</option>
                                </select>
                            </div>
                            <div id="chunk-warning-2" class="inline-warn">⚠ chunk size must be > 0</div>
                        </div>

                        <div class="input-group">
                            <label for="calc2-embDim">
                                <div class="label-with-tooltip">Embedding Dims
                                    <span class="tooltip" tabindex="0" data-tooltip="Must match your model choice">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc2-embDim" value="512" step="1" min="1" aria-label="Embedding dimension">
                        </div>
                    </div>

                    <div class="input-row">
                        <div class="input-group">
                            <label for="calc2-bm25pct">
                                <div class="label-with-tooltip">BM25 Overhead %
                                    <span class="tooltip" tabindex="0" data-tooltip="Text search index overhead - typical default 20%">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc2-bm25pct" value="20" step="5" min="0" max="100" aria-label="BM25 overhead percentage">
                        </div>
                        <div class="input-group">
                            <label for="calc2-cardspct">
                                <div class="label-with-tooltip">Cards/Summary %
                                    <span class="tooltip" tabindex="0" data-tooltip="Metadata/summaries overhead - typical default 10%">?</span>
                                </div>
                            </label>
                            <input type="number" id="calc2-cardspct" value="10" step="5" min="0" max="100" aria-label="Cards/summary percentage">
                        </div>
                    </div>
                </div>

                <div class="results">
                    <div class="result-grid">
                        <div class="result-item"><span class="result-label">Chunks</span><span class="result-value" id="calc2-chunks">-</span></div>
                        <div class="result-item"><span class="result-label">Repository</span><span class="result-value" id="calc2-baseStorage">-</span></div>
                    </div>

                    <div class="plan-title">Embedding Size by Precision (raw vectors only)</div>
                    <div class="result-grid">
                        <div class="result-item"><span class="result-label">float32 (baseline)</span><span class="result-value" id="calc2-float32">-</span></div>
                        <div class="result-item"><span class="result-label">float16 (half size)</span><span class="result-value" id="calc2-float16">-</span></div>
                        <div class="result-item"><span class="result-label">int8 (quarter size)</span><span class="result-value" id="calc2-int8">-</span></div>
                        <div class="result-item"><span class="result-label">Product Quantization (×8)</span><span class="result-value" id="calc2-pq8">-</span></div>
                    </div>

                    <div class="plans-section">
                        <div class="plan-title">Configuration Plans</div>
                        <div class="plan-grid">
                            <div class="plan-card" id="calc2-aggressive-plan">
                                <div class="plan-name">Minimal (No Hydration)</div>
                                <div class="plan-details" id="calc2-aggressive-details" style="line-height:1.8;">
                                    <strong>Includes:</strong><br>• Product Quantized vectors<br>• Qdrant index<br>• BM25 search<br>• Cards/metadata<br>• Reranker cache<br>• Redis<br>
                                    <strong>Excludes:</strong><br>• Raw data (fetched on-demand)
                                </div>
                                <div class="plan-total" id="calc2-aggressive-total">-</div>
                            </div>

                            <div class="plan-card" id="calc2-conservative-plan">
                                <div class="plan-name">Low Latency (Full Cache)</div>
                                <div class="plan-details" id="calc2-conservative-details" style="line-height:1.8;">
                                    <strong>Includes:</strong><br>• float16 vectors<br>• Qdrant index<br>• BM25 search<br>• Cards/metadata<br>• Reranker cache<br>• Redis<br>• <span style="color:#ffaa00;">Data in RAM (per left hydration %)</span>
                                </div>
                                <div class="plan-total" id="calc2-conservative-total">-</div>
                            </div>
                        </div>

                        <p style="font-size:11px;color:#666;margin:16px 0 8px;padding:12px;background:#0a0a0a;border-radius:4px;line-height:1.5;">
                            💡 <strong>Why the big difference?</strong> Low Latency keeps data in RAM based on hydration % from left panel (currently adding <span id="hydrationInfo">100%</span> of repo). Minimal stores compressed vectors and indexes only.
                        </p>

                        <div class="total-row" style="margin-top:20px;">
                            <div class="result-item"><span class="result-label">Minimal × <span id="calc2-aggRepFactor">3</span> replicas</span><span class="result-value" id="calc2-aggressive-replicated">-</span></div>
                            <div class="result-item"><span class="result-label">Low Latency × <span id="calc2-consRepFactor">3</span> replicas</span><span class="result-value" id="calc2-conservative-replicated">-</span></div>
                        </div>

                        <div id="calc2-status" style="margin-top:12px;"></div>
                    </div>
                </div>
            </div>

        </div>

        <div class="footer">
            <p>AGRO (Another Good RAG Option) • Enterprise Storage Calculator v1.2.1</p>
            <p>Precision calculations for vector search infrastructure</p>
        </div>
    </div>

    <script>
        // formatBytes: consistent binary units
        function formatBytes(bytes) {
            if (!isFinite(bytes)) return '—';
            if (bytes === 0) return '0 B';
            const abs = Math.abs(bytes);
            const KB = 1024;
            const MB = KB * 1024;
            const GB = MB * 1024;
            const TB = GB * 1024;
            const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
            if (abs < KB) return `${bytes.toFixed(0)} B`;
            if (abs < MB) return `${nf.format(bytes / KB)} KiB`;
            if (abs < GB) return `${nf.format(bytes / MB)} MiB`;
            if (abs < TB) return `${nf.format(bytes / GB)} GiB`;
            return `${nf.format(bytes / TB)} TiB`;
        }

        function formatNumber(num) { return new Intl.NumberFormat('en-US').format(num); }

        // Calculator 1
        function calculateStorage1() {
            const R = parseFloat(document.getElementById('calc1-repoSize').value) * parseFloat(document.getElementById('calc1-repoUnit').value);
            const C = parseFloat(document.getElementById('calc1-chunkSize').value) * parseFloat(document.getElementById('calc1-chunkUnit').value);

            const warnEl = document.getElementById('chunk-warning-1');
            if (!C || C <= 0 || !isFinite(C)) { if (warnEl) warnEl.style.display = 'block'; return; }
            else if (warnEl) warnEl.style.display = 'none';

            const D = parseFloat(document.getElementById('calc1-embDim').value);
            const B = parseFloat(document.getElementById('calc1-precision').value);
            const Q = parseFloat(document.getElementById('calc1-qdrant').value);
            const hydrationPct = parseFloat(document.getElementById('calc1-hydration').value) / 100;
            const redisBytes = parseFloat(document.getElementById('calc1-redis').value) * 1048576;
            const replFactor = parseFloat(document.getElementById('calc1-replication').value);

            const N = Math.ceil(R / C);
            const E = N * D * B;
            const Q_bytes = E * Q;
            const BM25 = 0.20 * R;
            const CARDS = 0.10 * R;
            const HYDR = hydrationPct * R;
            const RER = 0.5 * E;

            document.getElementById('calc1-chunks').textContent = formatNumber(N);
            document.getElementById('calc1-embeddings').textContent = formatBytes(E);
            document.getElementById('calc1-qdrantSize').textContent = formatBytes(Q_bytes);
            document.getElementById('calc1-bm25').textContent = formatBytes(BM25);
            document.getElementById('calc1-cards').textContent = formatBytes(CARDS);
            document.getElementById('calc1-hydr').textContent = formatBytes(HYDR);
            document.getElementById('calc1-reranker').textContent = formatBytes(RER);
            document.getElementById('calc1-redisSize').textContent = formatBytes(redisBytes);

            const singleTotal = E + Q_bytes + BM25 + CARDS + HYDR + RER + redisBytes;
            const criticalComponents = E + Q_bytes + HYDR + CARDS + RER;
            const replicatedTotal = singleTotal + (replFactor - 1) * criticalComponents;

            document.getElementById('calc1-single').textContent = formatBytes(singleTotal);
            document.getElementById('calc1-replicated').textContent = formatBytes(replicatedTotal);
            document.getElementById('calc1-repFactor').textContent = replFactor;
        }

        // Calculator 2 (reads shared fields from calc1)
        function calculateStorage2() {
            const R = parseFloat(document.getElementById('calc2-repoSize').value) * parseFloat(document.getElementById('calc2-repoUnit').value);
            const targetBytes = parseFloat(document.getElementById('calc2-targetSize').value) * parseFloat(document.getElementById('calc2-targetUnit').value);
            const C = parseFloat(document.getElementById('calc2-chunkSize').value) * parseFloat(document.getElementById('calc2-chunkUnit').value);

            const warnEl = document.getElementById('chunk-warning-2');
            if (!C || C <= 0 || !isFinite(C)) { if (warnEl) warnEl.style.display = 'block'; return; }
            else if (warnEl) warnEl.style.display = 'none';

            const D = parseFloat(document.getElementById('calc2-embDim').value);
            const bm25Pct = parseFloat(document.getElementById('calc2-bm25pct').value) / 100;
            const cardsPct = parseFloat(document.getElementById('calc2-cardspct').value) / 100;

            // Shared settings from calc1 for consistency
            const qdrantMultiplier = (document.getElementById('calc1-qdrant') ? parseFloat(document.getElementById('calc1-qdrant').value) : 1.5);
            const hydrationPct = (document.getElementById('calc1-hydration') ? (parseFloat(document.getElementById('calc1-hydration').value) / 100) : 1.0);
            const redisBytesInput = (document.getElementById('calc1-redis') ? parseFloat(document.getElementById('calc1-redis').value) * 1048576 : 390 * 1048576);
            const replicationFactor = (document.getElementById('calc1-replication') ? parseFloat(document.getElementById('calc1-replication').value) : 3);

            const N = Math.ceil(R / C);
            const E_float32 = N * D * 4;
            const E_float16 = E_float32 / 2;
            const E_int8 = E_float32 / 4;
            const E_pq8 = E_float32 / 8;

            const BM25 = bm25Pct * R;
            const CARDS = cardsPct * R;

            document.getElementById('calc2-chunks').textContent = formatNumber(N);
            document.getElementById('calc2-baseStorage').textContent = formatBytes(R);
            document.getElementById('calc2-float32').textContent = formatBytes(E_float32);
            document.getElementById('calc2-float16').textContent = formatBytes(E_float16);
            document.getElementById('calc2-int8').textContent = formatBytes(E_int8);
            document.getElementById('calc2-pq8').textContent = formatBytes(E_pq8);

            // Aggressive (PQ, no hydration)
            const aggressiveEmbedding = E_pq8;
            const aggressiveQ = E_pq8 * qdrantMultiplier;
            const aggressiveRer = 0.5 * E_pq8;
            const aggressiveTotal = aggressiveEmbedding + aggressiveQ + BM25 + CARDS + redisBytesInput + aggressiveRer;
            const aggressiveCritical = aggressiveEmbedding + aggressiveQ + CARDS + aggressiveRer;
            const aggressiveReplicated = aggressiveTotal + (replicationFactor - 1) * aggressiveCritical;
            const aggressiveFits = aggressiveTotal <= targetBytes;

            document.getElementById('calc2-aggressive-total').textContent = formatBytes(aggressiveTotal);
            document.getElementById('calc2-aggressive-replicated').textContent = formatBytes(aggressiveReplicated);
            document.getElementById('calc2-aggressive-plan').className = 'plan-card ' + (aggressiveFits ? 'fits' : 'exceeds');

            // Conservative (float16, full hydration)
            const conservativeEmbedding = E_float16;
            const conservativeQ = conservativeEmbedding * qdrantMultiplier;
            const conservativeRer = 0.5 * conservativeEmbedding;
            const conservativeHydration = hydrationPct * R;
            const conservativeTotal = conservativeEmbedding + conservativeQ + conservativeHydration + BM25 + CARDS + conservativeRer + redisBytesInput;
            const conservativeCritical = conservativeEmbedding + conservativeQ + conservativeHydration + CARDS + conservativeRer;
            const conservativeReplicated = conservativeTotal + (replicationFactor - 1) * conservativeCritical;
            const conservativeFits = conservativeTotal <= targetBytes;

            document.getElementById('calc2-conservative-total').textContent = formatBytes(conservativeTotal);
            document.getElementById('calc2-conservative-replicated').textContent = formatBytes(conservativeReplicated);
            document.getElementById('calc2-conservative-plan').className = 'plan-card ' + (conservativeFits ? 'fits' : 'exceeds');

            document.getElementById('calc2-aggRepFactor').textContent = replicationFactor;
            document.getElementById('calc2-consRepFactor').textContent = replicationFactor;

            const hydrationInfoEl = document.getElementById('hydrationInfo');
            if (hydrationInfoEl) hydrationInfoEl.textContent = Math.round(hydrationPct * 100) + '%';

            const statusEl = document.getElementById('calc2-status');
            if (aggressiveFits && conservativeFits) {
                statusEl.className = 'success';
                statusEl.textContent = '✓ Both configurations fit within your ' + formatBytes(targetBytes) + ' limit';
            } else if (aggressiveFits) {
                statusEl.className = 'warning';
                statusEl.textContent = '⚠ Only Minimal config fits. Low Latency needs ' + formatBytes(conservativeTotal - targetBytes) + ' more storage.';
            } else {
                statusEl.className = 'warning';
                statusEl.textContent = '⚠ Both exceed limit. Minimal needs ' + formatBytes(aggressiveTotal - targetBytes) + ' more. Consider larger chunks or stronger compression.';
            }
        }

        // copy math handler
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('copy-math')?.addEventListener('click', () => {
                const lines = [
                    `Chunks: ${document.getElementById('calc1-chunks').textContent}`,
                    `Raw embeddings: ${document.getElementById('calc1-embeddings').textContent}`,
                    `Qdrant: ${document.getElementById('calc1-qdrantSize').textContent}`,
                    `BM25: ${document.getElementById('calc1-bm25').textContent}`,
                    `Cards: ${document.getElementById('calc1-cards').textContent}`,
                    `Hydration: ${document.getElementById('calc1-hydr').textContent}`,
                    `Reranker: ${document.getElementById('calc1-reranker').textContent}`,
                    `Redis: ${document.getElementById('calc1-redisSize').textContent}`,
                    `Single total: ${document.getElementById('calc1-single').textContent}`,
                    `Replicated total: ${document.getElementById('calc1-replicated').textContent}`
                ].join('\n');
                navigator.clipboard?.writeText(lines).then(() => {
                    const b = document.getElementById('copy-math');
                    const orig = b.textContent;
                    b.textContent = 'Copied ✓';
                    setTimeout(()=> b.textContent = orig, 1200);
                });
            });

            // wire event listeners after DOM ready
            ['calc1-repoSize','calc1-repoUnit','calc1-chunkSize','calc1-chunkUnit','calc1-embDim','calc1-precision','calc1-qdrant','calc1-hydration','calc1-redis','calc1-replication']
                .forEach(id => document.getElementById(id)?.addEventListener('input', () => { calculateStorage1(); calculateStorage2(); }));

            ['calc2-repoSize','calc2-repoUnit','calc2-targetSize','calc2-targetUnit','calc2-chunkSize','calc2-chunkUnit','calc2-embDim','calc2-bm25pct','calc2-cardspct']
                .forEach(id => document.getElementById(id)?.addEventListener('input', calculateStorage2));

            // initial runs
            calculateStorage1();
            calculateStorage2();
        });
    </script>
</body>
</html>


---

| Feature ↓ · Tool →                   | **AGRO** | **Sourcegraph Cody** | **GitHub Copilot Ent.** | **Cursor** | **Codeium / Windsurf** | **Tabnine** | **Continue.dev (OSS)** | **LlamaIndex – Code (OSS)** | **Claude Code** | **JetBrains AI Assistant** |
| ------------------------------------ | --------------: | -------------------: | ----------------------: | ---------: | ---------------------: | ----------: | ---------------------: | --------------------------: | --------------: | -------------------------: |
| **OSS code available**               |              ✅|                    ❌ |                       ❌ |          ❌ |                      ❌ |           ❌ |                      ✅ |                           ✅ |               ❌ |                          ❌ |
| **Commercial plan exists**           |               ❌ |                    ✅ |                       ✅ |          ✅ |                      ✅ |           ✅ |                     🟨 |                          🟨 |               ✅ |                          ✅ |
| **Dense embeddings**                 |               ✅ |                    ❌ |                      🟨 |          ✅ |                      ✅ |           ✅ |                      ✅ |                           ✅ |              🟨 |                          ✅ |
| **Hybrid (sparse + dense)**          |               ✅ |                    ❌ |                      🟨 |         🟨 |                     🟨 |          🟨 |                     🟨 |                          🟨 |              🟨 |                         🟨 |
| **AST / code-graph chunking**        |               ✅ |                    ✅ |                       ❌ |          ❌ |                      ❌ |           ❌ |                     🟨 |                           ✅ |               ❌ |                          ✅ |
| **Reranker present**                 |               ✅ |                   🟨 |                      🟨 |         🟨 |                     🟨 |          🟨 |                      ✅ |                           ✅ |              🟨 |                         🟨 |
| **Incremental / streaming re-index** |               ✅ |                   🟨 |                      🟨 |          ✅ |                      ✅ |           ✅ |                     🟨 |                          🟨 |              🟨 |                         🟨 |
| **Symbol graph / LSP integration**   |               ❌ |                    ✅ |                      🟨 |         🟨 |                     🟨 |          🟨 |                     🟨 |                          🟨 |               ❌ |                          ✅ |
| **Multi-language**                   |               ✅ |                    ✅ |                       ✅ |          ✅ |                      ✅ |           ✅ |                      ✅ |                           ✅ |               ✅ |                          ✅ |
| **Cross-file reasoning**             |               ✅ |                    ✅ |                       ✅ |          ✅ |                      ✅ |           ✅ |                      ✅ |                          🟨 |               ✅ |                          ✅ |
| **Citations include path+line**      |              ✅ |                   🟨 |                      🟨 |         🟨 |                     🟨 |          🟨 |                     🟨 |                          🟨 |              🟨 |                         🟨 |
| **Vector DB explicitly noted**       |               ✅ |                    ❌ |                      🟨 |          ✅ |                     🟨 |           ✅ |                     🟨 |                           ✅ |               ❌ |                         🟨 |
| **IDE / CLI available**              |               ✅ |                    ✅ |                       ✅ |          ✅ |                      ✅ |           ✅ |                      ✅ |                          🟨 |               ✅ |                          ✅ |
| **MCP / API connectors**             |               ✅ |                    ✅ |                      🟨 |          ✅ |                      ✅ |          🟨 |                      ✅ |                           ❌ |               ✅ |                          ✅ |
| **GitHub / CI hooks**                |              ❌ |                    ✅ |                       ✅ |         🟨 |                      ✅ |          🟨 |                      ✅ |                          🟨 |              🟨 |                         🟨 |
| **Local-first option**               |               ✅ |                    ✅ |                       ❌ |         🟨 |                      ✅ |           ✅ |                      ✅ |                           ✅ |              🟨 |                          ❌ |
| **Telemetry / data controls**        |              ❌ |                   🟨 |                       ✅ |          ✅ |                      ✅ |           ✅ |                      ✅ |                           ✅ |              🟨 |                          ✅ |
| **Auth / SSO**                       |              ✅ |                    ✅ |                       ✅ |         🟨 |                      ✅ |           ✅ |                      ❌ |                           ❌ |               ✅ |                          ✅ |
| **Eval harness present**             |               ✅ |                   🟨 |                      🟨 |          ❌ |                     🟨 |          🟨 |                     🟨 |                           ✅ |               ❌ |                          ❌ |
| **Active maintenance (≤12 mo)**      |               ✅ |                    ✅ |                       ✅ |          ✅ |                      ✅ |           ✅ |                      ✅ |                           ✅ |               ✅ |                          ✅ |


----

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [Setup from Scratch](#setup-from-scratch)
4. [Configure RAG Ignore](#configure-rag-ignore)
5. [MCP Integration](#mcp-integration)
6. [CLI Chat Interface](#cli-chat-interface)
7. [Evaluation & Testing](#evaluation--testing)
8. [Daily Workflows](#daily-workflows)
9. [Troubleshooting](#troubleshooting)
10. [Model Selection](#model-selection)
11. [Performance & Cost](#performance--cost)

---

## Quick Start

**Prerequisites**
- Python 3.11+
- Docker Engine + Compose
  - macOS (no Docker Desktop): `brew install colima docker` then `colima start`
  - macOS (Docker Desktop): install Docker Desktop and start it
  - Linux: install Docker and Compose via your distro
- Optional local inference: Ollama installed and running (`ollama list`)
  - Linux without Python: `apt update && apt install -y python3 python3-venv python3-pip`

Warning on storage size
- Expect roughly ~4 GB used out‑of‑the‑box for: the Python virtualenv, BM25 index, embeddings cache, and Docker volumes (Qdrant + Redis). This grows with the size/number of repos you index.
- Local inference models (e.g., Qwen or other LLM weights) are additional and typically range from 7–20+ GB.
- You can skip indexing during setup to defer most of the storage usage and run it later.

No CUDA installed by default
- This project does not install CUDA. The Python stack installs CPU builds of PyTorch by default. GPU acceleration is optional and requires manual installation of CUDA-enabled wheels/drivers.

```bash
# 0) Get the code
git clone https://github.com/DMontgomery40/rag-service.git
cd rag-service

# 1) Start Docker (macOS without Docker Desktop)
#     Colima provides Docker on macOS: start it once
colima start   # if you installed `colima` via Homebrew

# 2) Bring infra + MCP up (Qdrant + Redis)
bash scripts/up.sh

# 3) One-command setup (recommended)
#     From THIS folder, pass your repo path/name. If you want to index THIS
#     repo itself, just use "." and a name you like.
bash scripts/setup.sh . rag-service

# 4) Start CLI chat (interactive)
export REPO=rag-service THREAD_ID=my-session
python -m venv .venv && . .venv/bin/activate  # if .venv not present yet
python chat_cli.py

# Optional: Run the HTTP API + stream
uvicorn serve_rag:app --host 127.0.0.1 --port 8012
curl "http://127.0.0.1:8012/search?q=oauth&repo=rag-service"
curl -N "http://127.0.0.1:8012/answer_stream?q=hello&repo=rag-service"

# MCP tools quick check (stdio)
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' | python mcp_server.py | head -n1
```

### Common setup hiccups (fast fixes)
- Docker not found on macOS: install and start Colima: `brew install colima docker && colima start`.
- “Permission denied” on scripts: run with an interpreter: `python scripts/quick_setup.py` or `bash scripts/setup.sh`.
- `python: command not found` on Linux: `apt update && apt install -y python3 python3-venv python3-pip`.
- “Is it frozen?”: use streaming (`python chat_cli.py --stream`) or run `bash scripts/setup.sh ...` and watch progress.

### Optional (Additive) Features

- SSE streaming (off by default)
  - Endpoint: `/answer_stream?q=...&repo=...`
  - CLI or UIs can opt-in to streaming via this endpoint; default remains blocking.
- OAuth bearer (off by default)
  - Enable with `OAUTH_ENABLED=true` and set `OAUTH_TOKEN=...`
  - Applies to `/answer`, `/search`, and `/answer_stream` when enabled.
- Node proxy (HTTP+SSE), optional
  - `docker compose -f docker-compose.services.yml --profile api --profile node up -d`
  - Proxies `/mcp/answer`, `/mcp/search`, `/mcp/answer_stream` to Python API.
- Docker (opt-in)
  - Python API image via `Dockerfile`
  - Node proxy via `Dockerfile.node`
  - Compose file: `docker-compose.services.yml` (profiles: `api`, `mcp-http`, `node`)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  AI Agents (Codex/Claude)   CLI Chat (local)                 CLI Chat (stream) │
└────────────┬───────────────────────┬──────────────┬───────────────────────────┘
             │ MCP stdio            │ MCP HTTP     │ HTTP (SSE)                
             ▼                       ▼              ▼                           
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐ 
│   mcp_server.py     │     │  mcp_server_http.py │     │     serve_rag.py    │ 
│   (stdio mode)      │     │  (HTTP mode)        │     │  (FastAPI /answer*) │ 
└──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘ 
           │                            │                           │            
           └──────────────┬─────────────┴──────────────┬────────────┘            
                          ▼                            ▼                         
                ┌──────────────────┐          ┌──────────────────┐               
                │  langgraph_app   │ ◄────────┤  hybrid_search   │               
                │   (LangGraph)    │          │   (Retrieval)    │               
                └─────────┬────────┘          └─────────┬────────┘               
                          │                             │                          
          ┌───────────────┴──────────────┐    ┌─────────┴────────┐               
          ▼                              ▼    ▼                  ▼               
   ┌──────────────┐               ┌──────────────┐       ┌──────────────┐        
   │   Qdrant     │               │    BM25S     │       │ Local Chunks │        
   │  (vectors)   │               │  (sparse)    │       │    (.jsonl)  │        
   └──────────────┘               └──────────────┘       └──────────────┘        
                          ▲                                                         
                          │                                                         
                  ┌───────┴────────┐                                                
                  │  index_repo.py │                                                
                  │  (indexing)    │                                                
                  └────────────────┘                                                

* /answer* = includes /answer (JSON) and /answer_stream (SSE)
```

### Key Components

| Component | Purpose | File |
|-----------|---------|------|
| **MCP Server (stdio)** | Tool server for local agents | `mcp_server.py` |
| **MCP Server (HTTP)** | Tool server for remote agents | `mcp_server_http.py` |
| **FastAPI** | HTTP REST API (`/health`, `/search`, `/answer`) | `serve_rag.py` |
| **LangGraph** | Iterative retrieval pipeline with Redis checkpoints | `langgraph_app.py` |
| **Hybrid Search** | BM25 + dense + rerank with repo routing | `hybrid_search.py` |
| **Indexer** | Chunks code, builds BM25, embeds, upserts Qdrant | `index_repo.py` |
| **CLI Chat** | Interactive terminal chat with memory | `chat_cli.py` |
| **Eval Harness** | Golden tests with regression tracking | `eval_loop.py` |
| **Cards Builder** | Summarizes chunks into `cards.jsonl` and builds BM25 over cards for high‑level retrieval | `build_cards.py` |
| **Reranker** | Cross‑encoder re‑ranking (Cohere rerank‑3.5 or local), plus filename/path/card/feature bonuses | `rerank.py` |
| **Embedding Cache** | Caches OpenAI embeddings to avoid re‑embedding unchanged chunks | `embed_cache.py` |
| **AST Chunker** | Language‑aware code chunking across ecosystems | `ast_chunker.py` |
| **Filtering** | Centralized file/dir pruning and source gating | `filtering.py` |
| **Generation Shim** | OpenAI Responses/Chat or local Qwen via Ollama with resilient fallbacks | `env_model.py` |

---

## Setup from Scratch

### Phase 1: Infrastructure

Note: This repo already includes `infra/docker-compose.yml` with relative volumes.
Prefer using `bash scripts/up.sh` or `cd infra && docker compose up -d` rather than
hand-writing a compose file.

```bash
# Create directory structure
mkdir -p /path/to/rag-service/{infra,data/qdrant,data/redis}

# Create docker-compose.yml
cat > /path/to/rag-service/infra/docker-compose.yml <<'YAML'
version: "3.8"
services:
  qdrant:
    image: qdrant/qdrant:v1.15.5
    container_name: qdrant
    restart: unless-stopped
    ports:
      - "6333:6333"
      - "6334:6334"
    environment:
      - QDRANT__STORAGE__USE_MMAP=false
      - QDRANT__STORAGE__ON_DISK_PERSISTENCE=true
    volumes:
      - /path/to/rag-service/data/qdrant:/qdrant/storage
  redis:
    image: redis/redis-stack:7.2.0-v10
    container_name: rag-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    environment:
      - REDIS_ARGS=--appendonly yes
    volumes:
      - /path/to/rag-service/data/redis:/data
YAML

# Start services
cd /path/to/rag-service/infra
docker compose up -d

# Verify
curl -s http://127.0.0.1:6333/collections  # Should return {"result":...}
docker exec rag-redis redis-cli ping       # Should return PONG
```

### Phase 2: Python Environment

```bash
cd /path/to/rag-service

# Create venv (if not exists)
python3 -m venv .venv
. .venv/bin/activate

# Install dependencies
pip install -r requirements-rag.txt
pip install -r requirements.txt

# For CLI chat (optional but recommended)
pip install rich

# Verify critical imports
python -c "import langgraph, qdrant_client, bm25s, sentence_transformers; print('✓ OK')"
```

### Phase 3: Environment Variables

Create `.env` file:

```bash
cat > .env <<'EOF'
# Infrastructure
QDRANT_URL=http://127.0.0.1:6333
REDIS_URL=redis://127.0.0.1:6379/0

# RAG Configuration
REPO=repo-a                     # Default repo for operations
MQ_REWRITES=4                   # Multi-query expansion count

# Reranker (default: Cohere with local fallback)
RERANK_BACKEND=cohere           # cohere | hf | local
COHERE_API_KEY=                 # Set this to enable Cohere rerank
COHERE_RERANK_MODEL=rerank-3.5  # or rerank-2.5

# Generation (default: local Qwen 3 via Ollama)
OLLAMA_URL=http://127.0.0.1:11434/api
GEN_MODEL=qwen3-coder:30b       # or qwen2.5-coder:7b for lower RAM

# Optional: OpenAI for generation (alternative to Ollama)
# OPENAI_API_KEY=sk-proj-...
# GEN_MODEL=gpt-4o-mini

# Optional: Embeddings provider
EMBEDDING_TYPE=openai           # openai | local | voyage | gemini
OPENAI_API_KEY=                 # Required for OpenAI embeddings
VOYAGE_API_KEY=                 # Required for Voyage embeddings

# Optional: Netlify multi-site deploys for MCP tool
NETLIFY_DOMAINS=site-a.com,site-b.com

# Optional: MCP integrations
NETLIFY_API_KEY=                # For netlify_deploy tool

# LangChain (optional)
LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=rag-service
EOF

chmod 600 .env  # Protect secrets
```

### Phase 4: Configure RAG Ignore

**This step is critical** - it prevents indexing noise, vendor code, and build artifacts.

The system has three layers of filtering:

#### 1. Built-in Filtering (`filtering.py`)
Automatically excludes common directories and file types:
- Directories: `node_modules/`, `vendor/`, `dist/`, `build/`, `.git/`, etc.
- File extensions: Only indexes code files (`.py`, `.js`, `.ts`, `.rb`, `.go`, etc.)

#### 2. Project-Specific Excludes (`data/exclude_globs.txt`)

Edit this file to add glob patterns for your repos:

```bash
cd /path/to/rag-service
cat data/exclude_globs.txt

# Add your patterns:
echo "**/my-vendor-dir/**" >> data/exclude_globs.txt
echo "**/*.generated.ts" >> data/exclude_globs.txt
echo "**/migrations/**" >> data/exclude_globs.txt
```

**Common patterns to exclude:**
```bash
# Build artifacts
**/dist/**
**/build/**
**/.next/**

# Generated code
**/*.generated.*
**/*.min.js
**/*.bundle.js

# Large data files
**/*.json.gz
**/fixtures/**
**/test-data/**

# Vendor/dependencies (if not caught by built-in)
**/third_party/**
**/external/**
```

#### 3. Auto-Generate Keywords (Optional)

The `scripts/` folder contains tools to analyze your codebase and generate optimal configurations:

```bash
cd /path/to/rag-service/scripts

# Analyze a repo to find important keywords
python analyze_keywords.py /path/to/your/repo-a

# Enhanced version with more insights
python analyze_keywords_v2.py /path/to/your/repo-a

# Output shows:
# - Most common file types
# - Directory structure
# - Suggested keywords for hybrid_search.py
# - Recommended path boosts
```

**After configuring .ragignore:**

```bash
# Re-index affected repos
REPO=repo-a python index_repo.py
REPO=repo-b python index_repo.py

# Verify collections
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name'
```

### Phase 5: Index Repositories

```bash
. .venv/bin/activate

# Index first repo (replace with your repo name)
REPO=repo-a python index_repo.py
# This will:
#   - Scan /path/to/your/repo-a (configured in index_repo.py)
#   - Chunk code files (Python, JS, TS, Ruby, Go, etc.)
#   - Build BM25 index
#   - Generate embeddings (OpenAI text-embedding-3-large by default)
#   - Upsert to Qdrant collection: code_chunks_repo-a
#   - Save chunks to: out/repo-a/chunks.jsonl

# Index second repo
REPO=repo-b python index_repo.py
# Same process, separate collection: code_chunks_repo-b

# Verify collections exist
curl -s http://127.0.0.1:6333/collections | jq '.result.collections[].name'
# Should show: code_chunks_repo-a, code_chunks_repo-b
```

**Configure repo paths:**

Edit the beginning of `index_repo.py` to set your repo locations:

```python
REPOS = {
    'repo-a': '/path/to/your/first-repo',
    'repo-b': '/path/to/your/second-repo',
}
```

---

## CLI Chat Interface

**Recommended for interactive use** - Terminal chat with conversation memory and rich formatting.

### Quick Start

```bash
. .venv/bin/activate

# Install rich library for terminal UI (if not already installed)
pip install rich

# Start chat
export REPO=repo-a
export THREAD_ID=my-session
python chat_cli.py
```

### Features

- **Conversation Memory**: Redis-backed, persists across sessions
- **Rich Terminal UI**: Markdown rendering, color-coded confidence scores
- **Citation Display**: Shows file paths and rerank scores
- **Repo Switching**: `/repo repo-b` to switch between repos mid-conversation
- **Multiple Sessions**: Use different `THREAD_ID` values for parallel conversations

### Commands

| Command | Description |
|---------|-------------|
| `your question` | Ask directly |
| `/repo <name>` | Switch repository (e.g., `/repo repo-b`) |
| `/clear` | Clear conversation history (new thread) |
| `/help` | Show available commands |
| `/exit`, `/quit` | Exit chat |

### Example Session

```
repo-a > Where is OAuth token validation handled?

[Claude retrieves and displays answer with citations]

📄 Top Sources:
  1. auth/oauth.py:42-67 (score: 0.85)
  2. middleware/token.py:89-120 (score: 0.78)

repo-a > /repo repo-b
✓ Switched to repo: repo-b

repo-b > How do we handle webhook retries?
```

See **[docs/CLI_CHAT.md](docs/CLI_CHAT.md)** for detailed usage.

---

## MCP Integration

The MCP (Model Context Protocol) server exposes RAG tools that AI agents can call directly.

### Server Modes

The system supports **three MCP modes**:

#### 1. **stdio Mode** (Default - for local agents)
- File: `mcp_server.py`
- Protocol: JSON-RPC over stdin/stdout
- Use for: Codex CLI, Claude Code (desktop app)

#### 2. **HTTP Mode** (for remote agents/platforms)
- File: `mcp_server_http.py`
- Protocol: HTTP at `/mcp` endpoint
- Use for: Remote evals, cloud platforms, web agents

#### 3. **HTTPS Mode** (HTTP + reverse proxy)
- Setup: Caddy/Nginx in front of HTTP mode
- Tunneling: ngrok or Cloudflare Tunnel support (coming soon)
- Use for: Production deployments, secure remote access

See **[docs/REMOTE_MCP.md](docs/REMOTE_MCP.md)** for HTTP/HTTPS setup.

### Tools Available

The MCP server exposes 4 tools:

#### 1. `rag_answer(repo, question)`
Full LangGraph pipeline (retrieval → generation)

**Returns:**
```json
{
  "answer": "[repo: repo-a]\nOAuth tokens are validated in...",
  "citations": [
    "auth/oauth.py:42-67",
    "middleware/token.py:89-120"
  ],
  "repo": "repo-a",
  "confidence": 0.78
}
```

#### 2. `rag_search(repo, question, top_k=10)`
Retrieval-only (no generation, faster for debugging)

**Returns:**
```json
{
  "results": [
    {
      "file_path": "controllers/api_controller.rb",
      "start_line": 45,
      "end_line": 89,
      "language": "ruby",
      "rerank_score": 0.82,
      "repo": "repo-b"
    }
  ],
  "repo": "repo-b",
  "count": 5
}
```

#### 3. `netlify_deploy(domain)`
Trigger Netlify builds (requires `NETLIFY_API_KEY`)

**Arguments:**
- `domain`: Site to deploy (e.g., `"site-a.com"`, or `"both"` to deploy all in `NETLIFY_DOMAINS`)

**Returns:**
```json
{
  "results": [
    {
      "domain": "site-a.com",
      "status": "triggered",
      "site_id": "abc123",
      "build_id": "def456"
    }
  ]
}
```

#### 4. `web_get(url, max_bytes=20000)`
HTTP GET for allowlisted documentation domains

**Allowlisted hosts:**
- `openai.com`
- `platform.openai.com`
- `github.com`
- `openai.github.io`

**Returns:**
```json
{
  "url": "https://github.com/openai/codex",
  "status": 200,
  "length": 12345,
  "clipped": true,
  "content_preview": "..."
}
```

### Connecting to Claude Code

Claude Code supports MCP servers natively via JSON configuration.

#### Step 1: Locate Config File

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Step 2: Add Server Config

Edit the config file (create if it doesn't exist):

```json
{
  "mcpServers": {
    "rag-service": {
      "command": "/path/to/rag-service/.venv/bin/python",
      "args": ["/path/to/rag-service/mcp_server.py"],
      "env": {
        "OPENAI_API_KEY": "sk-proj-...",
        "OLLAMA_URL": "http://127.0.0.1:11434/api",
        "GEN_MODEL": "qwen3-coder:30b",
        "QDRANT_URL": "http://127.0.0.1:6333",
        "REDIS_URL": "redis://127.0.0.1:6379/0"
      }
    }
  }
}
```

**Important:**
- Use **absolute paths** (no `~`)
- Include API keys if using OpenAI embeddings
- Include Ollama config if using local generation
- Restart Claude Code after editing

#### Step 3: Test in Claude Code

1. Open Claude Code
2. Start a new conversation
3. Look for MCP tools indicator
4. Test by asking:
   ```
   Use rag_search to find code related to "authentication" in repo-a
   ```

Claude Code will call the tool and display results.

### Connecting to Codex

Codex CLI has built-in MCP support via `codex mcp` commands.

#### Step 1: Install Codex CLI

```bash
# Via Homebrew (macOS)
brew install openai/tap/codex

# Via npm (all platforms)
npm install -g @openai/codex

# Verify
codex --version
```

#### Step 2: Register MCP Server

```bash
codex mcp add rag-service -- \
  /path/to/rag-service/.venv/bin/python \
  /path/to/rag-service/mcp_server.py
```

This adds the server to `~/.codex/config.toml`.

#### Step 3: Verify Registration

```bash
codex mcp list
# Should show:
# Name         Command                                    Args
# rag-service  /path/to/.venv/bin/python                  /path/to/mcp_server.py
```

#### Step 4: Test in Codex

```bash
codex
```

Then try:
```
User: Use rag_search to find code about "API endpoints" in repo-b

User: Use rag_answer to explain how authentication works in repo-a
```

### MCP Example Usage

**Example 1: Debug retrieval**
```
User: Use rag.search to see what code comes up for "webhook handling" in repo-b,
      show me the top 5 results
```

**Example 2: Get full answer**
```
User: Use rag.answer to explain how we validate OAuth tokens in repo-a
```

**Example 3: Trigger deployment**
```
User: Use netlify_deploy to rebuild site-a.com
```

**Example 4: Fetch documentation**
```
User: Use web_get to fetch https://platform.openai.com/docs/models
```

### MCP Server Management

```bash
# List all MCP servers
codex mcp list

# Remove a server
codex mcp remove rag-service

# Re-add with updated path
codex mcp add rag-service -- /path/to/python /path/to/mcp_server.py

# Test manually (stdio mode)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  .venv/bin/python mcp_server.py
```

---

## Evaluation & Testing

### Quick Eval Run

```bash
. .venv/bin/activate

# Run all golden tests once
python eval_loop.py

# Output:
# ===========================
# EVAL RESULTS
# ===========================
# Total questions: 10
# Top-1 accuracy:  70.0% (7/10)
# Top-5 accuracy:  90.0% (9/10)
# Duration:        12.4s
```

### Creating Golden Tests

Golden tests are in `golden.json`:

```json
[
  {
    "q": "Where is OAuth token validated?",
    "repo": "repo-a",
    "expect_paths": ["auth", "oauth", "token", "validation"]
  },
  {
    "q": "How do we handle webhook retries?",
    "repo": "repo-b",
    "expect_paths": ["webhook", "retry", "queue", "handler"]
  }
]
```

**Substring matching**: Any result containing these strings counts as a hit.

### Advanced Eval Features

#### Save Baseline

```bash
python eval_loop.py --baseline
# ✓ Baseline saved to eval_baseline.json
```

#### Compare vs Baseline (Regression Detection)

```bash
python eval_loop.py --compare

# Shows which questions regressed after code changes
```

#### Watch Mode (Continuous Eval)

```bash
python eval_loop.py --watch

# Auto-runs eval when files change
# Useful during active development
```

#### JSON Output (for CI/CD)

```bash
python eval_loop.py --json > results.json
```

---

## Daily Workflows

### Morning Startup

```bash
# Use the helper script (starts infra + MCP)
cd /path/to/rag-service
bash scripts/up.sh

# Or manually:
cd /path/to/rag-service/infra
docker compose up -d

# Start CLI chat
. .venv/bin/activate
export REPO=repo-a THREAD_ID=work-$(date +%Y%m%d)
python chat_cli.py
```

### After Code Changes (Re-index)

```bash
. .venv/bin/activate

# Re-index affected repo
REPO=repo-a python index_repo.py

# Run eval to check for regressions
python eval_loop.py --compare
```

**When to re-index:**
- After merging PRs
- When adding/removing files
- After significant refactors
- Daily/nightly via cron (optional)

### Debugging a Bad Answer

```bash
# 1. Use rag_search to see what was retrieved
python -c "
from hybrid_search import search_routed_multi
results = search_routed_multi('your question', repo_override='repo-a', final_k=10)
for r in results[:5]:
    print(f\"{r['rerank_score']:.3f} {r['file_path']}:{r['start_line']}\")
"

# 2. Check if expected file is in index
grep "path/to/file.py" out/repo-a/chunks.jsonl

# 3. If missing, check if .ragignore is excluding it
cat data/exclude_globs.txt
```

---

## Troubleshooting

### Infrastructure Issues

**Qdrant connection refused:**
```bash
# Check status
docker ps | grep qdrant

# Restart
docker restart qdrant

# Verify
curl -s http://127.0.0.1:6333/collections
```

**Redis connection fails:**
```bash
# Test
docker exec rag-redis redis-cli ping  # Should return PONG

# Restart
docker restart rag-redis
```

**Collections missing:**
```bash
# List collections
curl -s http://127.0.0.1:6333/collections | jq

# Re-index if missing
REPO=repo-a python index_repo.py
```

### Indexing Issues

**Files not being indexed:**
1. Check `.ragignore` patterns:
   ```bash
   cat data/exclude_globs.txt
   ```

2. Verify file extension is supported:
   ```bash
   grep "LANG_MAP" ast_chunker.py
   # Supported: .py, .js, .ts, .tsx, .rb, .go, .java, .cpp, .c, etc.
   ```

3. Check if directory is being pruned:
   ```bash
   grep "PRUNE_DIRS" filtering.py
   ```

**OpenAI rate limits (429 errors):**
- Indexing uses batched embeddings (64 per request)
- Wait between repos if hitting limits
- Consider using local embeddings (see Model Selection)

### MCP Issues

**Codex doesn't see tools:**
```bash
# Check registration
codex mcp list

# Re-register
codex mcp add rag-service -- /path/to/python /path/to/mcp_server.py

# Test manually
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  .venv/bin/python mcp_server.py
```

**Claude Code doesn't see tools:**
1. Check config file:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```
2. Verify absolute paths (no `~`)
3. Restart Claude Code completely

**"Graph not initialized" error:**
```bash
# Test Redis connection
docker exec rag-redis redis-cli ping

# Test graph initialization
python -c "from langgraph_app import build_graph; build_graph(); print('✓ OK')"
```

### Retrieval Quality Issues

**Low accuracy / wrong results:**

1. **Check index freshness:**
   ```bash
   ls -lh out/repo-a/chunks.jsonl out/repo-b/chunks.jsonl
   # If old, re-index
   ```

2. **Run eval:**
   ```bash
   python eval_loop.py
   ```

3. **Inspect retrieved docs:**
   ```bash
   python -c "
   from hybrid_search import search_routed_multi
   docs = search_routed_multi('your query', repo_override='repo-a', final_k=10)
   for d in docs[:5]:
       print(f\"{d['rerank_score']:.3f} {d['file_path']}\")
   "
   ```

4. **Adjust parameters** (see [Advanced Configuration](#advanced-configuration) section)

---

## Model Selection

The RAG service defaults to:
- **Generation**: Local Qwen 3 via Ollama (`GEN_MODEL=qwen3-coder:30b`)
- **Embeddings**: OpenAI `text-embedding-3-large` (auto-fallback to local BGE if unavailable)
- **Reranking**: Local cross-encoder (set `RERANK_BACKEND=cohere` + `COHERE_API_KEY` to use Cohere rerank-3.5)

### Quick Alternatives

| Goal | Embedding | Generation | Cost |
|------|-----------|------------|------|
| **Best Performance** | Voyage voyage-3-large | Qwen 3 (local) | $ |
| **Lowest Cost** | Google Gemini (free) | Gemini 2.5 Flash | Free |
| **Fully Local** | nomic-embed-text | Qwen2.5-Coder 7B | Free |
| **Privacy First** | BGE-M3 (local) | DeepSeek-Coder | Free |

### Self-Hosted Setup

**For Mac (M1/M2/M3/M4):**
```bash
# Install Ollama
brew install ollama

# For 8-16GB RAM
ollama pull nomic-embed-text
ollama pull qwen2.5-coder:7b

# For 32GB+ RAM
ollama pull qwen2.5-coder:32b
```

**For NVIDIA GPU (16GB+ VRAM):**
- Use Ollama or vLLM
- Models: Qwen2.5-Coder 32B, DeepSeek-Coder V2

### Detailed Guides

See **[docs/MODEL_RECOMMENDATIONS.md](docs/MODEL_RECOMMENDATIONS.md)** for:
- Current pricing (as of Oct 2025)
- Hardware requirements
- Performance benchmarks
- Migration guides
- Complete model comparison

**Note**: Model rankings change frequently. Always check current benchmarks:
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) - Embedding models
- [OpenLLM Leaderboard](https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard) - Generation models

---

## Advanced Configuration

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | For OpenAI embeddings/generation |
| `OLLAMA_URL` | `http://127.0.0.1:11434/api` | Ollama API endpoint |
| `GEN_MODEL` | `qwen3-coder:30b` | Generation model |
| `QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant server |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis connection |
| `REPO` | `repo-a` | Active repo name |
| `MQ_REWRITES` | `4` | Multi-query expansion count |
| `RERANK_BACKEND` | `cohere` | `cohere` \| `hf` \| `local` |
| `COHERE_API_KEY` | — | For Cohere reranking |
| `EMBEDDING_TYPE` | `openai` | `openai` \| `voyage` \| `local` \| `gemini` |
| `EMBEDDING_DEVICE` | — | Force device for local embeddings: `cuda` \| `mps` \| `xpu` (aliases: `intel`, `oneapi`) \| `cpu` |
| `EMBED_BATCH` | `128` | Batch size for SentenceTransformer encode |
| `BM25_ONLY` | — | If truthy, build BM25 and skip embeddings/Qdrant upsert |
| `EMBED_SAMPLE` | — | If set to integer N, embed only first N chunks (rest rely on BM25) |
| `NETLIFY_API_KEY` | — | For netlify_deploy tool |

### Tuning Retrieval

Edit `hybrid_search.py` to adjust:
- Layer bonuses (boost specific file types)
- Path bonuses (boost specific directories)
- Candidate counts (`topk_dense`, `topk_sparse`)

Edit `langgraph_app.py` to adjust:
- Confidence thresholds
- Multi-query rewrite count

### Adding New Languages

Edit `ast_chunker.py`:

```python
LANG_MAP = {
    ".py": "python",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",  # ← Add Rust
    # ... add more
}

FUNC_NODES = {
    "rust": {"fn_item", "impl_item"},  # ← Define AST nodes
    # ...
}
```

Then re-index.

---

## File Reference

### Core Files

| File | Purpose |
|------|---------|
| `mcp_server.py` | **MCP stdio server for local agents** |
| `mcp_server_http.py` | **MCP HTTP server for remote agents** |
| `chat_cli.py` | **Interactive CLI chat with memory** |
| `serve_rag.py` | FastAPI HTTP server |
| `langgraph_app.py` | LangGraph retrieval pipeline |
| `hybrid_search.py` | Hybrid search (BM25 + dense + rerank) |
| `index_repo.py` | Indexing script |
| `eval_loop.py` | Eval harness with regression tracking |

### Configuration

| File | Purpose |
|------|---------|
| `.env` | Environment variables (API keys, URLs) |
| `golden.json` | Golden test questions |
| `data/exclude_globs.txt` | **.ragignore patterns** |
| `filtering.py` | Built-in directory/extension filters |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/up.sh` | **Start infra + MCP (recommended)** |
| `scripts/down.sh` | Stop all services |
| `scripts/status.sh` | Check service status |
| `scripts/analyze_keywords.py` | **Generate keywords for your repos** |
| `scripts/analyze_keywords_v2.py` | Enhanced keyword analysis |

---

## Quick Command Reference

```bash
# === Infrastructure ===
bash scripts/up.sh                      # Start everything (recommended)
bash scripts/status.sh                  # Check status
bash scripts/down.sh                    # Stop everything

# === Indexing ===
. .venv/bin/activate
REPO=repo-a python index_repo.py
REPO=repo-b python index_repo.py

## GPU Acceleration (optional)

By default, embeddings run on CPU. You can enable GPU acceleration if your stack supports it. We do not install any GPU drivers or CUDA/oneAPI for you.

- NVIDIA (CUDA): install CUDA-enabled PyTorch from the official index-url, then set `EMBEDDING_DEVICE=cuda`.
- Apple Silicon (MPS): supported by default in recent PyTorch; set `EMBEDDING_DEVICE=mps` (macOS 12.3+).
- Intel GPU (oneAPI/XPU): requires Intel Extension for PyTorch (IPEX) and XPU-enabled PyTorch. After installing, set `EMBEDDING_DEVICE=xpu` (aliases: `intel`, `oneapi`).

Example:
```bash
# Choose local embedding backend (no API key) and direct it to GPU
export EMBEDDING_TYPE=local
export EMBEDDING_DEVICE=cuda     # or mps (Apple), xpu (Intel), cpu
export EMBED_BATCH=256           # tune per GPU memory
REPO=my-repo python index_repo.py
```

Notes:
- We do not install CUDA or vendor-specific GPU stacks. Install them yourself if desired.
- If `EMBEDDING_DEVICE` is unset, we auto-detect in this order: CUDA → MPS → XPU → CPU.
- Intel/XPU requires Intel’s PyTorch wheels and IPEX. If `torch.xpu.is_available()` returns false, it will fall back to CPU.

# === CLI Chat (Recommended) ===
export REPO=repo-a THREAD_ID=work-session
python chat_cli.py

# === API Server (Optional) ===
uvicorn serve_rag:app --host 127.0.0.1 --port 8012

# === Eval ===
python eval_loop.py                     # Run tests
python eval_loop.py --baseline          # Save baseline
python eval_loop.py --compare           # Check regressions
python eval_loop.py --watch             # Watch mode

# === MCP ===
codex mcp list                          # List servers
codex mcp add rag-service -- .venv/bin/python mcp_server.py
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  .venv/bin/python mcp_server.py        # Test manually

# === Keyword Generation ===
cd scripts
python analyze_keywords.py /path/to/repo-a
python analyze_keywords_v2.py /path/to/repo-a
```

---

## Claude Code Alone vs Claude Code + RAG

**RAG saves 91% tokens = 11x more queries before hitting your Claude rate limits.**

**Tested:** Oct 8, 2025 | **Claude:** Sonnet 4.5 on $200/mo Pro

| Approach | Tokens/Query | Queries/Week (Before Rate Limit) | Latency | Quality |
|----------|--------------|----------------------------------|---------|---------|
| **Claude Code Alone** | 12,700 | 100 (Sonnet) / 23 (Opus) | 5-10s | Excellent |
| **Claude Code + RAG** | 1,141 | **1,110 (Sonnet) / 263 (Opus)** | 2.9s | Excellent |
| **DIFFERENCE** | **-91%** | **+1,010% / +1,043%** | **2-3x faster** | Same |

**Why this matters:**
- ✅ **11x more queries** before hitting weekly rate limits
- ✅ **2-3x faster** (no file reading overhead)
- ✅ **Same quality** (excellent answers from both)
- ✅ **Never get rate limited** on heavy coding days (with Opus especially)

**The problem:** Claude Pro has weekly rate limits (~1.27M tokens/week for Sonnet, ~300K for Opus). Without RAG, you can hit those limits in a single day with Opus.

**The solution:** RAG reduces tokens by 91%, so you can code all week without hitting limits.

**📊 [See complete analysis](docs/PERFORMANCE_AND_COST.md)** | **[Contributing benchmarks](docs/CONTRIBUTING.md)**

---

## Additional Documentation

📂 **See [docs/README.md](docs/README.md) for complete documentation index**

- **[Performance & Cost Analysis](docs/PERFORMANCE_AND_COST.md)** - Real measurements & ROI calculator
- **[MCP Integration Guide](docs/MCP_README.md)** - Complete MCP documentation
- **[MCP Quick Start](docs/QUICKSTART_MCP.md)** - Fast reference
- **[Remote MCP Setup](docs/REMOTE_MCP.md)** - HTTP/HTTPS/tunneling
- **[CLI Chat Guide](docs/CLI_CHAT.md)** - Interactive terminal chat
- **[Model Recommendations](docs/MODEL_RECOMMENDATIONS.md)** - Current pricing & benchmarks
- **[Model Comparison](docs/GEN_MODEL_COMPARISON.md)** - Qwen vs OpenAI

---

**Version:** 2.0.0  
**Last Updated:** October 8, 2025

---

## Support & References

- **MCP Specification:** https://modelcontextprotocol.io/
- **Codex CLI:** https://github.com/openai/codex
- **LangGraph:** https://python.langchain.com/docs/langgraph
- **Qdrant:** https://qdrant.tech/documentation/
- **MTEB Leaderboard:** https://huggingface.co/spaces/mteb/leaderboard
