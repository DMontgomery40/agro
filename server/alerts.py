# server/alerts.py
# AlertManager webhook receiver and alert logging

import logging
import json
from typing import Any, Dict, List
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
monitoring_router = APIRouter(prefix="/monitoring", tags=["monitoring"])

# Alert history log file
ALERT_LOG = Path(__file__).parent.parent / "data" / "logs" / "alerts.jsonl"
ALERT_LOG.parent.mkdir(parents=True, exist_ok=True)


def _log_alert(alert_data: Dict[str, Any]):
    """Log alert to JSONL file for analysis and audit."""
    try:
        with open(ALERT_LOG, "a") as f:
            log_entry = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "alert": alert_data
            }
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        logger.error(f"Failed to log alert: {e}")


def _get_alert_summary(status: str, alerts: List[Dict]) -> str:
    """Generate human-readable alert summary."""
    if not alerts:
        return f"[{status}] No alerts"

    critical = [a for a in alerts if a.get("labels", {}).get("severity") == "critical"]
    warning = [a for a in alerts if a.get("labels", {}).get("severity") == "warning"]
    info = [a for a in alerts if a.get("labels", {}).get("severity") == "info"]

    parts = [f"[{status.upper()}]"]
    if critical:
        parts.append(f"🔴 {len(critical)} CRITICAL")
    if warning:
        parts.append(f"⚠️  {len(warning)} WARNING")
    if info:
        parts.append(f"📊 {len(info)} INFO")

    return " | ".join(parts)


@router.post("/alertmanager")
async def alertmanager_webhook(request: Request) -> Dict[str, str]:
    """
    Receive alerts from AlertManager.

    AlertManager sends POST requests with this structure:
    {
        "status": "firing" | "resolved",
        "groupLabels": {...},
        "commonLabels": {...},
        "commonAnnotations": {...},
        "alerts": [
            {
                "status": "firing" | "resolved",
                "labels": {"alertname": "...", "severity": "...", ...},
                "annotations": {"summary": "...", "description": "...", ...},
                "startsAt": "2021-01-01T00:00:00.000Z",
                "endsAt": "0001-01-01T00:00:00Z"
            },
            ...
        ],
        "receiver": "critical" | "warning" | "info",
        "groupKey": "...",
        "externalURL": "http://alertmanager:9093"
    }
    """
    try:
        data = await request.json()
        status = data.get("status", "unknown")
        alerts = data.get("alerts", [])

        # Log each alert
        for alert in alerts:
            _log_alert(alert)

            # Extract key info for logging
            alertname = alert.get("labels", {}).get("alertname", "Unknown")
            severity = alert.get("labels", {}).get("severity", "unknown")
            summary = alert.get("annotations", {}).get("summary", "No summary")
            description = alert.get("annotations", {}).get("description", "No description")

            # Log to application logger (will appear in container logs)
            log_level = {
                "critical": logging.CRITICAL,
                "warning": logging.WARNING,
                "info": logging.INFO
            }.get(severity, logging.INFO)

            logger.log(
                log_level,
                f"[{status.upper()}] {alertname} ({severity}): {summary}\n  {description}"
            )

        summary = _get_alert_summary(status, alerts)
        logger.info(f"AlertManager webhook: {summary}")

        # TODO: In production, integrate with notification services here:
        # - Slack: send_slack_notification(alerts)
        # - Email: send_email_notification(alerts)
        # - PagerDuty: trigger_pagerduty_incident(alerts)
        # - SMS: send_sms_alert(alerts)

        return {"status": "ok", "alerts_received": len(alerts)}

    except Exception as e:
        logger.error(f"Error processing AlertManager webhook: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@router.get("/alertmanager/status")
async def alertmanager_status() -> Dict[str, Any]:
    """Get recent alert history."""
    try:
        alerts = []
        if ALERT_LOG.exists():
            with open(ALERT_LOG, "r") as f:
                lines = f.readlines()
                # Return last 100 alerts
                for line in lines[-100:]:
                    try:
                        alerts.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass

        return {
            "total_alerts_logged": len(alerts),
            "recent_alerts": alerts[-10:],  # Last 10
            "log_file": str(ALERT_LOG)
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


@monitoring_router.get("/frequency-stats")
async def get_frequency_monitoring() -> Dict[str, Any]:
    """Get endpoint call frequency statistics to detect anomalies."""
    from server.frequency_limiter import get_frequency_stats
    return get_frequency_stats()

