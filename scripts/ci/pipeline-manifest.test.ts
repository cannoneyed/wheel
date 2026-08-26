import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";

const pipeline = readFileSync(
  new URL("../../.buildkite/pipeline.yml", import.meta.url),
  "utf8",
);
const elixirBackends = readFileSync(
  new URL("./test-elixir-backends.sh", import.meta.url),
  "utf8",
);
const elixirUnit = readFileSync(
  new URL("./test-elixir-unit.sh", import.meta.url),
  "utf8",
);
const mise = readFileSync(new URL("../../.mise.toml", import.meta.url), "utf8");
const previewWebsite = readFileSync(
  new URL("../../wrangler.website.jsonc", import.meta.url),
  "utf8",
);
const productionWebsite = readFileSync(
  new URL("../../wrangler.website.production.jsonc", import.meta.url),
  "utf8",
);
const githubWorkflows = new URL("../../.github/workflows", import.meta.url);

function commandCount(command: string): number {
  return pipeline.split("\n").filter((line) => line.trim() === `- "${command}"`)
    .length;
}

function textCount(value: string): number {
  return pipeline.split(value).length - 1;
}

function step(key: string): string {
  const match = pipeline
    .split("\n  - label:")
    .find((candidate) => candidate.includes(`\n    key: "${key}"\n`));
  expect(match, `missing Buildkite step ${key}`).toBeDefined();
  return match!;
}

