#!/usr/bin/env node
/** Production UI check. Uses a throwaway database; never reads installed app data. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { choose, installProviderFixtures, verifyCaseWorkflows, verifyInitialHydration, verifySettingsWorkflows } from "./browser-workflows.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capture = process.argv.includes("--screenshots");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "bc-dd-browser-"));
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const url = `http://127.0.0.1:${port}`;
// Do not inherit provider keys, app tokens or another installation's data paths.
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "TMPDIR", "LANG"].includes(key),
));
Object.assign(environment, {
  DATABASE_URL: `file:${path.join(temporary, "cases.db")}`,
  BC_DATA_DIR: path.join(temporary, "data"),
  STORAGE_DIR: path.join(temporary, "storage"),
  BC_MIGRATIONS_DIR: path.join(root, "prisma", "migrations"),
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "production",
  APP_ACCESS_TOKEN: "",
  BC_SECRET_KEY: "",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  TAVILY_API_KEY: "",
  SERPAPI_API_KEY: "",
  COINGECKO_API_KEY: "",
  COINMARKETCAP_API_KEY: "",
  ETHERSCAN_API_KEY: "",
});
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { log = (log + chunk).slice(-18000); });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
let hydrationTrace;

async function api(route, method = "GET", body) {
  const response = await fetch(url + route, {
    method, headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(response.ok, `${method} ${route}: ${response.status} ${await response.clone().text()}`);
  return response.json();
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${server.exitCode}`);
    try { if ((await fetch(url + "/api/health")).ok) { ready = true; break; } } catch { /* Starting. */ }
    await delay(250);
  }
  assert(ready, "Production server did not start. Run npm run build first.");
  const { id } = await api("/api/examples", "POST", {});
  await api(`/api/cases/${id}/research`, "POST", { mode: "offline" });
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = await api(`/api/cases/${id}/research`);
    if (!state.active) {
      assert.equal(state.runs[0]?.status, "completed");
      break;
    }
    assert(attempt < 119, "Rule-based checks did not complete");
    await delay(250);
  }
  await api(`/api/cases/${id}/report`, "POST", {});

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  await installProviderFixtures(page);
  const errors = [];
  let stage = "initializing";
  let action = "Initializing browser";
  let actionStartedAt = Date.now();
  const doing = (description) => { action = description; actionStartedAt = Date.now(); };
  if (process.env.BC_TRACE_HYDRATION === "1" || process.argv.includes("--trace-hydration")) {
    const { installHydrationTrace } = await import("./hydration-trace.mjs");
    hydrationTrace = await installHydrationTrace({ page, artifactDirectory: path.join(root, "test-results", "hydration-trace"), currentContext: () => ({ stage, action, actionStartedAt }) });
  }
  page.on("pageerror", (error) => {
    const detail = { stage, action, actionStartedAt, errorAt: Date.now(), url: page.url(), message: error.message, stack: error.stack };
    errors.push(detail);
    hydrationTrace?.recordRuntime(detail);
    console.error("Browser runtime error", JSON.stringify(detail));
  });
  stage = "initial hydration";
  await verifyInitialHydration({ page, url, onAction: doing });
  const tabs = ["overview", "evidence", "records", "findings", "scorecard", "report"];
  const screens = [["dashboard", "/"], ["intake", "/cases/new"], ["settings", "/settings"],
    ["appearance", "/settings", "Appearance"], ["research-settings", "/settings", "Research"], ["usage", "/settings", "Usage"], ["unlock", "/unlock"],
    ...tabs.map((tab) => [tab, `/cases/${id}?tab=${tab}`])];
  const screenshots = new Map([
    ["light/dashboard", "dashboard-light.png"], ["dark/overview", "case-overview-dark.png"],
    ["light/scorecard", "scorecard-light.png"], ["dark/report", "reports-dark.png"],
    ["light/settings", "settings-light.png"], ["dark/settings", "settings-dark.png"],
  ]);
  if (capture) await fs.mkdir(path.join(root, "docs", "screenshots"), { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (const [name, route, section] of screens) {
      stage = `${theme}/${name}`;
      doing(`Loading ${route}`);
      await page.goto(url + route);
      doing(`Loaded ${route}`);
      if (route === "/settings") await page.getByRole("tab", { name: section ?? "AI providers", exact: true }).click();
      await choose(page, "Appearance", theme === "light" ? "Light" : "Dark", page, doing);
      if (name === "unlock") {
        await page.route("**/api/unlock", (route) => route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"The token was not accepted."}' }));
        await page.getByLabel("Access token", { exact: true }).fill("synthetic-invalid-token");
        await page.getByRole("button", { name: "Unlock", exact: true }).click();
        await page.getByRole("alert").waitFor();
        await page.unroute("**/api/unlock");
      }
      if (tabs.includes(name)) await page.getByRole("tab", { name: name[0].toUpperCase() + name.slice(1), exact: true, selected: true }).waitFor();
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
      await page.evaluate(() => document.fonts.ready);
      // Theme/tab color transitions must settle before measuring contrast.
      await page.waitForTimeout(220);
      doing("Measuring accessibility and responsive layout");
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(result.violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => ({ target: node.target, reason: node.failureSummary })) })), [], `${theme}/${name}: accessibility`);
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1050 });
        const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert(dimensions.scroll <= dimensions.width, `${theme}/${name} overflows at ${width}px`);
      }
      await page.setViewportSize({ width: 1024, height: 600 });
      await page.evaluate(() => { document.documentElement.style.zoom = "1.5"; });
      const zoomed = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      assert(zoomed, `${theme}/${name} overflows at 150% zoom in a short window`);
      await page.evaluate(() => { document.documentElement.style.zoom = ""; });
      await page.setViewportSize({ width: 1440, height: 1050 });
      const screenshot = screenshots.get(`${theme}/${name}`);
      if (capture && screenshot) await page.screenshot({ path: path.join(root, "docs", "screenshots", screenshot) });
      if (capture && theme === "dark" && name === "settings") {
        await page.setViewportSize({ width: 768, height: 720 });
        await page.screenshot({ path: path.join(root, "docs", "screenshots", "settings-narrow.png") });
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
      if (capture && theme === "light" && name === "overview") {
        await page.setViewportSize({ width: 768, height: 720 });
        await page.screenshot({ path: path.join(root, "docs", "screenshots", "case-narrow.png") });
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
    }
  }
  // Exercise a real score edit through navigation, save and reload.
  stage = "scorecard draft/save/reload";
  doing("Loading scorecard for draft/save/reload");
  await page.goto(`${url}/cases/${id}?tab=scorecard`);
  const notes = page.getByLabel("Analyst notes", { exact: true });
  doing("Editing scorecard draft");
  await notes.fill("Synthetic browser review note");
  doing("Switching to Evidence with scorecard draft");
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  doing("Returning Back to scorecard draft");
  await page.goBack();
  assert.equal(await notes.inputValue(), "Synthetic browser review note");
  doing("Saving scorecard draft");
  await page.getByRole("button", { name: "Save scorecard", exact: true }).click();
  await page.getByText("Scorecard saved", { exact: true }).waitFor();
  doing("Reloading saved scorecard");
  await page.reload();
  assert.equal(await notes.inputValue(), "Synthetic browser review note");
  stage = "case workflows";
  doing("Verifying case workflows");
  await verifyCaseWorkflows({ page, api, url, exampleId: id });
  stage = "settings workflows";
  doing("Verifying settings workflows");
  await verifySettingsWorkflows({ page, api, url });
  const pdf = await fetch(`${url}/api/cases/${id}/report/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  await hydrationTrace?.flush();
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(`PASS: SSR hydration, ${screens.length * 2} screen/theme accessibility checks, ${screens.length * 8} responsive checks, short windows and zoom, case/settings workflows, draft/save/reload, offline research, report and PDF exports.`);
  if (capture) console.log("Captured eight fictional-case screenshots in docs/screenshots/.");
} catch (error) {
  console.error(log);
  throw error;
} finally {
  await hydrationTrace?.flush();
  await browser?.close();
  server.kill();
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(5000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
  await fs.rm(temporary, { recursive: true, force: true });
}
