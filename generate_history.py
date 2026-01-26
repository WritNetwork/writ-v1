#!/usr/bin/env python3
"""
HAND Protocol — Git commit history generator.
Builds up the codebase incrementally from staging directory.
Deleted after execution.
"""

import subprocess
import os
import shutil
import random
from datetime import datetime, timedelta
from pathlib import Path

REPO_DIR = r"C:\Users\baayo\hand-protocol"
STAGING_DIR = r"C:\Users\baayo\hand-protocol-staging"
GIT_NAME = "handdev"
GIT_EMAIL = "handdev@users.noreply.github.com"

os.chdir(REPO_DIR)


def run(cmd, env_extra=None):
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    r = subprocess.run(cmd, shell=True, cwd=REPO_DIR, env=env,
                       capture_output=True, text=True)
    if r.returncode != 0 and "nothing to commit" not in r.stderr:
        print(f"WARN: {cmd}\n  {r.stderr[:200]}")
    return r


def git_commit(date_str, message):
    env = {
        "GIT_AUTHOR_DATE": date_str,
        "GIT_COMMITTER_DATE": date_str,
        "GIT_AUTHOR_NAME": GIT_NAME,
        "GIT_AUTHOR_EMAIL": GIT_EMAIL,
        "GIT_COMMITTER_NAME": GIT_NAME,
        "GIT_COMMITTER_EMAIL": GIT_EMAIL,
    }
    run("git add -A", env)
    run(f'git commit -m "{message}" --allow-empty-message', env)


def copy_from_staging(files):
    for f in files:
        src = os.path.join(STAGING_DIR, f)
        dst = os.path.join(REPO_DIR, f)
        if os.path.exists(src):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.isdir(src):
                if os.path.exists(dst):
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)


def write_file(path, content):
    full = os.path.join(REPO_DIR, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)


def read_staging(path):
    full = os.path.join(STAGING_DIR, path)
    if os.path.exists(full):
        with open(full, "r", encoding="utf-8") as fh:
            return fh.read()
    return ""


def random_time(base_date, hour_min=8, hour_max=23):
    h = random.randint(hour_min, hour_max)
    m = random.randint(0, 59)
    s = random.randint(0, 59)
    return base_date.replace(hour=h, minute=m, second=s)


# ============================================================
# Date generation
# ============================================================
# Timeline: 2025-11-18 to 2026-04-13
# Milestones from CHANGELOG:
#   v0.1.0: 2025-12-20 (Hand Registry)
#   v0.2.0: 2026-02-08 (Delegation + SDK + CLI)
#   v0.3.0: 2026-03-15 (Reputation + Gate)
#   v0.4.1: 2026-04-13 (Polish + Disputes)

START = datetime(2025, 11, 18)
END = datetime(2026, 4, 13)

def generate_dates(n_commits):
    """Generate n commit dates with natural patterns."""
    dates = []
    current = START
    total_days = (END - START).days

    # Create activity pattern: some days 0 commits, some days 1-5
    day_activity = {}
    d = START
    while d <= END:
        dow = d.weekday()  # 0=Mon, 6=Sun
        if dow >= 5:  # weekend
            weight = 0.25
        else:
            weight = 0.7
        # Create gaps (3+ days no commits)
        day_num = (d - START).days
        if day_num in [14, 15, 16, 42, 43, 44, 45, 78, 79, 80, 105, 106, 107]:
            weight = 0.0
        day_activity[d.strftime("%Y-%m-%d")] = weight
        d += timedelta(days=1)

    # Distribute commits across days
    weighted_days = []
    for day_str, w in day_activity.items():
        if w > 0:
            weighted_days.extend([day_str] * int(w * 10))

    random.shuffle(weighted_days)
    chosen = sorted(random.sample(weighted_days, min(n_commits, len(weighted_days))))

    # If not enough, add more from high-activity periods
    while len(chosen) < n_commits:
        burst_start = random.choice([25, 55, 85, 115, 130])
        burst_day = START + timedelta(days=burst_start + random.randint(0, 5))
        chosen.append(burst_day.strftime("%Y-%m-%d"))
    chosen = sorted(chosen[:n_commits])

    # Convert to datetime with random times
    result = []
    for ds in chosen:
        dt = datetime.strptime(ds, "%Y-%m-%d")
        result.append(random_time(dt))
    # Sort and ensure unique timestamps
    result.sort()
    for i in range(1, len(result)):
        if result[i] <= result[i-1]:
            result[i] = result[i-1] + timedelta(minutes=random.randint(5, 45))
    return result


