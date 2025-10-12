#!/usr/bin/env python3
"""
Minimal eval loop with regression tracking.

Usage:
  python eval_loop.py                    # Run once
  python eval_loop.py --watch            # Run on file changes
  python eval_loop.py --baseline         # Save current results as baseline
  python eval_loop.py --compare          # Compare against baseline
"""
import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import Dict, List, Any
from dotenv import load_dotenv

load_dotenv()

# Import eval logic
from eval_rag import main as run_eval, hit, GOLDEN_PATH, USE_MULTI, FINAL_K
from retrieval.hybrid_search import search_routed, search_routed_multi


BASELINE_PATH = os.getenv('BASELINE_PATH', 'eval_baseline.json')


def run_eval_with_results() -> Dict[str, Any]:
    """Run eval and return detailed results."""
    if not os.path.exists(GOLDEN_PATH):
        return {"error": f"No golden file at {GOLDEN_PATH}"}

    gold = json.load(open(GOLDEN_PATH))
    total = len(gold)
    hits_top1 = 0
    hits_topk = 0
    results = []

    t0 = time.time()
    for i, row in enumerate(gold, 1):
        q = row['q']
        repo = row.get('repo') or os.getenv('REPO', 'project')
        expect = row.get('expect_paths') or []

        if USE_MULTI:
            docs = search_routed_multi(q, repo_override=repo, m=4, final_k=FINAL_K)
        else:
            docs = search_routed(q, repo_override=repo, final_k=FINAL_K)

        paths = [d.get('file_path', '') for d in docs]
        top1_hit = hit(paths[:1], expect) if paths else False
        topk_hit = hit(paths, expect) if paths else False

        if top1_hit:
            hits_top1 += 1
        if topk_hit:
            hits_topk += 1

        results.append({
            "question": q,
            "repo": repo,
            "expect_paths": expect,
            "top1_path": paths[:1],
            "top1_hit": top1_hit,
            "topk_hit": topk_hit,
            "top_paths": paths[:FINAL_K]
        })

    dt = time.time() - t0

    return {
        "total": total,
        "top1_hits": hits_top1,
        "topk_hits": hits_topk,
        "top1_accuracy": round(hits_top1 / max(1, total), 3),
        "topk_accuracy": round(hits_topk / max(1, total), 3),
        "final_k": FINAL_K,
        "use_multi": USE_MULTI,
        "duration_secs": round(dt, 2),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "results": results
    }


def save_baseline(results: Dict[str, Any]):
    """Save current results as baseline."""
    with open(BASELINE_PATH, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"✓ Baseline saved to {BASELINE_PATH}")


def compare_with_baseline(current: Dict[str, Any]):
    """Compare current results with baseline."""
    if not os.path.exists(BASELINE_PATH):
        print(f"⚠ No baseline found at {BASELINE_PATH}")
        print(f"  Run with --baseline to create one")
        return

    with open(BASELINE_PATH) as f:
        baseline = json.load(f)

    print("\n" + "="*60)
    print("REGRESSION CHECK: Current vs Baseline")
    print("="*60)

    curr_top1 = current["top1_accuracy"]
    base_top1 = baseline["top1_accuracy"]
    curr_topk = current["topk_accuracy"]
    base_topk = baseline["topk_accuracy"]

    delta_top1 = curr_top1 - base_top1
    delta_topk = curr_topk - base_topk

    print(f"\nTop-1 Accuracy:")
    print(f"  Baseline: {base_top1:.3f}")
    print(f"  Current:  {curr_top1:.3f}")
    print(f"  Delta:    {delta_top1:+.3f} {'✓' if delta_top1 >= 0 else '✗'}")

    print(f"\nTop-{FINAL_K} Accuracy:")
    print(f"  Baseline: {base_topk:.3f}")
    print(f"  Current:  {curr_topk:.3f}")
    print(f"  Delta:    {delta_topk:+.3f} {'✓' if delta_topk >= 0 else '✗'}")

    # Check for regressions per-question
    regressions = []
    improvements = []

    for i, (curr_res, base_res) in enumerate(zip(current["results"], baseline["results"])):
        if curr_res["question"] != base_res["question"]:
            continue  # skip if questions don't align

        if base_res["top1_hit"] and not curr_res["top1_hit"]:
            regressions.append((i+1, curr_res["question"], curr_res["repo"]))
        elif not base_res["top1_hit"] and curr_res["top1_hit"]:
            improvements.append((i+1, curr_res["question"], curr_res["repo"]))

    if regressions:
        print(f"\n⚠ REGRESSIONS ({len(regressions)} questions):")
        for idx, q, repo in regressions:
            print(f"  [{idx}] {repo}: {q}")

    if improvements:
        print(f"\n✓ IMPROVEMENTS ({len(improvements)} questions):")
        for idx, q, repo in improvements:
            print(f"  [{idx}] {repo}: {q}")

    if not regressions and delta_top1 >= -0.05 and delta_topk >= -0.05:
        print("\n✓ No significant regressions detected")
        return True
    else:
        print("\n✗ Regressions detected!")
        return False