describe("Buildkite pipeline manifest", () => {
  test("runs every local check lane once", () => {
    for (const lane of ["static", "cloudflare"]) {
      expect(textCount(`bun run check:${lane}`)).toBe(1);
    }
    expect(textCount("bun run check:unit:js")).toBe(1);
    expect(commandCount("bun run check:unit")).toBe(0);
  });

  // Build 37 deployed a site missing three files. `buildkite-agent artifact`
  // uses different glob implementations for upload and download: `dist/**/*`
  // collects top-level files on the way up but not on the way down, so
  // dist/index.html, dist/llms.txt and dist/install.md uploaded and never came
  // back, and 404'd in production. Website and Tracker therefore need BOTH
  // patterns. Wheel's dist has only nested files, so asking for its empty top
  // level fails the download command.
  test("downloads top-level artifacts only from directories that have them", () => {
    for (const [directory, sourceStep] of [
      ["packages/website/dist", "check-unit"],
      ["packages/tracker/dist", "check-browser-apps-sqlite"],
    ]) {
      expect(
        pipeline,
        `${directory} downloads nested files but not its top level`,
      ).toContain(
        `buildkite-agent artifact download '${directory}/*' . --step ${sourceStep}`,
      );
      expect(pipeline).toContain(
        `buildkite-agent artifact download '${directory}/**/*' . --step ${sourceStep}`,
      );
    }

    expect(pipeline).toContain(
      "buildkite-agent artifact download 'packages/wheel/dist/**/*' . --step check-browser-apps-sqlite",
    );
    expect(pipeline).not.toContain(
      "buildkite-agent artifact download 'packages/wheel/dist/*' . --step check-browser-apps-sqlite",
    );
  });

  test("runs every browser suite once", () => {
    for (const command of [
      "bun run docs:build",
      "bash scripts/ci/test-elixir-backends.sh",
      "bun run test:browser:tracker:sqlite",
      "bun run test:browser:website",
      "bun run test:browser:components",
      "bun run test:behaviors:smoke",
      "bun run test:browser:demos",
    ]) {
      expect(textCount(command)).toBe(1);
    }
    expect(elixirBackends).toContain('WHEEL_WIRE_URL="$wire_url"');
    expect(elixirBackends).not.toContain("bun run test:browser:tracker:sqlite");
    expect(elixirBackends).toContain("bun run test:browser:tracker:postgres");
    expect(elixirBackends).toContain(
      'TRACKER_BROWSER_SYNC_ORIGIN="$tracker_url"',
    );
  });

  test("runs SQLite and Elixir/Postgres browser apps in parallel jobs", () => {
    expect(pipeline).toContain('key: "check-browser-apps-sqlite"');
    expect(pipeline).toContain('key: "check-browser-apps-postgres"');
    expect(pipeline).not.toContain('key: "check-browser-apps"');

    for (const key of [
      "check-browser-apps-sqlite",
      "check-browser-apps-postgres",
    ]) {
      expect(pipeline.match(new RegExp(`- "${key}"`, "g"))).toHaveLength(2);
    }
  });

  test("keeps all CI modes in Buildkite", () => {
    for (const mode of ["fuzz", "cleanup"]) {
      expect(pipeline).toContain(`WHEEL_CI_MODE\") == \"${mode}`);
    }
  });

  test("keeps CI in Buildkite and uses the installable Node version", () => {
    expect(mise).toContain('node = "24.19.0"');
    expect(
      existsSync(githubWorkflows)
        ? readdirSync(githubWorkflows, { recursive: true })
        : [],
    ).toHaveLength(0);
  });

  // Build 47 used the hosted image's Node 20 instead of .mise.toml. The native
  // SQLite dependency then tried to compile, but that image has no node-gyp.
  test("installs the repository toolchain before every Bun job", () => {
    const bunSteps = pipeline
      .split("\n  - label:")
      .slice(1)
      .filter((step) => step.includes("bun install --frozen-lockfile"));

    expect(bunSteps.length).toBeGreaterThan(0);
    for (const step of bunSteps) {
      expect(step).toContain("mise#v1.1.5");
      expect(
        step
          .split("\n")
          .some((line) => line.trim() === "install_args: node bun"),
      ).toBe(true);
    }
  });

  test("uses a pinned prebuilt Elixir image in hosted CI", () => {
    const image =
      "hexpm/elixir:1.18.4-erlang-27.3.4.7-debian-bookworm-20260610-slim";
    expect(elixirUnit).toContain(image);
    expect(elixirBackends).toContain(image);
    expect(pipeline).not.toContain("WHEEL_ELIXIR_DOCKER");
  });

  test("runs Elixir checks once in the Postgres lane", () => {
    expect(elixirBackends.match(/mix format --check-formatted/g)).toHaveLength(
      2,
    );
    expect(elixirBackends).toContain("MIX_ENV=test mix test --warnings-as-errors");
    expect(elixirBackends).not.toContain("--only postgres");
    expect(elixirBackends).toContain("mix compile --warnings-as-errors");
  });

  test("isolates PostgreSQL and Elixir in a job-local Docker network", () => {
    expect(elixirBackends).toContain('docker network create "$docker_network"');
    expect(elixirBackends).toContain('--network "$docker_network"');
    expect(elixirBackends).toContain('--network-alias postgres');
    expect(elixirBackends).toContain('--publish 127.0.0.1::4801');
    expect(elixirBackends).toContain('--publish 127.0.0.1::4799');
    expect(elixirBackends).toContain('cat /proc/1/comm');
    expect(elixirBackends).not.toContain("--network host");
    expect(elixirBackends).not.toContain("--publish 55432:5432");
  });

  test("injects Cloudflare secrets only into deploy and cleanup", () => {
    expect(pipeline.match(/CLOUDFLARE_API_TOKEN:/g)).toHaveLength(2);
    expect(pipeline).toContain("build.pull_request.id == null");
  });

  test("deploys the named build artifacts", () => {
    expect(pipeline).toContain("--step check-unit");
    expect(pipeline).toContain("--step check-browser-apps-sqlite");
    expect(pipeline).toContain("mise#v1.1.5");
    expect(pipeline).toContain("install_args: node bun");
    expect(pipeline).toContain("bun scripts/ci/deploy-branch.ts");
  });

  test("keeps the standard pipeline to six balanced jobs", () => {
    expect(pipeline).not.toContain('key: "check-cloudflare"');
    expect(pipeline).not.toContain('key: "build-website"');
    expect(pipeline).not.toContain('key: "build-tracker"');

    const unit = step("check-unit");
    expect(unit).toContain("bun run check:cloudflare");
    expect(unit).toContain("bun run website:build");
    expect(unit).toContain("unit_pid=$$!");
    expect(unit).toContain('"packages/website/dist/**/*"');

    const sqlite = step("check-browser-apps-sqlite");
    expect(sqlite).toContain("bun run build");
    expect(sqlite).toContain('"packages/tracker/dist/**/*"');
    expect(sqlite).toContain('"packages/wheel/dist/**/*"');

    expect(step("check-browser-apps-postgres")).toContain(
      "bun run test:behaviors:smoke",
    );

    const deploy = step("deploy-branch");
    for (const dependency of [
      "check-static",
      "check-unit",
      "check-browser-apps-sqlite",
      "check-browser-apps-postgres",
      "check-browser-components",
      "check-browser-demos",
    ]) {
      expect(deploy).toContain(`- "${dependency}"`);
    }
  });

  // Build 89 passed the parallel checks, then stopped at `exit 0`. Buildkite
  // runs a step's command list in one shell, so the Wheel build and dry runs
  // after that block never ran. Only exit the shell when a child failed.
  test("continues after successful parallel command blocks", () => {
    for (const [key, laterCommand] of [
      ["check-unit", "wrangler.website.jsonc"],
      ["check-browser-apps-sqlite", "bun run build"],
    ]) {
      const contents = step(key);
      const guard = 'if [ "$$status" -ne 0 ]; then';

      expect(contents).toContain(guard);
      expect(contents.indexOf(laterCommand)).toBeGreaterThan(
        contents.indexOf(guard),
      );
      expect(contents).toContain(
        `${guard}\n          exit "$$status"\n        fi`,
      );
      expect(contents).not.toContain(
        'wait "$$website_pid" || status=$$?\n        exit "$$status"',
      );
    }
  });

  test("keeps wheel.dev on the main-only website configuration", () => {
    expect(productionWebsite).toContain('"pattern": "wheel.dev/*"');
    expect(previewWebsite).not.toContain("wheel.dev");
    expect(
      commandCount(
        "bun node_modules/wrangler/bin/wrangler.js deploy --dry-run --config wrangler.website.production.jsonc",
      ),
    ).toBe(1);
  });
});