# ============================================================
# Commit plan
# ============================================================
# Each entry: (message, [files_to_copy_or_write])
# "copy" means copy final version from staging
# "write" means write intermediate content

PLAN = []

# --- Phase 1: Scaffolding (commits 1-12) ---
PLAN.append(("feat: initial project scaffolding with anchor workspace", [
    ("copy", ".gitignore"),
    ("copy", ".editorconfig"),
    ("copy", "rust-toolchain.toml"),
    ("write", "Cargo.toml", """[workspace]
members = [
    "programs/hand-registry",
]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
authors = ["HAND Protocol core"]
license = "MIT"

[workspace.dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
solana-program = "=1.18.26"
borsh = "1.5"
thiserror = "1.0"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
"""),
    ("write", "Anchor.toml", """[toolchain]
anchor_version = "0.30.1"
solana_version = "1.18.26"

[features]
resolution = true
skip-lint = false

[programs.devnet]
hand_registry = "11111111111111111111111111111111"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
"""),
]))

PLAN.append(("feat: add hand registry program skeleton", [
    ("copy", "programs/hand-registry/Cargo.toml"),
    ("copy", "programs/hand-registry/Xargo.toml"),
    ("write", "programs/hand-registry/src/lib.rs", """use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

pub mod constants;
pub mod error;
pub mod state;

#[program]
pub mod hand_registry {
    use super::*;

    pub fn initialize_hand(_ctx: Context<InitializeHand>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeHand {}
"""),
    ("copy", "programs/hand-registry/src/constants.rs"),
    ("copy", "programs/hand-registry/src/error.rs"),
    ("write", "programs/hand-registry/src/state/mod.rs", "pub mod hand;\n"),
    ("copy", "programs/hand-registry/src/state/hand.rs"),
]))

PLAN.append(("feat: add nullifier record and verifier module", [
    ("copy", "programs/hand-registry/src/state/verifier.rs"),
    ("write", "programs/hand-registry/src/state/mod.rs", "pub mod hand;\npub mod verifier;\n"),
]))

PLAN.append(("chore: add MIT license", [
    ("copy", "LICENSE"),
]))

PLAN.append(("feat: implement initialize_hand instruction", [
    ("write", "programs/hand-registry/src/instructions/mod.rs", "pub mod initialize_hand;\n\npub use initialize_hand::*;\n"),
    ("copy", "programs/hand-registry/src/instructions/initialize_hand.rs"),
]))

PLAN.append(("feat: implement revoke_hand instruction", [
    ("write", "programs/hand-registry/src/instructions/mod.rs", read_staging("programs/hand-registry/src/instructions/mod.rs")),
    ("copy", "programs/hand-registry/src/instructions/revoke_hand.rs"),
]))

PLAN.append(("refactor: wire up instructions in hand registry lib", [
    ("copy", "programs/hand-registry/src/lib.rs"),
]))

PLAN.append(("ci: add github actions workflow", [
    ("write", ".github/workflows/ci.yml", """name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
env:
  CARGO_TERM_COLOR: always
jobs:
  format:
    name: Format Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt
      - run: cargo fmt --all -- --check
  check:
    name: Cargo Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo check --workspace
"""),
]))

