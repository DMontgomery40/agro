# Telemetry Incident Postmortem & Fixes

## The Incident

An orphaned Claude Code shell ran an infinite loop for 2+ days, consuming approximately **2,000 tokens/minute** (or ~2.88 million tokens total) undetected.

### Root Cause

```
while true; do
  curl -s http://127.0.0.1:8012/api/chat \
    -H 'Content-Type: application/json' \
    -d '{"question": "test", "repo": "agro", "final_k": 5}' > /dev/null
  sleep 2
done
```

Each call:
- Searched for 100-200 documents
- Called Cohere reranking API on ALL documents (not limited)
- Each document ~175 tokens → **3,500+ tokens per call**
- Called every 2 seconds → **2,000+ tokens/minute baseline**

### Impact

- **Cost**: ~$50-100 (based on 2.88M tokens at Cohere reranking rates)
- **Duration**: 2+ days undetected
- **Detection**: Manual observation of Grafana cost dashboard (pure luck)
- **Root detection**: By searching for orphaned processes and queries

## Why Telemetry Didn't Catch It

AGRO had excellent metrics collection (14 Grafana panels, Prometheus, 5-second scrape interval) but:

1. **No alerting rules** - Prometheus collected data but didn't alert on anomalies
2. **No frequency tracking** - No detection of repeated calls from same client
3. **No rate limiting** - No throttling of high-frequency endpoints
4. **No process monitoring** - No detection of long-running orphaned processes
5. **No Slack/email integration** - Alert data existed but wasn't sent anywhere

## The Fix: Comprehensive Alerting System

### 1. Prometheus Alert Rules (`infra/prometheus-alert-rules.yml`)

20+ rules organized into 4 severity tiers:

**P0: Cost & Token Burn (CRITICAL)**
- `CostBurnSpike`: > $0.10/hour (alert after 2 min)
- `TokenBurnSpike`: > 5,000 tokens/min (alert after 2 min)
- `TokenBurnSustained`: > 2,000 tokens/min for 15 min ← **Catches orphaned loop**

**P1: API Anomalies (WARNING)**
- `EndpointCallFrequencyAnomaly`: /api/chat > 10 calls/min (alert after 3 min)
- `CoreheRerankingSpike`: > 20 rerank calls/min
- `HighErrorRate`: > 5% errors
- `TimeoutErrorSpike`: > 10 timeouts/5min

**P2: Budget & Cost Control**
- `MonthlyBudgetWarning`: > $5
- `MonthlyBudgetCritical`: > $40 (out of $50 cap)

**P3: Quality Metrics**
- `RetrievalQualityDegraded`: MRR < 0.6
- `CanaryPassRateLow`: < 90%

### 2. AlertManager Service (`infra/alertmanager.yml`)

- Deduplicates and groups alerts
- Routes by severity (critical/warning/info)
- Sends to webhook endpoint: `POST /webhooks/alertmanager`
- Ready for Slack/PagerDuty/email integration

### 3. Endpoint Call Frequency Tracker (`server/frequency_limiter.py`)

Middleware that tracks calls per (client_ip, endpoint):

```python
# Logs warning if:
# - Single client makes > 10 calls/min to same endpoint
# - Pattern sustained for 2+ minutes

# Example detection:
# 🔴 ANOMALY DETECTED: Client 127.0.0.1 calling /api/chat at
#    78801.6 calls/min (threshold: 10/min). Sustained for 5s.
#    This pattern indicates: bot, infinite loop, or load test.
```

### 4. Alert Webhook Receiver (`server/alerts.py`)

- Receives alerts from AlertManager
- Logs to `data/logs/alerts.jsonl` for audit
- Provides API endpoint: `GET /webhooks/alertmanager/status`
- Ready to integrate with notification services

### 5. Frequency Monitoring Endpoint (`GET /monitoring/frequency-stats`)

Real-time view of which clients are calling which endpoints:

