#!/usr/bin/env node
/**
 * Pull the latest published version and restart.
 *
 *   npm run update           update to the newest release
 *   npm run update -- --check   say what would change, touch nothing
 *
 * Design rules, in order of importance:
 *
 *   1. `data/` is never touched. The database, the encryption key and the
 *      bank credentials live there and are not in git. An update only ever
 *      replaces code.
 *   2. Local edits are never discarded silently. Someone who changed the app
 *      with Claude Code has real work in the tree; if it would be overwritten
 *      we stop and say so rather than deciding for them.
 *   3. A failed update leaves the previous version running. The build happens
 *      before the service restarts, so a broken pull cannot take the app down.
 *
 * Schema changes travel with the code as migrations and are applied on the
 * next start, which is why no database step appears here.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const CHECK_ONLY = process.argv.includes("--check");

function say(msg) { console.log(msg); }
function step(msg) { console.log(`\n=> ${msg}`); }
function fail(msg) {
  console.error(`\nupdate: ${msg}`);
  process.exit(1);
}

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts });
  if (r.error) fail(`git is not available: ${r.error.message}`);
  return r;
}

function gitOut(args) {
  const r = git(args);
  return (r.stdout || "").trim();
}

function run(cmd, args) {
  const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: needsShell });
  if (r.error) fail(`\`${cmd} ${args.join(" ")}\` failed to launch: ${r.error.message}`);
  return r.status === 0;
}

// --- preconditions ---------------------------------------------------------

if (!fs.existsSync(path.join(ROOT, ".git"))) {
  fail(
    "this copy of Spent is not a git checkout, so it cannot update itself.\n" +
    "Re-install by cloning the repository, then copy your old data/ folder across."
  );
}

if (git(["rev-parse", "--git-dir"]).status !== 0) {
  fail("not a git repository.");
}

const remote = gitOut(["remote", "get-url", "origin"]);
if (!remote) {
  fail(
    "no 'origin' remote is configured, so there is nowhere to update from.\n" +
    "Add one with: git remote add origin <repository-url>"
  );
}

// --- refuse to clobber local work -----------------------------------------

step("Checking for local changes");
const dirty = gitOut(["status", "--porcelain"])
  .split("\n")
  .filter(Boolean)
  // data/ is gitignored, so it never appears here; this is belt and braces.
  .filter((line) => !line.slice(3).startsWith("data/"));

if (dirty.length > 0) {
  say("   You have uncommitted changes:");
  for (const line of dirty.slice(0, 10)) say(`     ${line}`);
  if (dirty.length > 10) say(`     ... and ${dirty.length - 10} more`);
  fail(
    "refusing to update and lose these.\n" +
    "  Keep them:    git stash        (then run the update again, and: git stash pop)\n" +
    "  Discard them: git checkout .   (your data/ folder is not affected either way)"
  );
}
say("   Working tree is clean.");

// --- what is available -----------------------------------------------------

step("Fetching the latest version");
if (git(["fetch", "--tags", "origin"], { stdio: "inherit" }).status !== 0) {
  fail("could not reach the repository. Check your internet connection.");
}

const branch = gitOut(["rev-parse", "--abbrev-ref", "HEAD"]) || "main";
const upstream =
  gitOut(["rev-parse", "--verify", "--quiet", `origin/${branch}`]) ? `origin/${branch}` : "origin/main";

const local = gitOut(["rev-parse", "HEAD"]);
const latest = gitOut(["rev-parse", upstream]);

if (!latest) fail(`could not resolve ${upstream}.`);

if (local === latest) {
  say("\nAlready up to date. Nothing to do.");
  process.exit(0);
}

const log = gitOut(["log", "--oneline", "--no-decorate", `${local}..${latest}`]);
const count = log ? log.split("\n").length : 0;
say(`\n   ${count} new change${count === 1 ? "" : "s"}:`);
for (const line of log.split("\n").slice(0, 15)) say(`     ${line}`);
if (count > 15) say(`     ... and ${count - 15} more`);

const migrations = gitOut([
  "diff", "--name-only", `${local}..${latest}`, "--", "src/server/db/migrations",
]);
if (migrations) {
  say("\n   Includes database migrations (applied automatically on restart):");
  for (const m of migrations.split("\n")) say(`     ${path.basename(m)}`);
}

if (CHECK_ONLY) {
  say("\n--check: nothing was changed.");
  process.exit(0);
}

// --- apply -----------------------------------------------------------------

step("Applying the update");
if (git(["merge", "--ff-only", upstream], { stdio: "inherit" }).status !== 0) {
  fail(
    "could not fast-forward - this checkout has diverged from the published version.\n" +
    "If you have no local commits worth keeping: git reset --hard " + upstream
  );
}

step("Installing dependencies");
if (!run(NPM, ["install", "--no-audit", "--no-fund"])) {
  fail("dependency install failed. The previous version is still running.");
}

step("Building");
if (!run(NPM, ["run", "build"])) {
  fail("build failed. The previous version is still running; nothing was restarted.");
}

step("Restarting the app");
// service:reload rebuilds too, so stop/start directly to avoid doing it twice.
const svc = path.join(HERE, "service", "install.mjs");
if (fs.existsSync(svc)) {
  run(process.execPath, [svc, "stop"]);
  run(process.execPath, [svc, "start"]);
} else {
  say("   No service installed - start it however you normally do.");
}

say("\nUpdated. Your data was not touched.");