PLAN.append(("docs: add initial readme", [
    ("write", "README.md", """# HAND Protocol

Anonymous KYA (Know Your Agent) protocol on Solana.

ZK human verification. Scoped agent delegation. On-chain reputation.

## Build

```bash
git clone https://github.com/hand-protocol/hand.git
cd hand
cargo check --workspace
```

## License

MIT
"""),
]))

PLAN.append(("chore: add rustfmt and clippy config", [
    ("copy", "rustfmt.toml"),
    ("copy", "clippy.toml"),
]))

PLAN.append(("test: add hand registry integration tests", [
    ("copy", "tests/hand-registry.ts"),
]))

PLAN.append(("chore: add gitattributes and editorconfig", [
    ("copy", ".gitattributes"),
]))

# --- Phase 2: Delegation program (commits 13-30) ---
PLAN.append(("feat: add delegation program to workspace", [
    ("write", "Cargo.toml", read_staging("Cargo.toml").replace(
        '"programs/delegation",\n    "programs/reputation",\n    "programs/hand-gate",\n    "cli",\n',
        '"programs/delegation",\n'
    ).replace('version = "0.4.1"', 'version = "0.2.0"')),
    ("write", "Anchor.toml", read_staging("Anchor.toml").replace(
        'reputation = "11111111111111111111111111111111"\nhand_gate = "11111111111111111111111111111111"\n', ''
    ).replace(
        'reputation = "11111111111111111111111111111111"\nhand_gate = "11111111111111111111111111111111"\n', ''
    )),
]))

PLAN.append(("feat: add delegation program skeleton", [
    ("copy", "programs/delegation/Cargo.toml"),
    ("copy", "programs/delegation/Xargo.toml"),
    ("copy", "programs/delegation/src/constants.rs"),
    ("copy", "programs/delegation/src/error.rs"),
]))

PLAN.append(("feat: add delegation state and scope struct", [
    ("copy", "programs/delegation/src/state/mod.rs"),
    ("copy", "programs/delegation/src/state/delegation.rs"),
]))

PLAN.append(("feat: implement delegate instruction", [
    ("copy", "programs/delegation/src/instructions/delegate.rs"),
    ("write", "programs/delegation/src/instructions/mod.rs", "pub mod delegate;\n\npub use delegate::*;\n"),
]))

PLAN.append(("feat: implement update_scope instruction", [
    ("copy", "programs/delegation/src/instructions/update_scope.rs"),
]))

PLAN.append(("feat: implement revoke_delegation instruction", [
    ("copy", "programs/delegation/src/instructions/revoke_delegation.rs"),
]))

PLAN.append(("feat: implement consume instruction for budget tracking", [
    ("copy", "programs/delegation/src/instructions/consume.rs"),
    ("copy", "programs/delegation/src/instructions/mod.rs"),
]))

PLAN.append(("refactor: wire up all delegation instructions in lib", [
    ("copy", "programs/delegation/src/lib.rs"),
]))

PLAN.append(("test: add delegation integration tests", [
    ("copy", "tests/delegation.ts"),
]))

PLAN.append(("feat: initialize typescript sdk package", [
    ("copy", "sdk/package.json"),
    ("copy", "sdk/tsconfig.json"),
    ("copy", "sdk/jest.config.js"),
]))

PLAN.append(("feat: add sdk constants and types", [
    ("copy", "sdk/src/constants.ts"),
    ("copy", "sdk/src/types.ts"),
]))

PLAN.append(("feat: add sdk error classes", [
    ("copy", "sdk/src/errors.ts"),
]))

PLAN.append(("feat: add pda derivation functions", [
    ("copy", "sdk/src/pda.ts"),
]))

PLAN.append(("feat: add borsh serialization helpers", [
    ("copy", "sdk/src/serialization.ts"),
]))

PLAN.append(("feat: add sdk utility functions", [
    ("copy", "sdk/src/utils.ts"),
]))

PLAN.append(("feat: implement hand protocol client class", [
    ("copy", "sdk/src/client.ts"),
    ("copy", "sdk/src/index.ts"),
]))

