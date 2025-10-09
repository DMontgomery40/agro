# Model Recommendations for RAG Service

This guide helps you choose the best embedding and inference models for your RAG service based on hardware, budget, and performance requirements.

Defaults in this repo:
- Generation defaults to local Qwen 3 (via Ollama). Configure with `GEN_MODEL` (e.g., `qwen3-coder:30b`) and `OLLAMA_URL`.
- Rerank defaults to Cohere (`RERANK_BACKEND=cohere`, `COHERE_RERANK_MODEL=rerank-3.5`). Provide `COHERE_API_KEY` or switch to local/HF cross‑encoder.

---

## 📊 Quick Decision Matrix

| Use Case | Embedding Model | Inference Model | Total Cost | Hardware |
|----------|----------------|-----------------|------------|----------|
| **Best Performance** | OpenAI text-embedding-3-large | GPT-4o mini | $$$ | Cloud API |
| **Best Value** | Google Gemini (free) | Gemini 1.5 Flash | $ | Cloud API |
| **Fully Local (Mac)** | nomic-embed-text (Ollama) | Qwen2.5-Coder 7B | Free | 16GB+ RAM |
| **Local High-End** | BGE-M3 / NV-Embed-v2 | Qwen3-Coder 30B | Free | 32GB+ RAM, M4 Max |
| **Privacy First** | BGE-large (local) | DeepSeek-Coder 33B | Free | 32GB+ RAM, GPU |
| **Budget Cloud** | Voyage AI voyage-3.5-lite | GPT-4o mini | $$ | Cloud API |

---

## 🎯 Embedding Models

### Cloud/API Embedding Models

#### 1. OpenAI text-embedding-3-large (Current Default) ⭐
- **Dimensions**: 3072
- **Cost**: $0.00013 / 1K tokens ($0.13 per million)
- **Performance**: 64.6% MTEB score
- **Best for**: High-quality retrieval, production systems
- **Pros**: Best OpenAI model, excellent performance, well-tested
- **Cons**: More expensive than alternatives

**How to use (already configured):**
```python
# Already in index_repo.py
from openai import OpenAI
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
emb = client.embeddings.create(model='text-embedding-3-large', input=[text])
```

#### 2. OpenAI text-embedding-3-small
- **Dimensions**: 1536
- **Cost**: $0.02 / 1M tokens (85% cheaper than 3-large)
- **Performance**: 75.8% accuracy (vs 80.5% for 3-large)
- **Best for**: Budget-conscious projects, acceptable quality loss
- **Tradeoff**: ~5-6% accuracy drop for 85% cost savings

**How to switch:**
```python
# In index_repo.py, change:
r = client.embeddings.create(model='text-embedding-3-small', input=sub)
# Also update Qdrant collection vector size to 1536
```

#### 3. Google Gemini Embeddings (Best Free Option) 🆓
- **Dimensions**: 768
- **Cost**: **FREE** (generous limits)
- **Performance**: 71.5% accuracy
- **Best for**: Small businesses, prototypes, cost-sensitive projects
- **Pros**: Completely free, high quality for price
- **Cons**: Requires Google Cloud setup, smaller dimensions

**How to use:**
```python
# Install: pip install google-generativeai
import google.generativeai as genai
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
result = genai.embed_content(model='models/embedding-001', content=text)
embedding = result['embedding']
```

#### 4. Voyage AI voyage-3.5-lite (Best Value)
- **Dimensions**: 1024
- **Cost**: Very low (one of cheapest commercial options)
- **Performance**: 66.1% accuracy
- **Best for**: Production RAG with tight budgets
- **Pros**: Excellent accuracy/cost ratio
- **Cons**: Smaller ecosystem than OpenAI

**How to use:**
```python
# Install: pip install voyageai
import voyageai
vo = voyageai.Client(api_key=os.getenv('VOYAGE_API_KEY'))
result = vo.embed([text], model='voyage-3.5-lite')
embedding = result.embeddings[0]
```

---

### Local Embedding Models (No API Costs)