def watch_mode():
    """Watch for file changes and re-run eval."""
    print("⏱ Watch mode: monitoring for changes...")
    print(f"   Watching: {GOLDEN_PATH}, hybrid_search.py, langgraph_app.py")

    files_to_watch = [
        GOLDEN_PATH,
        "hybrid_search.py",
        "langgraph_app.py",
        "index_repo.py",
        "rerank.py"
    ]

    last_mtimes = {}
    for fp in files_to_watch:
        if os.path.exists(fp):
            last_mtimes[fp] = os.path.getmtime(fp)

    while True:
        time.sleep(5)
        changed = False
        for fp in files_to_watch:
            if not os.path.exists(fp):
                continue
            mtime = os.path.getmtime(fp)
            if fp not in last_mtimes or mtime > last_mtimes[fp]:
                print(f"\n🔄 Change detected: {fp}")
                last_mtimes[fp] = mtime
                changed = True

        if changed:
            print("\n" + "="*60)
            print("Running eval...")
            print("="*60)
            results = run_eval_with_results()
            if "error" in results:
                print(f"Error: {results['error']}")
            else:
                print(json.dumps({
                    "top1_accuracy": results["top1_accuracy"],
                    "topk_accuracy": results["topk_accuracy"],
                    "total": results["total"],
                    "duration_secs": results["duration_secs"]
                }, indent=2))


def main():
    parser = argparse.ArgumentParser(description="RAG eval loop with regression tracking")
    parser.add_argument("--baseline", action="store_true", help="Save current results as baseline")
    parser.add_argument("--compare", action="store_true", help="Compare current results with baseline")
    parser.add_argument("--watch", action="store_true", help="Watch for file changes and re-run")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")

    args = parser.parse_args()

    if args.watch:
        watch_mode()
        return

    print("Running eval...")
    results = run_eval_with_results()

    if "error" in results:
        print(f"Error: {results['error']}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print("\n" + "="*60)
        print("EVAL RESULTS")
        print("="*60)
        print(f"Total questions: {results['total']}")
        print(f"Top-1 accuracy:  {results['top1_accuracy']:.1%} ({results['top1_hits']}/{results['total']})")
        print(f"Top-{FINAL_K} accuracy: {results['topk_accuracy']:.1%} ({results['topk_hits']}/{results['total']})")
        print(f"Duration:        {results['duration_secs']}s")
        print(f"Timestamp:       {results['timestamp']}")

        # Show failures
        failures = [r for r in results["results"] if not r["topk_hit"]]
        if failures:
            print(f"\n⚠ Failures ({len(failures)}):")
            for r in failures:
                print(f"  [{r['repo']}] {r['question']}")
                print(f"    Expected: {r['expect_paths']}")
                print(f"    Got: {r['top_paths'][:3]}")

    if args.baseline:
        save_baseline(results)
    elif args.compare:
        compare_with_baseline(results)


if __name__ == "__main__":
    main()