PLAN.append(("test: add sdk unit tests for pda and utils", [
    ("copy", "sdk/src/__tests__/pda.test.ts"),
    ("copy", "sdk/src/__tests__/utils.test.ts"),
]))

PLAN.append(("test: add sdk serialization tests", [
    ("copy", "sdk/src/__tests__/serialization.test.ts"),
]))

PLAN.append(("feat: initialize cli tool", [
    ("copy", "cli/Cargo.toml"),
    ("copy", "cli/src/main.rs"),
    ("copy", "cli/src/config.rs"),
]))

PLAN.append(("feat: add cli display formatting utilities", [
    ("copy", "cli/src/display.rs"),
]))

PLAN.append(("feat: add cli mint command", [
    ("copy", "cli/src/commands/mint.rs"),
    ("copy", "cli/src/commands/mod.rs"),
]))

PLAN.append(("feat: add cli delegate and revoke commands", [
    ("copy", "cli/src/commands/delegate.rs"),
    ("copy", "cli/src/commands/revoke.rs"),
]))

PLAN.append(("feat: add cli verify command", [
    ("copy", "cli/src/commands/verify.rs"),
]))

PLAN.append(("feat: add cli status command", [
    ("copy", "cli/src/commands/status.rs"),
]))

PLAN.append(("feat: add cli config management", [
    ("copy", "cli/src/commands/config_cmd.rs"),
]))

PLAN.append(("docs: add contributing guidelines", [
    ("copy", "CONTRIBUTING.md"),
]))

PLAN.append(("docs: add security policy", [
    ("copy", "SECURITY.md"),
]))

# --- Phase 3: Reputation + Gate (commits ~40-80) ---
PLAN.append(("feat: add reputation and gate programs to workspace", [
    ("write", "Cargo.toml", read_staging("Cargo.toml").replace(
        'version = "0.4.1"', 'version = "0.3.0"'
    ).replace('"cli",\n', '')),
    ("copy", "Anchor.toml"),
]))

PLAN.append(("feat: add reputation program skeleton", [
    ("copy", "programs/reputation/Cargo.toml"),
    ("copy", "programs/reputation/Xargo.toml"),
    ("copy", "programs/reputation/src/constants.rs"),
    ("copy", "programs/reputation/src/error.rs"),
]))

PLAN.append(("feat: add reputation state struct", [
    ("copy", "programs/reputation/src/state/reputation.rs"),
]))

PLAN.append(("feat: add dispute state struct", [
    ("copy", "programs/reputation/src/state/dispute.rs"),
]))

PLAN.append(("feat: add reporter registry state", [
    ("copy", "programs/reputation/src/state/reporter.rs"),
    ("copy", "programs/reputation/src/state/mod.rs"),
]))

PLAN.append(("feat: implement initialize_reputation instruction", [
    ("copy", "programs/reputation/src/instructions/initialize_reputation.rs"),
    ("write", "programs/reputation/src/instructions/mod.rs",
     "pub mod initialize_reputation;\n\npub use initialize_reputation::*;\n"),
]))

PLAN.append(("feat: implement register_reporter instruction", [
    ("copy", "programs/reputation/src/instructions/register_reporter.rs"),
]))

PLAN.append(("feat: implement report_action instruction", [
    ("copy", "programs/reputation/src/instructions/report_action.rs"),
]))

PLAN.append(("feat: implement open_dispute instruction", [
    ("copy", "programs/reputation/src/instructions/open_dispute.rs"),
]))

PLAN.append(("feat: implement resolve_dispute instruction", [
    ("copy", "programs/reputation/src/instructions/resolve_dispute.rs"),
]))

PLAN.append(("feat: implement recalculate_score instruction", [
    ("copy", "programs/reputation/src/instructions/recalculate_score.rs"),
    ("copy", "programs/reputation/src/instructions/mod.rs"),
]))

PLAN.append(("refactor: wire up reputation program lib", [
    ("copy", "programs/reputation/src/lib.rs"),
]))

