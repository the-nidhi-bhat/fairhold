import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Every device project gets its own server, port and data directory. That is
 * what makes desktop / mobile / tablet genuinely isolated instead of sharing one
 * JSON file.
 *
 * The suite runs against a production build (`next build` + `next start`), not
 * `next dev`. Dev-mode on-demand compilation is the single largest source of
 * nondeterminism here: on a contended machine a route compile can stall a
 * server-action round trip for minutes, which reads as a flaky test but is the
 * compiler, and it also means the suite would never have exercised the build
 * that actually ships. scripts/run-e2e.mjs builds once, then runs one project at
 * a time so at most one server is ever resident.
 *
 * Data isolation: each project's JSON store lives in the OS temp directory, so a
 * synchronised checkout (OneDrive) never re-uploads store writes mid-run.
 * `DATABASE_URL: ""` is set for the test servers only: an empty value means "no
 * database configured", so the normal selection rule picks the JSON store and no
 * real database configuration is touched. `FAIRHOLD_DATA_BACKEND=json` records
 * the same intent for anyone who points these specs at `next dev` instead (a
 * non-production escape hatch in lib/data/db.ts; `next start` runs as production
 * and would ignore it, which is why DATABASE_URL is blanked as well).
 */
interface ProjectSpec {
  name: string;
  device: (typeof devices)[string];
  port: number;
  dataDir: string;
}

/** One JSON store per device, outside the repository. See the note above. */
const DATA_ROOT = join(tmpdir(), "fairhold-e2e");

const PROJECTS: ProjectSpec[] = [
  {
    name: "desktop-chromium",
    device: devices["Desktop Chrome"],
    port: 3100,
    dataDir: join(DATA_ROOT, "desktop"),
  },
  {
    name: "mobile-chromium",
    device: devices["Pixel 5"],
    port: 3101,
    dataDir: join(DATA_ROOT, "mobile"),
  },
  {
    name: "tablet-chromium",
    // Touch tablet at 810x1080 (iPad-gen-7 geometry) with a Chromium user
    // agent. The stock `devices["iPad (gen 7)"]` descriptor injects an iOS
    // Safari UA, which sends Next's client router down Safari-specific code
    // paths even though the engine is Chromium; that produced deterministic
    // "due to access control checks" fetch failures and a bounce to /login on
    // this project only. Deriving from a Chromium phone profile keeps the
    // required UA/browser fields consistent; the tablet geometry then replaces
    // the phone viewport.
    device: {
      ...devices["Pixel 5"],
      viewport: { width: 810, height: 1080 },
      deviceScaleFactor: 2,
    },
    port: 3102,
    dataDir: join(DATA_ROOT, "tablet"),
  },
  {
    name: "desktop-firefox",
    device: devices["Desktop Firefox"],
    port: 3103,
    dataDir: join(DATA_ROOT, "firefox"),
  },
  {
    name: "desktop-webkit",
    device: devices["Desktop Safari"],
    port: 3104,
    dataDir: join(DATA_ROOT, "webkit"),
  },
];

const SHARED_ENV = {
  FAIRHOLD_DEMO_BUYERS: "Alex Buyer",
  FAIRHOLD_DEMO_SELLERS: "Jamie Seller",
  FAIRHOLD_DEMO_REVIEWERS: "Morgan Reviewer",
  // E2E-only backend selection. An empty DATABASE_URL means "no database
  // configured", so the JSON store is chosen by the normal selection rule. The
  // explicit pin records the intent and covers the case of running these specs
  // against `next dev`, where a .env.local DATABASE_URL would otherwise win
  // (lib/data/db.ts ignores the pin under NODE_ENV=production).
  DATABASE_URL: "",
  FAIRHOLD_DATA_BACKEND: "json",
};

/**
 * Playwright boots every configured webServer before the run, even when the
 * command line selects a single project. Only the servers the run actually needs
 * are started: an explicit `--project=...` (comma separated, repeatable)
 * narrows the list, and an unfiltered run starts all three.
 */
function requestedProjectNames(): Set<string> | null {
  const argv = process.argv.slice(2);
  const requested = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project" || arg === "-p") {
      const value = argv[index + 1];
      if (value) for (const name of value.split(",")) requested.add(name.trim());
      index += 1;
    } else if (arg.startsWith("--project=")) {
      for (const name of arg.slice("--project=".length).split(",")) {
        requested.add(name.trim());
      }
    }
  }
  return requested.size > 0 ? requested : null;
}

const REQUESTED = requestedProjectNames();
const ACTIVE_PROJECTS =
  REQUESTED === null
    ? PROJECTS
    : PROJECTS.filter((project) => REQUESTED.has(project.name));
const SERVER_PROJECTS = ACTIVE_PROJECTS.length > 0 ? ACTIVE_PROJECTS : PROJECTS;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // Production-build journeys take a few seconds per route; this bound only
  // exists so a genuinely hung request fails instead of running forever. Every
  // individual assertion keeps its own expect timeout.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PROJECTS[0].port}`,
    trace: "retain-on-failure",
    // Deterministic interactions: globals.css turns smooth scrolling and
    // entrance animations off under prefers-reduced-motion, so clicks are not
    // racing a moving target, and the suite also covers the reduced-motion path
    // every real user with that preference gets.
    reducedMotion: "reduce",
  },
  projects: PROJECTS.map((project) => ({
    name: project.name,
    use: {
      ...project.device,
      baseURL: `http://localhost:${project.port}`,
      // Read back by tests/evidence-lifecycle.spec.ts so the reset script and
      // this project's server always point at the same store.
      FAIRHOLD_DATA_DIR: project.dataDir,
    },
  })),
  webServer: SERVER_PROJECTS.map((project) => ({
    command: `npm run start -- --port ${project.port}`,
    url: `http://localhost:${project.port}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...SHARED_ENV,
      FAIRHOLD_DATA_DIR: project.dataDir,
    },
  })),
});
