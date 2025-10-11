from typing import Any, Dict, List, Optional, Tuple

Number = float


def _looks_local(model_id: Optional[str]) -> bool:
    return bool(model_id) and (":" in model_id)


def _any_true(d: Dict[str, Any], keys: List[str]) -> bool:
    return any(bool(d.get(k)) for k in keys)


def _safe_num(x: Any, default: Number = 0.0) -> Number:
    try:
        n = float(x)
        if n != n:  # NaN
            return default
        return n
    except Exception:
        return default


def _normalize_workload(workload: Dict[str, Any]) -> Dict[str, Number]:
    R = _safe_num(workload.get("requests_per_day"), 0)
    Tin = _safe_num(workload.get("tokens_in_per_req"), 0)
    Tout = _safe_num(workload.get("tokens_out_per_req"), 0)
    MQ = _safe_num(workload.get("mq_rewrites"), 1)
    E_tokens = _safe_num(workload.get("embed_tokens_per_req"), Tin) * MQ
    K_base = max(256.0, float(int(Tout // 4)))
    K_tokens = _safe_num(workload.get("rerank_tokens_per_req"), K_base) * MQ
    return dict(R=R, Tin=Tin, Tout=Tout, MQ=MQ, E_tokens=E_tokens, K_tokens=K_tokens)


def _weights(wl: Dict[str, Number]) -> Dict[str, Number]:
    W_GEN = wl["R"] * (wl["Tin"] + wl["Tout"])
    W_EMB = wl["R"] * wl["E_tokens"]
    W_RR = wl["R"] * wl["K_tokens"]
    total = W_GEN + W_EMB + W_RR
    if total <= 0:
        return dict(Wg=1 / 3, We=1 / 3, Wr=1 / 3)
    return dict(Wg=W_GEN / total, We=W_EMB / total, Wr=W_RR / total)


def _allowed_set(policy: Dict[str, Any]) -> set:
    providers = policy.get("providers_allowed") or []
    return set([p.lower() for p in providers if isinstance(p, str)])


def _meets_policy_maps(candidate: Dict[str, Any], policy: Dict[str, Any]) -> bool:
    regions_allowed = policy.get("regions_allowed")
    compliance = policy.get("compliance")
    for comp in ("GEN", "EMB", "RERANK"):
        row = candidate.get(comp, {})
        if not row:
            return False
        region = row.get("region")
        comp_flags = set(row.get("compliance", []) or [])
        if regions_allowed and region and region not in regions_allowed:
            return False
        if compliance and comp_flags and not comp_flags.issuperset(set(compliance)):
            return False
    return True


def _decorate_row(m: Dict[str, Any], comp_type: str) -> Dict[str, Any]:
    out = dict(m)
    out["comp"] = comp_type.upper()
    out["provider"] = (out.get("provider") or "").lower()
    qs = out.get("quality_score")
    if qs is None:
        # Nudge defaults to prefer cloud rows in performance mode tie-breaks
        # Non-local rows default slightly higher; local stubs slightly lower.
        out["quality_score"] = 0.55 if out["provider"] != "local" else 0.45
    else:
        out["quality_score"] = _safe_num(qs, 0.5)
    if out.get("latency_p95_ms") is not None:
        out["latency_p95_ms"] = _safe_num(out["latency_p95_ms"], None)
    if out.get("throughput_qps") is not None:
        out["throughput_qps"] = _safe_num(out["throughput_qps"], None)
    return out


def _component_rows(
    comp_type: str,
    ALLOW: set,
    prices: Dict[str, Any],
    include_local: bool = False,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    models = prices.get("models") or []
    comp = comp_type.upper()

    for m in models:
        prov = (m.get("provider") or "").lower()
        if prov == "local":
            continue
        if ALLOW and prov not in ALLOW:
            continue
        unit = (m.get("unit") or "")
        if comp == "GEN":
            if unit == "1k_tokens" and (
                _safe_num(m.get("input_per_1k")) > 0 or _safe_num(m.get("output_per_1k")) > 0
            ):
                rows.append(_decorate_row(m, comp))
        elif comp == "EMB":
            if _safe_num(m.get("embed_per_1k")) > 0:
                rows.append(_decorate_row(m, comp))
        elif comp == "RERANK":
            if _safe_num(m.get("rerank_per_1k")) > 0 or unit == "request":
                rows.append(_decorate_row(m, comp))

    if include_local and ((not ALLOW) or ("local" in ALLOW)):
        local_stub = dict(
            provider="local",
            model="local",
            unit="request",
            quality_score=0.5,
            latency_p95_ms=None,
            throughput_qps=None,
        )
        rows.insert(0, _decorate_row(local_stub, comp))

    rows.sort(key=lambda r: r["quality_score"], reverse=True)
    cap = 4 if comp == "GEN" else 3
    return rows[:cap]


def _pair_limited(GENs, EMBs, RRs, limit: int = 60) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for g in GENs:
        for e in EMBs:
            for r in RRs:
                out.append({"GEN": g, "EMB": e, "RERANK": r})
                if len(out) >= limit:
                    return out
    return out


def _valid_pipeline(c: Dict[str, Any]) -> bool:
    g = c.get("GEN")
    return bool(g and g.get("provider") and g.get("model"))


def _meets_slos(c: Dict[str, Any], slo: Dict[str, Any]) -> bool:
    target_ms = slo.get("latency_target_ms")
    min_qps = slo.get("min_qps")
    if target_ms is None and min_qps is None:
        return True
    for comp in ("GEN", "EMB", "RERANK"):
        row = c.get(comp, {})
        if target_ms is not None and row.get("latency_p95_ms") is not None:
            if _safe_num(row.get("latency_p95_ms")) > float(target_ms):
                return False
        if min_qps is not None and row.get("throughput_qps") is not None:
            if _safe_num(row.get("throughput_qps")) < float(min_qps):
                return False
    return True


def _monthly_cost(c: Dict[str, Any], wl: Dict[str, Number]) -> Number:
    R = wl["R"]
    Tin = wl["Tin"]
    Tout = wl["Tout"]
    E_tokens = wl["E_tokens"]
    K_tokens = wl["K_tokens"]
    P = 30.0

    def gen_cost(row):
        if row.get("provider") == "local":
            return 0.0
        inp = _safe_num(row.get("input_per_1k"))
        out = _safe_num(row.get("output_per_1k"))
        return (Tin / 1000.0) * inp + (Tout / 1000.0) * out

    def emb_cost(row):
        if row.get("provider") == "local":
            return 0.0
        emb = _safe_num(row.get("embed_per_1k"))
        return (E_tokens / 1000.0) * emb

    def rr_cost(row):
        if row.get("provider") == "local":
            return 0.0
        rrk = row.get("rerank_per_1k")
        if rrk is not None:
            return (K_tokens / 1000.0) * _safe_num(rrk)
        return _safe_num(row.get("per_request"))

    per_req = gen_cost(c["GEN"]) + emb_cost(c["EMB"]) + rr_cost(c["RERANK"])
    return per_req * R * P


def _lat_bonus(lat_ms: Optional[Number], target_ms: Optional[Number], alpha=0.02, beta=0.05) -> Number:
    if lat_ms is None or target_ms is None:
        return 0.0
    if lat_ms <= target_ms:
        return alpha
    return -beta * ((lat_ms - target_ms) / target_ms)


def _utility(c: Dict[str, Any], wl_w: Dict[str, Number], defaults: Dict[str, Any], slo: Dict[str, Any]) -> Number:
    Qg = _safe_num(c["GEN"].get("quality_score"), 0.5)
    Qe = _safe_num(c["EMB"].get("quality_score"), 0.5)
    Qr = _safe_num(c["RERANK"].get("quality_score"), 0.5)
    target_ms = slo.get("latency_target_ms")
    Lg = _lat_bonus(c["GEN"].get("latency_p95_ms"), target_ms)
    Le = _lat_bonus(c["EMB"].get("latency_p95_ms"), target_ms)
    Lr = _lat_bonus(c["RERANK"].get("latency_p95_ms"), target_ms)
    U_gen = Qg + Lg
    U_emb = Qe + Le
    U_rr = Qr + Lr
    U = wl_w["Wg"] * U_gen + wl_w["We"] * U_emb + wl_w["Wr"] * U_rr
    def_gen = defaults.get("gen_model")
    if def_gen and c["GEN"].get("model") == def_gen:
        U += 0.01
    return U


def _select_cost(C: List[Dict[str, Any]], B: Optional[Number]) -> Dict[str, Any]:
    if B is not None:
        feasible = [c for c in C if c["monthly"] <= B]
        if feasible:
            return min(feasible, key=lambda x: x["monthly"])
    return min(C, key=lambda x: x["monthly"])


def _select_performance(C: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Maximize utility. If tie, prefer higher sum of component qualities; then tie-break by min cost.
    bestU = max(c["utility"] for c in C)
    top = [c for c in C if c["utility"] == bestU]
    if len(top) <= 1:
        return top[0]
    def qsum(c: Dict[str, Any]) -> Number:
        return _safe_num(c["GEN"].get("quality_score"), 0.0) + _safe_num(c["EMB"].get("quality_score"), 0.0) + _safe_num(c["RERANK"].get("quality_score"), 0.0)
    bestQ = max(qsum(c) for c in top)
    top2 = [c for c in top if qsum(c) == bestQ]
    return min(top2, key=lambda x: x["monthly"])


def _select_balanced(C: List[Dict[str, Any]], B: Optional[Number]) -> Dict[str, Any]:
    if B is not None:
        feasible = [c for c in C if c["monthly"] <= B]
        if feasible:
            bestU = max(c["utility"] for c in feasible)
            top = [c for c in feasible if c["utility"] == bestU]
            return min(top, key=lambda x: x["monthly"])
        lam = 1.0 / (B if B and B > 0 else 1.0)
        def score(c):
            return c["utility"] - lam * (c["monthly"] - B)

        return max(C, key=score)
    return _select_performance(C)


def autoprofile(request: Dict[str, Any], prices: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, Any]]:
    hw = request.get("hardware", {})
    rt = hw.get("runtimes", {}) or {}
    policy = request.get("policy", {}) or {}
    wl = _normalize_workload(request.get("workload", {}) or {})
    obj = request.get("objective", {}) or {}
    defaults = request.get("defaults", {}) or {}

    ALLOW = _allowed_set(policy)
    local_cap = _any_true(rt, ["cuda", "ollama", "coreml", "openvino", "vpu", "npu", "mps"])
    B = obj.get("monthly_budget_usd")
    mode = (obj.get("mode") or "balanced").lower()
    slo = {"latency_target_ms": obj.get("latency_target_ms"), "min_qps": obj.get("min_qps")}

    W = _weights(wl)

    # Diagnostics: available rows under current provider policy
    diag = {
        "providers_allowed": sorted(list(ALLOW)) if ALLOW else None,
        "local_cap": bool(local_cap),
        "rows": {
            "gen": len(_component_rows("GEN", ALLOW, prices, include_local=False)),
            "emb": len(_component_rows("EMB", ALLOW, prices, include_local=local_cap)),
            "rerank": len(_component_rows("RERANK", ALLOW, prices, include_local=local_cap)),
        }
    }

    def build_candidates(AL: set) -> List[Dict[str, Any]]:
        C: List[Dict[str, Any]] = []
        if local_cap:
            gen_local = defaults.get("gen_model") if _looks_local(defaults.get("gen_model")) else None
            top_cloud_gen = _component_rows("GEN", AL, prices, include_local=False)
            GENs = [{"provider": "local", "model": gen_local}] if gen_local else top_cloud_gen
            EMBs = _component_rows("EMB", AL, prices, include_local=True)
            RRs = _component_rows("RERANK", AL, prices, include_local=True)
            C.extend(_pair_limited(GENs, EMBs, RRs, limit=60))
        GENs = _component_rows("GEN", AL, prices, include_local=False)
        EMBs = _component_rows("EMB", AL, prices, include_local=local_cap)
        RRs = _component_rows("RERANK", AL, prices, include_local=local_cap)
        C.extend(_pair_limited(GENs, EMBs, RRs, limit=60))
        C = [c for c in C if _valid_pipeline(c)]
        C = [c for c in C if _meets_slos(c, slo)]
        try:
            C = [c for c in C if _meets_policy_maps(c, policy)]
        except Exception:
            pass
        return C

    C = build_candidates(ALLOW)

    # Fallback: if providers_allowed is non-empty and produced no candidates, relax provider filter once.
    relaxed = False
    if not C and ALLOW:
        C = build_candidates(set())
        relaxed = bool(C)

    if not C:
        return {}, {"error": "no_viable_candidate", "why": "after building/filters", "providers_allowed": list(ALLOW), "diag": diag}

    for c in C:
        c["monthly"] = _monthly_cost(c, wl)
        c["utility"] = _utility(c, W, defaults, slo)

    if mode == "cost":
        winner = _select_cost(C, B)
    elif mode == "performance":
        winner = _select_performance(C)
    else:
        winner = _select_balanced(C, B)

    env: Dict[str, str] = {
        "HYDRATION_MODE": "lazy",
        "MQ_REWRITES": str(int(wl["MQ"]) if wl["MQ"] > 0 else 1),
        "GEN_MODEL": winner["GEN"]["model"],
        "EMBEDDING_TYPE": "local" if winner["EMB"]["provider"] == "local" else winner["EMB"]["provider"],
        "RERANK_BACKEND": "local" if winner["RERANK"]["provider"] == "local" else winner["RERANK"]["provider"],
    }
    if env["RERANK_BACKEND"] == "cohere":
        env["COHERE_RERANK_MODEL"] = winner["RERANK"]["model"]

    reason = {
        "objective": mode,
        "budget": B,
        "workload": wl,
        "weights": W,
        "candidates_total": len(C),
        "selected": {
            "gen": winner["GEN"],
            "embed": winner["EMB"],
            "rerank": winner["RERANK"],
            "monthly": winner["monthly"],
            "utility": winner["utility"],
        },
        "policy_relaxed": relaxed,
        "diag": diag,
    }
    return env, reason