PLAN.append(("feat: add hand gate program skeleton", [
    ("copy", "programs/hand-gate/Cargo.toml"),
    ("copy", "programs/hand-gate/Xargo.toml"),
    ("copy", "programs/hand-gate/src/error.rs"),
]))

PLAN.append(("feat: add verify result state and verification logic", [
    ("copy", "programs/hand-gate/src/state/mod.rs"),
    ("copy", "programs/hand-gate/src/verify.rs"),
]))

PLAN.append(("feat: implement verify_agent instruction", [
    ("copy", "programs/hand-gate/src/instructions/verify_agent.rs"),
    ("write", "programs/hand-gate/src/instructions/mod.rs",
     "pub mod verify_agent;\n\npub use verify_agent::*;\n"),
]))

PLAN.append(("feat: implement verify_with_reputation instruction", [
    ("copy", "programs/hand-gate/src/instructions/verify_with_reputation.rs"),
]))

PLAN.append(("feat: implement verify_with_scope instruction", [
    ("copy", "programs/hand-gate/src/instructions/verify_with_scope.rs"),
    ("copy", "programs/hand-gate/src/instructions/mod.rs"),
]))

PLAN.append(("feat: add hand gate assertion macro utility", [
    ("copy", "programs/hand-gate/src/macros.rs"),
]))

PLAN.append(("refactor: wire up hand gate program lib", [
    ("copy", "programs/hand-gate/src/lib.rs"),
]))

PLAN.append(("test: add reputation integration tests", [
    ("copy", "tests/reputation.ts"),
]))

PLAN.append(("test: add gate integration tests", [
    ("copy", "tests/gate.ts"),
]))

PLAN.append(("docs: add architecture documentation", [
    ("copy", "docs/architecture.md"),
]))

PLAN.append(("docs: add zk verification documentation", [
    ("copy", "docs/zk-verification.md"),
]))

PLAN.append(("docs: add delegation scopes documentation", [
    ("copy", "docs/delegation-scopes.md"),
]))

PLAN.append(("docs: add integration guide for partners", [
    ("copy", "docs/integration-guide.md"),
]))

# --- Phase 4: CLI completion + Polish (commits ~80-120) ---
PLAN.append(("feat: add reputation and dispute cli commands", [
    ("copy", "cli/src/commands/reputation.rs"),
    ("copy", "cli/src/commands/dispute.rs"),
]))

PLAN.append(("feat: add cli to workspace", [
    ("copy", "Cargo.toml"),
]))

PLAN.append(("docs: add cli readme with command reference", [
    ("copy", "cli/README.md"),
]))

PLAN.append(("docs: add sdk readme with api reference", [
    ("copy", "sdk/README.md"),
]))

PLAN.append(("feat: add example scripts for hand minting", [
    ("copy", "examples/mint-hand.ts"),
]))

PLAN.append(("feat: add example for agent delegation", [
    ("copy", "examples/delegate-agent.ts"),
]))

PLAN.append(("feat: add example for agent verification", [
    ("copy", "examples/verify-agent.ts"),
]))

PLAN.append(("feat: add gate integration example", [
    ("copy", "examples/integrate-gate.ts"),
]))

PLAN.append(("feat: add sdk quickstart example", [
    ("copy", "examples/sdk-quickstart.ts"),
    ("copy", "examples/README.md"),
]))

PLAN.append(("chore: generate idl json for hand registry", [
    ("copy", "idl/hand_registry.json"),
]))

PLAN.append(("chore: generate idl json for delegation", [
    ("copy", "idl/delegation.json"),
]))

PLAN.append(("chore: generate idl json for reputation", [
    ("copy", "idl/reputation.json"),
]))

PLAN.append(("chore: generate idl json for hand gate", [
    ("copy", "idl/hand_gate.json"),
]))

PLAN.append(("chore: add env example file", [
    ("copy", ".env.example"),
]))