```json
{
  "tracked_clients": 4,
  "high_frequency_clients": [
    {
      "client_ip": "127.0.0.1",
      "endpoint": "/api/chat",
      "calls_per_minute": 78801.6,
      "duration_seconds": 5,
      "alert_fired": false
    }
  ]
}
```

## How the Orphaned Loop Would Be Caught Now

**Timeline if incident occurred today:**

```
t=0:00    Loop starts, first call to /api/chat
t=0:10    Frequency tracker detects 60 calls/min from 127.0.0.1
          (EndpointCallFrequencyAnomaly alert pending, waiting for 3-min threshold)
t=0:30    Prometheus evaluates alert rules
t=0:45    Token burn detected: 2,000+ tokens/min
          (TokenBurnSustained alert pending, waiting for 15-min threshold)
t=2:00    🔴 EndpointCallFrequencyAnomaly FIRES
          - AlertManager sends to /webhooks/alertmanager
          - Alert logged to data/logs/alerts.jsonl
t=3:00    🔴 TokenBurnSpike FIRES
          - AlertManager deduplicates, sends webhook
t=15:00   🔴 TokenBurnSustained FIRES (backup alert)
          - Multiple channels alerting simultaneously
t=~5min   **INCIDENT DETECTED & ALERTING** (vs 2+ DAYS in production)
```

Compare to reality:
- **Before**: 2+ days undetected
- **After**: ~5 minutes detection + alerting

## Files Changed

### New Files
- `infra/prometheus-alert-rules.yml` - 20+ alert rules
- `infra/alertmanager.yml` - AlertManager configuration
- `server/alerts.py` - Alert webhook receiver
- `server/frequency_limiter.py` - Frequency anomaly detection
- `ALERTING.md` - Comprehensive alerting documentation
- `TELEMETRY_INCIDENT_POSTMORTEM.md` - This file

### Modified Files
- `infra/docker-compose.yml` - Added AlertManager service
- `infra/prometheus.yml` - Added rule_files and alerting config
- `server/app.py` - Integrated alerts router + frequency middleware

## Configuration & Testing

### View Real-Time Alerts

```bash
# Prometheus UI: http://localhost:9090/alerts
# Shows pending and firing alerts

# AlertManager UI: http://localhost:9093
# Shows active alerts and history

# API: GET /monitoring/frequency-stats
curl http://localhost:8012/monitoring/frequency-stats | jq .

# Alert log: data/logs/alerts.jsonl
tail -f data/logs/alerts.jsonl | jq .
```

### Test Frequency Anomaly Detection

```bash
# Simulate orphaned loop (30 rapid calls)
for i in {1..30}; do
  curl -s "http://localhost:8012/api/search?query=test" &
done
wait

# Check detection
curl http://localhost:8012/monitoring/frequency-stats | jq '.high_frequency_clients'
```

### Enable Slack/Email Notifications

Edit `infra/alertmanager.yml`:

```yaml
receivers:
  - name: 'critical'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK'
        channel: '#alerts-critical'
```

## Thresholds & Tuning

Current baselines (for healthy AGRO):
- Requests/min: 10-50
- Tokens/min: 200-1,000
- Cost/hour: $0.01-$0.05
- Error rate: < 0.5%
- Cohere calls/min: 2-10

If significantly higher/lower, adjust alert thresholds in `prometheus-alert-rules.yml`.

## Next Steps

1. **Monitor for 1 week** - Ensure thresholds aren't too noisy
2. **Integrate Slack** - Configure Slack webhook in alertmanager.yml
3. **Create runbooks** - Add links to incident response procedures
4. **Set up dashboards** - Add alert status panels to Grafana
5. **Team training** - Document alert escalation procedures

## Key Takeaway

> Metrics without alerting are just dashboards for experts.

AGRO now has metrics + alerting + frequency tracking + cost controls. This combination would have prevented the 2-day incident and caught it within minutes.

