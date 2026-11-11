#!/usr/bin/env node
/**
 * Run the Playwright suite against a production build, one device project at a
 * time.
 *
 * Why a build instead of `next dev`? Dev-mode on-demand compilation was the one
 * thing that made this suite unreliable: a route compile on a contended machine
 * can stall a server-action round trip for minutes, which looks exactly like an
 * application hang. `next start` serves prebuilt routes, so the tests exercise
 * the artifact that actually ships and no assertion depends on compile luck.
 *
 * Why one project at a time? A single Playwright invocation boots every
 * configured webServer up front. Three servers plus three browser engines do not
 * fit in a typical developer laptop's memory (measured on the reference machine:
 * ~1 GB free of 16 GB before the run), and the server that loses the resource
 * race stalls. Sequential runs keep the isolation the suite needs — own port,
 * own FAIRHOLD_DATA_DIR, own reset fixture — while capping peak usage at one
 * server. Playwright tears each server down before the next project starts.
 *
 * Nothing is skipped, retried or softened: every project runs its full test set,
 * the process streams the real Playwright output, and the exit code is non-zero
 * if the build or any project fails.
 *
 * Usage:
 *   node scripts/run-e2e.mjs                             # build, then all projects
 *   node scripts/run-e2e.mjs --grep "demo"               # extra args are forwarded
 *   node scripts/run-e2e.mjs --project=tablet-chromium   # single project, no fan-out
 *   node scripts/run-e2e.mjs --skip-build                # reuse an existing build
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PROJECTS = ["desktop-chromium", "mobile-chromium", "tablet-chromium"];

const rawArgs = process.argv.slice(2);
const skipBuild = rawArgs.includes("--skip-build");
const forwarded = rawArgs.filter((arg) => arg !== "--skip-build");

const cliPath = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
if (!existsSync(cliPath)) {
  console.error(`Playwright CLI not found at ${cliPath}. Run npm install first.`);
  process.exit(1);
}

function run(label, command, args) {
  return new Promise((resolve) => {
    console.log(`\n=== ${label} ===\n`);
    const started = Date.now();
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
      // npm resolves to npm.cmd on Windows, which needs a shell.
      shell: command === "npm",
    });
    const forwardSignal = (signal) => {
      if (!child.killed) child.kill(signal);
    };
    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);
    child.on("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      resolve({
        label,
        code: code ?? (signal ? 1 : 0),
        signal,
        seconds: Math.round((Date.now() - started) / 1000),
      });
    });
    child.on("error", (error) => {
      console.error(`Failed to start ${label}: ${error.message}`);
      resolve({ label, code: 1, signal: null, seconds: 0 });
    });
  });
}

const results = [];

if (!skipBuild) {
  const build = await run("Production build", "npm", ["run", "build"]);
  results.push(build);
  if (build.code !== 0) {
    console.error("\nThe production build failed, so the E2E run cannot start.");
    process.exit(1);
  }
}

// If the caller already narrowed the run to specific projects, do not fan out:
// run exactly what was asked for, once.
const hasProjectFlag = forwarded.some(
  (arg) => arg === "--project" || arg === "-p" || arg.startsWith("--project="),
);
const runs = hasProjectFlag
  ? [{ label: "requested project(s)", args: forwarded }]
  : PROJECTS.map((project) => ({
      label: project,
      args: [`--project=${project}`, ...forwarded],
    }));

for (const projectRun of runs) {
  const result = await run(`Playwright: ${projectRun.label}`, process.execPath, [
    cliPath,
    "test",
    ...projectRun.args,
  ]);
  results.push(result);
  if (result.code !== 0) {
    // Keep going so one failing device does not hide failures on the others.
    console.error(
      `\n=== ${result.label}: FAILED (exit ${result.code}${result.signal ? `, ${result.signal}` : ""}) in ${result.seconds}s ===\n`,
    );
  }
}

console.log("\n=== E2E summary ===");
for (const result of results) {
  const verdict = result.code === 0 ? "passed" : `FAILED (exit ${result.code})`;
  console.log(`  ${result.label}: ${verdict} in ${result.seconds}s`);
}

const failed = results.filter((result) => result.code !== 0);
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} step(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} step(s) passed.`);