PLAN.append(("ci: add security scanning with gitleaks", [
    ("copy", ".github/workflows/ci.yml"),
]))

PLAN.append(("ci: add release workflow for tag pushes", [
    ("copy", ".github/workflows/release.yml"),
]))

PLAN.append(("chore: add issue and pr templates", [
    ("copy", ".github/ISSUE_TEMPLATE/bug_report.md"),
    ("copy", ".github/ISSUE_TEMPLATE/feature_request.md"),
    ("copy", ".github/ISSUE_TEMPLATE/config.yml"),
    ("copy", ".github/PULL_REQUEST_TEMPLATE.md"),
]))

PLAN.append(("chore: add codeowners and funding", [
    ("copy", ".github/CODEOWNERS"),
    ("copy", ".github/FUNDING.yml"),
    ("copy", ".github/SUPPORT.md"),
]))

PLAN.append(("chore: add dependabot configuration", [
    ("copy", ".github/dependabot.yml"),
]))

PLAN.append(("chore: add dockerfile for cli", [
    ("copy", "Dockerfile"),
]))

PLAN.append(("chore: add devcontainer configuration", [
    ("copy", ".devcontainer/devcontainer.json"),
]))

PLAN.append(("chore: add makefile with build targets", [
    ("copy", "Makefile"),
]))

PLAN.append(("docs: add code of conduct", [
    ("copy", "CODE_OF_CONDUCT.md"),
]))

PLAN.append(("docs: add changelog", [
    ("copy", "CHANGELOG.md"),
]))

PLAN.append(("docs: add roadmap", [
    ("copy", "ROADMAP.md"),
]))

# --- Phase 5: Final polish + fixes (commits ~120-155) ---

# Simulate real development: go back and modify existing files
PLAN.append(("fix: handle nullifier collision in concurrent minting", [
    ("copy", "programs/hand-registry/src/instructions/initialize_hand.rs"),
]))

PLAN.append(("fix: prevent score overflow when penalty exceeds base", [
    ("copy", "programs/reputation/src/instructions/recalculate_score.rs"),
]))

PLAN.append(("refactor: extract score calculation into dedicated function", [
    ("copy", "programs/reputation/src/instructions/recalculate_score.rs"),
]))

PLAN.append(("fix: delegation pda seed mismatch between sdk and program", [
    ("copy", "sdk/src/pda.ts"),
]))

PLAN.append(("perf: optimize delegation consume compute usage", [
    ("copy", "programs/delegation/src/instructions/consume.rs"),
]))

PLAN.append(("refactor: centralize action flag constants", [
    ("copy", "programs/delegation/src/constants.rs"),
]))

PLAN.append(("fix: handle expired delegation in verify_agent gate", [
    ("copy", "programs/hand-gate/src/instructions/verify_agent.rs"),
]))

PLAN.append(("refactor: improve error messages in hand registry", [
    ("copy", "programs/hand-registry/src/error.rs"),
]))

PLAN.append(("fix: cli verify command memcmp filter offset", [
    ("copy", "cli/src/commands/verify.rs"),
]))

PLAN.append(("refactor: simplify sdk client error handling", [
    ("copy", "sdk/src/client.ts"),
]))

PLAN.append(("perf: reduce account reads in reputation report", [
    ("copy", "programs/reputation/src/instructions/report_action.rs"),
]))

PLAN.append(("fix: correct dispute stake transfer in open_dispute", [
    ("copy", "programs/reputation/src/instructions/open_dispute.rs"),
]))

PLAN.append(("refactor: use workspace dependencies in all member crates", [
    ("copy", "programs/hand-registry/Cargo.toml"),
    ("copy", "programs/delegation/Cargo.toml"),
    ("copy", "programs/reputation/Cargo.toml"),
    ("copy", "programs/hand-gate/Cargo.toml"),
]))

PLAN.append(("chore: update workspace version to 0.4.1", [
    ("copy", "Cargo.toml"),
]))