#### 1. nomic-embed-text (Best for Mac/Ollama) ⭐
- **Dimensions**: 768
- **Size**: ~274MB
- **Performance**: 71% accuracy, surpasses OpenAI ada-002
- **Best for**: Apple Silicon Macs, local-first development
- **Pros**: Fast on M1/M2/M3/M4, multilingual, excellent Ollama support
- **Cons**: Smaller dimension count vs OpenAI

**How to use with Ollama:**
```bash
# Install Ollama: brew install ollama
ollama pull nomic-embed-text

# Use via API:
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "your code here"
}'
```

**Python integration:**
```python
# In index_repo.py
import requests
def get_local_embedding(text):
    resp = requests.post('http://localhost:11434/api/embeddings', json={
        'model': 'nomic-embed-text',
        'prompt': text
    })
    return resp.json()['embedding']
```

#### 2. BGE-large / BGE-M3 (High Accuracy Local)
- **Dimensions**: 1024 (BGE-large), 1024 (BGE-M3)
- **Size**: ~1.3GB
- **Performance**: 71.5% accuracy
- **Best for**: Multi-lingual, context-rich queries, high-end hardware
- **Pros**: Top-tier local model, supports 100+ languages
- **Cons**: Larger size, slower than nomic on inference

**How to use:**
```python
from sentence_transformers import SentenceTransformer

# For BGE-large
model = SentenceTransformer('BAAI/bge-large-en-v1.5')
embedding = model.encode(text, normalize_embeddings=True)

# For BGE-M3 (multi-lingual, multi-granularity)
model = SentenceTransformer('BAAI/bge-m3')
embedding = model.encode(text)
```

**Already integrated in hybrid_search.py as fallback!**

