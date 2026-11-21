"""Run Agent-owned contract tests against exact AIGC consumer source bytes."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile

MODULE = pathlib.Path(__file__).resolve().parent
REPO = MODULE.parents[1]
INPUTS = ("internal/agent/yingceagent/client.go", "internal/agent/runtime/runtime.go")


def sha(raw):
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--aigc-repo", type=pathlib.Path)
    source.add_argument("--release-root", type=pathlib.Path)
    parser.add_argument("--source-ref")
    parser.add_argument("--manifest-digest")
    parser.add_argument("--go", default="go")
    parser.add_argument("--receipt", type=pathlib.Path, required=True)
    args = parser.parse_args()
    assert shutil.which("node"), "Node must execute; no conditional test skip"
    assert not args.receipt.exists(), "Receipt is immutable"
    inputs = {}
    if args.aigc_repo:
        assert args.source_ref and re.fullmatch("[a-f0-9]{40}", args.source_ref)
        for name in INPUTS:
            inputs[name] = subprocess.check_output(["git", "-C", str(args.aigc_repo), "cat-file", "blob", args.source_ref + ":backend/" + name])
        identity = {"consumerGitRef": args.source_ref}
    else:
        assert args.manifest_digest and re.fullmatch("sha256:[a-f0-9]{64}", args.manifest_digest)
        manifest_raw = (args.release_root / "manifest.json").read_bytes()
        assert sha(manifest_raw) == args.manifest_digest
        spec = json.loads(manifest_raw)["spec"]
        for name in INPUTS:
            path = args.release_root / "source/backend" / name
            assert path.resolve().is_relative_to(args.release_root.resolve()) and not path.is_symlink()
            inputs[name] = path.read_bytes()
            assert sha(inputs[name]) == spec["fileHashes"]["source/backend/" + name]
        identity = {"consumerRelease": spec["releaseId"], "consumerManifest": args.manifest_digest}
    output = REPO / "output"
    output.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="aigc-contract-", dir=output) as temporary:
        work = pathlib.Path(temporary).resolve()
        # The temporary executable and all copied test inputs belong to Agent.
        assert work.is_relative_to(output.resolve()) and work.name.startswith("aigc-contract-")
        for name, raw in inputs.items():
            target = work / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        (work / "internal/agent/yingceagent/contract_test.go").write_bytes((MODULE / "contract_test.go").read_bytes())
        (work / "go.mod").write_text("module yingce/backend\n\ngo 1.25.0\n", encoding="utf-8")
        (work / "go-tmp").mkdir()
        env = {**os.environ, "GOWORK": "off", "GOPROXY": "off", "GOSUMDB": "off", "GOTOOLCHAIN": "local", "CGO_ENABLED": "0", "GOTMPDIR": str(work / "go-tmp"), "FUTURESTAFF_AGENT_CONTRACT_SERVER": str(MODULE / "server.mjs")}
        binary = work / ("futurestaff-agent-contract.test.exe" if os.name == "nt" else "futurestaff-agent-contract.test")
        subprocess.run([args.go, "test", "-c", "-o", str(binary), "./internal/agent/yingceagent"], cwd=work, env=env, check=True, timeout=180)
        binary_digest = sha(binary.read_bytes())
        subprocess.run([str(binary), "-test.v", "-test.timeout=30s"], cwd=work, env=env, check=True, timeout=40)
    receipt = {"passed": True, **identity, "consumerInputs": {name: sha(raw) for name, raw in inputs.items()}, "server": sha((MODULE / "server.mjs").read_bytes()), "tests": sha((MODULE / "contract_test.go").read_bytes()), "binaryDigest": binary_digest, "temporaryWorkspaceRemoved": True, "productionActivated": False, "externalModelCallsExecuted": 0}
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    with args.receipt.open("x", encoding="utf-8") as file:
        json.dump(receipt, file, indent=2)
        file.write("\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