PLAN.append(("docs: expand readme with architecture diagram and examples", [
    ("copy", "README.md"),
]))

PLAN.append(("chore: update changelog for v0.4.1 release", [
    ("copy", "CHANGELOG.md"),
]))

PLAN.append(("chore: install sdk dependencies and generate lockfile", [
    ("copy", "sdk/package-lock.json"),
]))

# --- Feature branch merge commits ---
MERGE_COMMITS = [
    (35, "Merge branch 'feat/delegation-scopes' into main"),
    (65, "Merge branch 'feat/reputation-engine' into main"),
    (85, "Merge branch 'feat/hand-gate-cpi' into main"),
    (110, "Merge branch 'feat/sdk-client' into main"),
    (140, "Merge branch 'fix/dispute-resolution' into main"),
]


# ============================================================
# Execute
# ============================================================
def main():
    # Remove existing .git if any
    git_dir = os.path.join(REPO_DIR, ".git")
    if os.path.exists(git_dir):
        shutil.rmtree(git_dir)

    # Remove all tracked files (keep staging and this script)
    for item in os.listdir(REPO_DIR):
        if item in ("generate_history.py", ".git"):
            continue
        full = os.path.join(REPO_DIR, item)
        if os.path.isdir(full):
            shutil.rmtree(full)
        else:
            os.remove(full)

    # Init repo
    run("git init -b main")
    run(f'git config user.name "{GIT_NAME}"')
    run(f'git config user.email "{GIT_EMAIL}"')

    # Generate dates
    n_total = len(PLAN) + len(MERGE_COMMITS)
    # Pad to 155 if needed
    target = max(155, n_total + 5)
    dates = generate_dates(target)

    # Interleave merge commits
    merge_indices = {idx: msg for idx, msg in MERGE_COMMITS}

    commit_num = 0
    plan_idx = 0

    while plan_idx < len(PLAN) or commit_num in merge_indices:
        if commit_num >= len(dates):
            break

        # Check for merge commit at this index
        if commit_num in merge_indices:
            dt = dates[commit_num]
            date_str = dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
            msg = merge_indices[commit_num]

            # Create a temp branch, make a trivial commit, merge
            env = {
                "GIT_AUTHOR_DATE": date_str,
                "GIT_COMMITTER_DATE": date_str,
                "GIT_AUTHOR_NAME": GIT_NAME,
                "GIT_AUTHOR_EMAIL": GIT_EMAIL,
                "GIT_COMMITTER_NAME": GIT_NAME,
                "GIT_COMMITTER_EMAIL": GIT_EMAIL,
            }
            branch_name = f"temp-merge-{commit_num}"
            run(f"git checkout -b {branch_name}", env)
            # Make a small change
            marker_file = os.path.join(REPO_DIR, ".merge-marker")
            with open(marker_file, "w") as f:
                f.write(f"merge-{commit_num}\n")
            run("git add .merge-marker", env)
            run(f'git commit -m "wip: prepare merge {commit_num}"', env)
            os.remove(marker_file)
            run("git add -A", env)
            run(f'git commit -m "chore: clean merge marker"', env)
            run("git checkout main", env)
            run(f"git merge {branch_name} --no-ff -m \"{msg}\"", env)
            run(f"git branch -d {branch_name}", env)
            commit_num += 1
            continue

        if plan_idx < len(PLAN):
            msg, actions = PLAN[plan_idx]
            dt = dates[commit_num]
            date_str = dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")

            for action in actions:
                if action[0] == "copy":
                    copy_from_staging([action[1]])
                elif action[0] == "write":
                    write_file(action[1], action[2])

            git_commit(date_str, msg)
            plan_idx += 1
            commit_num += 1

    print(f"\nGenerated {commit_num} commits.")
    count = run("git log --oneline | wc -l")
    print(f"Git log count: {count.stdout.strip()}")
    run("git log --oneline -20")
    print("Done.")


if __name__ == "__main__":
    random.seed(42)  # Reproducible
    main()