#### 3. NVIDIA NV-Embed-v2 (Best for NVIDIA GPUs)
- **Dimensions**: 1024
- **Size**: ~7GB
- **Performance**: 72.31% MTEB (former #1 on leaderboard)
- **Best for**: Teams with NVIDIA datacenter GPUs
- **Pros**: State-of-the-art accuracy, optimized for NVIDIA hardware
- **Cons**: Requires NVIDIA GPU, large model

**How to use:**
```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('nvidia/NV-Embed-v2', trust_remote_code=True)
embedding = model.encode(text)
```

**Note:** Not yet in Ollama, use directly via transformers.

#### 4. Qwen3-Embeddings (Apple Silicon Optimized)
- **Dimensions**: Varies (0.6B/4B/8B variants)
- **Throughput**: 44K tokens/sec on M4 Max
- **Best for**: Apple Silicon (M3/M4), high throughput needs
- **Pros**: MLX-optimized, extremely fast on Mac, hot-swappable
- **Cons**: Newer, less battle-tested

**How to use (MLX):**
```bash
# Install: pip install mlx-embeddings
# Or use qwen3-embeddings-mlx server:
git clone https://github.com/jakedahn/qwen3-embeddings-mlx
cd qwen3-embeddings-mlx && python server.py --model 4B
```

---

## 🤖 Inference/Generation Models

### Cloud/API Models (For LangGraph Generation)

#### 1. GPT-4o mini (Current Default) ⭐
- **Cost**: $0.15 / 1M input, $0.60 / 1M output
- **Performance**: 82.0% MMLU, 87.2% HumanEval (coding)
- **Speed**: ~80 tokens/sec
- **Context**: 128K tokens
- **Best for**: Balanced cost/performance, code generation
- **Pros**: Best coding performance, excellent reasoning
- **Cons**: Mid-range pricing

**Already configured in langgraph_app.py:**
```python
from openai import OpenAI
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
r = client.chat.completions.create(
    model='gpt-4o-mini',
    messages=[...],
    temperature=0.2
)
```

#### 2. Gemini 1.5 Flash (Best Value) 💰
- **Cost**: $0.075 / 1M input, $0.30 / 1M output (50% cheaper than GPT-4o mini)
- **Performance**: 77.9% MMLU, 71.5% HumanEval
- **Speed**: <0.2s time-to-first-token
- **Context**: **1M tokens** (8x more than GPT-4o mini)
- **Best for**: Large document processing, budget optimization
- **Pros**: Cheapest, massive context window
- **Cons**: Slightly lower coding accuracy

**How to switch:**
```python
# Install: pip install google-generativeai
import google.generativeai as genai
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

model = genai.GenerativeModel('gemini-1.5-flash')
response = model.generate_content(prompt)
answer = response.text
```

#### 3. Claude 3 Haiku
- **Cost**: $0.25 / 1M input, $1.25 / 1M output (most expensive)
- **Performance**: 73.8% MMLU, 75.9% HumanEval
- **Speed**: **165 tokens/sec** (fastest)
- **Context**: 200K tokens
- **Best for**: Real-time, latency-sensitive applications
- **Pros**: Fastest throughput, Anthropic quality
- **Cons**: 2x more expensive than Gemini

**How to switch:**
```python
# Install: pip install anthropic
import anthropic
client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

message = client.messages.create(
    model='claude-3-haiku-20240307',
    max_tokens=1024,
    messages=[{'role': 'user', 'content': prompt}]
)
answer = message.content[0].text
```

---

### Local Inference Models (No API Costs)

#### 1. Qwen2.5-Coder 7B/14B/32B (Best for Code) ⭐
- **Sizes**: 7B (~4GB), 14B (~8GB), 32B (~18GB)
- **Performance**: Excellent coding, 256K context, 100+ languages
- **Speed**: 100+ tokens/sec on M4 Max (32B)
- **Best for**: Local code generation, agentic workflows
- **Pros**: State-of-the-art local coding, huge context
- **Cons**: Larger models need 32GB+ RAM

**How to use with Ollama:**
```bash
# Install model
ollama pull qwen2.5-coder:7b    # or :14b, :32b

# Use via API
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5-coder:7b",
  "prompt": "Explain this code: ...",
  "stream": false
}'
```

**Python integration (replace OpenAI calls):**
```python
import requests

def local_generate(prompt, model='qwen2.5-coder:7b'):
    resp = requests.post('http://localhost:11434/api/generate', json={
        'model': model,
        'prompt': prompt,
        'stream': False
    })
    return resp.json()['response']
```

#### 2. DeepSeek-Coder V2 236B/16B
- **Sizes**: 16B (~9GB), 236B (requires multi-GPU)
- **Performance**: Competitive with GPT-4 on coding tasks
- **Context**: 16K tokens
- **Best for**: Advanced code reasoning, refactoring
- **Pros**: Open-source, permissive license, excellent quality
- **Cons**: 236B variant needs significant hardware

**Ollama setup:**
```bash
ollama pull deepseek-coder-v2:16b
```

#### 3. Code Llama 70B
- **Size**: ~38GB
- **Performance**: Strong coding, good documentation
- **Context**: 16K tokens (100K in long-context variant)
- **Best for**: Enterprise, proven track record
- **Pros**: Meta-backed, widely adopted, reliable
- **Cons**: Larger size, older architecture

**Ollama setup:**
```bash
ollama pull codellama:70b
```

#### 4. Phi-3 Mini (Fastest Local)
- **Size**: 3.8B (~2.3GB)
- **Performance**: Surprisingly good for size
- **Speed**: Very fast, runs on low-end hardware
- **Best for**: Resource-constrained environments, prototyping
- **Pros**: Tiny size, fast inference, decent quality
- **Cons**: Lower accuracy than larger models

**Ollama setup:**
```bash
ollama pull phi3:mini
```

---

## 🖥️ Hardware-Specific Recommendations

### Apple Silicon Macs (M1/M2/M3/M4)

#### M1/M2 (8-16GB RAM)
- **Embedding**: nomic-embed-text (Ollama)
- **Inference**: Qwen2.5-Coder 7B or Phi-3 Mini
- **Why**: Fits in memory, MLX-optimized, fast on unified memory

#### M3/M4 (16-32GB RAM)
- **Embedding**: nomic-embed-text or BGE-M3
- **Inference**: Qwen2.5-Coder 14B or DeepSeek-Coder 16B
- **Why**: More memory for larger models, better performance

#### M4 Pro/Max (32GB+ RAM)
- **Embedding**: BGE-M3 or Qwen3-Embeddings 8B
- **Inference**: Qwen2.5-Coder 32B or Code Llama 70B
- **Why**: High-end hardware can handle state-of-the-art local models

**Setup for Mac:**
```bash
# Install Ollama
brew install ollama

# Pull embedding model
ollama pull nomic-embed-text

# Pull inference model (choose based on RAM)
ollama pull qwen2.5-coder:7b     # 8-16GB
ollama pull qwen2.5-coder:14b    # 16-32GB
ollama pull qwen2.5-coder:32b    # 32GB+

# Start Ollama service
ollama serve
```

---

### Linux/Windows with NVIDIA GPU

#### GPU: 8-16GB VRAM
- **Embedding**: BGE-large or NV-Embed-v2
- **Inference**: Qwen2.5-Coder 14B or DeepSeek-Coder 16B
- **Why**: CUDA acceleration, good batch processing

#### GPU: 24GB+ VRAM (3090, 4090, A5000)
- **Embedding**: NV-Embed-v2
- **Inference**: Qwen2.5-Coder 32B or DeepSeek-Coder V2 236B
- **Why**: Full utilization of high-end hardware

#### GPU: 40GB+ VRAM (A100, H100)
- **Embedding**: NV-Embed-v2
- **Inference**: Code Llama 70B or DeepSeek-Coder V2 236B
- **Why**: Datacenter-grade, best local performance

**Setup for NVIDIA:**
```bash
# Install Ollama (with CUDA support auto-detected)
curl -fsSL https://ollama.com/install.sh | sh

# Pull models
ollama pull nomic-embed-text
ollama pull qwen2.5-coder:32b

# Models will automatically use GPU
```

---

### Linux without GPU (CPU-only)

#### 16-32GB RAM
- **Embedding**: BGE-large (quantized)
- **Inference**: Qwen2.5-Coder 7B or Phi-3 Mini
- **Why**: CPU inference is slow, stick to smaller models

#### 32GB+ RAM
- **Embedding**: BGE-large
- **Inference**: Qwen2.5-Coder 14B
- **Why**: More RAM allows slightly larger models

**Note**: CPU inference is 10-50x slower than GPU. Consider cloud APIs for production.

---

## 💡 Migration Guide

### Switch to Fully Local Setup (Mac Example)

**1. Install Ollama:**
```bash
brew install ollama
ollama serve  # Keep running in background
```

**2. Update `index_repo.py` for local embeddings:**
```python
# Add at top
import requests

def get_ollama_embedding(text):
    resp = requests.post('http://localhost:11434/api/embeddings', json={
        'model': 'nomic-embed-text',
        'prompt': text
    })
    return resp.json()['embedding']

# In embed_texts function, replace OpenAI call:
def embed_texts(texts: List, batch: int = 64) -> List[List[float]]:
    embs = []
    for text in texts:
        emb = get_ollama_embedding(text)
        embs.append(emb)
    return embs
```

**3. Update `langgraph_app.py` for local inference:**
```python
# Add at top
import requests

def local_generate(prompt):
    resp = requests.post('http://localhost:11434/api/generate', json={
        'model': 'qwen2.5-coder:7b',
        'prompt': prompt,
        'stream': False
    })
    return resp.json()['response']

# In generate_node, replace client.chat.completions.create:
content = local_generate(user_prompt)
```

**4. Update Qdrant vector size:**
```python
# nomic-embed-text is 768 dimensions (vs 3072 for OpenAI)
# In index_repo.py:
q.recreate_collection(
    collection_name=COLLECTION,
    vectors_config={
        "dense": models.VectorParams(size=768, distance=models.Distance.COSINE)
    }
)
```

**5. Re-index:**
```bash
REPO=vivified python index_repo.py
REPO=faxbot python index_repo.py
```

---

### Switch to Budget Cloud Setup (Gemini)

**1. Install SDK:**
```bash
pip install google-generativeai
```

**2. Get API key:**
- Go to: https://makersuite.google.com/app/apikey
- Create key, add to `.env`: `GOOGLE_API_KEY=...`

**3. Update `index_repo.py`:**
```python
import google.generativeai as genai
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

def embed_texts(texts: List, batch: int = 64) -> List[List[float]]:
    embs = []
    for i in range(0, len(texts), batch):
        sub = texts[i:i+batch]
        for text in sub:
            result = genai.embed_content(
                model='models/embedding-001',
                content=text
            )
            embs.append(result['embedding'])
    return embs
```

**4. Update `langgraph_app.py`:**
```python
import google.generativeai as genai
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

# In generate_node:
model = genai.GenerativeModel('gemini-1.5-flash')
response = model.generate_content(user_prompt)
content = response.text
```

---

## 📈 Performance vs Cost Summary

### Embeddings

| Model | Dimensions | Cost/1M tokens | MTEB Score | Speed | Hardware |
|-------|------------|----------------|------------|-------|----------|
| OpenAI 3-large | 3072 | $0.13 | 64.6% | Fast | Cloud |
| OpenAI 3-small | 1536 | $0.02 | ~62% | Fast | Cloud |
| Google Gemini | 768 | **FREE** | 71.5% | Fast | Cloud |
| Voyage 3.5-lite | 1024 | $0.01 | 66.1% | Fast | Cloud |
| nomic-embed-text | 768 | FREE | 71% | Fast | Local (Mac) |
| BGE-M3 | 1024 | FREE | 71% | Medium | Local (any) |
| NV-Embed-v2 | 1024 | FREE | 72.3% | Fast | Local (NVIDIA) |

### Inference

| Model | Cost/1M tokens | Coding Score | Speed | Context | Hardware |
|-------|----------------|--------------|-------|---------|----------|
| GPT-4o mini | $0.15/$0.60 | 87.2% | 80 t/s | 128K | Cloud |
| Gemini 1.5 Flash | $0.075/$0.30 | 71.5% | <0.2s TTFT | **1M** | Cloud |
| Claude 3 Haiku | $0.25/$1.25 | 75.9% | **165 t/s** | 200K | Cloud |
| Qwen2.5-Coder 7B | FREE | Excellent | 80+ t/s | 256K | Local |
| Qwen2.5-Coder 32B | FREE | **Best** | 100+ t/s | 256K | Local (32GB+) |
| DeepSeek-Coder 16B | FREE | Excellent | 60+ t/s | 16K | Local |

---

## 🔧 Recommendations by Scenario

### Startup/Prototype (Minimize Cost)
- **Embedding**: Google Gemini (free) or nomic-embed-text (local)
- **Inference**: Gemini 1.5 Flash ($0.075/1M)
- **Estimated cost**: $5-20/month for moderate usage

### Production (Balance Cost/Quality)
- **Embedding**: OpenAI text-embedding-3-small or Voyage 3.5-lite
- **Inference**: GPT-4o mini
- **Estimated cost**: $50-200/month depending on scale

### Enterprise (Best Quality, Privacy)
- **Embedding**: BGE-M3 or NV-Embed-v2 (local)
- **Inference**: Qwen2.5-Coder 32B or DeepSeek-Coder V2 (local)
- **Estimated cost**: Hardware only ($3K-10K Mac Studio or GPU server)

### Privacy-First (Fully Offline)
- **Embedding**: nomic-embed-text (Ollama, local)
- **Inference**: Qwen2.5-Coder 7B/14B (Ollama, local)
- **Estimated cost**: Hardware only (works on M1 Mac or mid-range PC)

---

## 📚 Additional Resources

- **MTEB Leaderboard**: https://huggingface.co/spaces/mteb/leaderboard
- **Ollama Models**: https://ollama.com/library
- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings
- **Continue.dev Embedding Guide**: https://docs.continue.dev/customize/model-roles/embeddings
- **Voyage AI**: https://www.voyageai.com/
- **MLX-Embeddings (Mac)**: https://github.com/Blaizzy/mlx-embeddings

---

**Based on**: Current MTEB leaderboard, vendor pricing, and community benchmarks
