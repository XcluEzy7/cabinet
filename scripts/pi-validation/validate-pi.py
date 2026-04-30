#!/usr/bin/env python3
"""Pi CLI Validator for Cabinet
Validates Pi Coding Agent integration in Cabinet by:
1. Checking Pi binary availability
2. Listing all 10 Pi models
3. Running a test prompt through the JSONL parser
4. Reporting capability to Cabinet

Usage:
    python3 validate-pi.py
    python3 validate-pi.py --model gpt-5.1 --prompt "Write hello world"
"""
import argparse
import json
import subprocess
import sys
import os

PI_OFFLINE = "1"

def check_pi_available():
    """Check if Pi binary is on PATH."""
    try:
        result = subprocess.run(
            ["pi", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            env={**os.environ, "PI_OFFLINE": PI_OFFLINE}
        )
        if result.returncode == 0:
            return True, result.stdout.strip()
        return False, result.stderr.strip()
    except Exception as e:
        return False, str(e)

def list_models():
    """List all available Pi models via --list-models."""
    try:
        result = subprocess.run(
            ["pi", "--list-models"],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, "PI_OFFLINE": PI_OFFLINE}
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            # Skip header
            models = [l.strip() for l in lines if l.strip() and not l.startswith('Available')]
            return True, models
        return False, result.stderr
    except Exception as e:
        return False, str(e)

def test_run(model: str | None, prompt: str):
    """Run a test prompt through Pi and return JSONL output.
    Pi v0.70.2 sometimes hangs after emitting the final agent_end event,
    so we wrap in `timeout` and allow exit code 124 (SIGTERM) as success if
    we captured JSONL output.
    """
    args_ = ["pi", "-p", "--mode", "json", "--no-session"]
    if model:
        args_.extend(["--model", model])
    args_.append(prompt)

    # Use coreutils timeout to handle Pi's hang-after-completion behavior (v0.70.2)
    cmd = ["timeout", "25"] + args_

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=35,
            cwd=os.getcwd(),
            env={**os.environ, "PI_OFFLINE": PI_OFFLINE}
        )
        # Pi sometimes exits 124 (SIGTERM from timeout) after emitting valid JSONL.
        # Treat this as okay if we parsed something.
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "Pi command timed out (outer 35s)", 1
    except Exception as e:
        return "", str(e), 1

def extract_text_from_jsonl(stdout: str) -> str:
    """Replicate the Cabinet pi-local adapter's extractor."""
    text = ""
    for line in stdout.strip().split('\n'):
        if not line.strip():
            continue
        try:
            evt = json.loads(line)
            # Prefer message_end (finalized text)
            if evt.get("type") == "message_end":
                msg = evt.get("message", {})
                if msg.get("role") == "assistant":
                    content = msg.get("content", [])
                    if isinstance(content, str):
                        return content
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            return item.get("text", "")
            # Fallback to agent_end
            if evt.get("type") == "agent_end":
                msgs = evt.get("messages", [])
                if msgs and not text:
                    for m in reversed(msgs):
                        if m.get("role") == "assistant":
                            c = m.get("content", [])
                            if isinstance(c, str):
                                return c
                            for item in c:
                                if isinstance(item, dict) and item.get("type") == "text":
                                    return item.get("text", "")
        except json.JSONDecodeError:
            continue
    return text

def main():
    parser = argparse.ArgumentParser(description="Validate Pi CLI in Cabinet")
    parser.add_argument("--model", help="Specific Pi model to test")
    parser.add_argument("--prompt", default="Say 'Pi CLI is working' in exactly 3 words.", help="Test prompt")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    report = {}
    
    # 1. Binary check
    ok, msg = check_pi_available()
    report["binaryAvailable"] = ok
    report["version"] = msg if ok else None
    report["versionError"] = msg if not ok else None
    
    # 2. Models
    if ok:
        models_ok, models = list_models()
        report["modelsAvailable"] = models_ok
        report["models"] = models if models_ok else []
        report["modelCount"] = len(models) if models_ok else 0
    else:
        report["modelsAvailable"] = False

    # 3. Test run
    if ok:
        stdout, stderr, rc = test_run(args.model, args.prompt)
        report["testRunExitCode"] = rc
        report["testRunStderr"] = stderr[:200] if stderr else None

        text = extract_text_from_jsonl(stdout)
        report["testRunExtractedText"] = text[:500] if text else None
        report["testRunLines"] = len(stdout.strip().split('\n')) if stdout else 0
        # Pi v0.70.2: exit code 124 (SIGTERM from timeout) is okay if we captured output
        has_output = bool(stdout.strip())
        report["testRunSuccess"] = (rc == 0 or (rc == 124 and has_output or 'agent_end' in stdout)) and bool(text)
    else:
        report["testRunSuccess"] = False

    # 4. Summary
    report["cabinetReady"] = bool(
        report.get("binaryAvailable") and
        report.get("modelsAvailable") and
        report.get("testRunSuccess")
    )

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("=" * 60)
        print("  PI CLI VALIDATION REPORT (Cabinet Integration)")
        print("=" * 60)
        emoji = "✅" if report["cabinetReady"] else "❌"
        print(f"\n{emoji} Cabinet Ready: {report['cabinetReady']}")
        print(f"   Pi Binary:  {'✅ ' + report['version'] if report['binaryAvailable'] else '❌ ' + str(report.get('versionError', 'N/A'))}")
        print(f"   Models:     {'✅ ' + str(report.get('modelCount', 0)) + ' found' if report.get('modelsAvailable') else '❌ N/A'}")
        if report.get('models'):
            for m in report['models'][:5]:
                print(f"                • {m}")
            if len(report['models']) > 5:
                print(f"                ... and {len(report['models']) - 5} more")
        print(f"   Test Run:   {'✅' if report.get('testRunSuccess') else '❌'} Exit={report.get('testRunExitCode')}")
        if report.get('testRunExtractedText'):
            print(f"   Extracted:  \"{report['testRunExtractedText'][:80]}...\"")
        print()
        print("=" * 60)
        print("  NEXT STEPS")
        print("=" * 60)
        if report["cabinetReady"]:
            print("  1. Pi will appear in Cabinet Settings → AI Providers")
            print("  2. All 10 models are selectable for agents/tasks")
            print("  3. Set Pi as default provider in onboarding wizard")
            print("  4. Model selection respects budget tiers:")
            print("     - gpt-5.4 → $200+/mo tier (most capable)")
            print("     - gpt-5.1/gpt-5.2 → $20/mo tier")
            print("     - gpt-5.1-codex-mini → free tier")
        else:
            print(f"  FIX: {report.get('versionError', 'Check Pi installation')}")
        print()
    
    return 0 if report["cabinetReady"] else 1

if __name__ == "__main__":
    sys.exit(main())
