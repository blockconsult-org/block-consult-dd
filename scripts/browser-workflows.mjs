import assert from "node:assert/strict";

/** Interact with the visible custom control, never its hidden form bridge. */
export async function choose(page, name, option, scope = page) {
  await scope.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const visibleField = (page, name) => page.getByLabel(name, { exact: true }).filter({ visible: true });

export async function installProviderFixtures(page) {
  await page.route("**/api/settings/ai/models?*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ models: [{ id: "fixture-model-a", label: "Fixture model A" }, { id: "fixture-model-b", label: "Fixture model B" }] }),
  }));
  await page.route("**/api/settings/ai/test", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, message: "Fixture connection verified.", detail: "Synthetic provider; no external request." }),
  }));
}

async function saveResponse(page, path, method, action) {
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === method);
  await action();
  const result = await response;
  assert(result.ok(), `${method} ${path}: ${result.status()} ${await result.text()}`);
  return result.json();
}

async function expand(page, text) {
  const summary = page.locator("summary").filter({ hasText: text });
  if (!(await summary.evaluate((element) => element.parentElement.open))) await summary.click();
}

export async function verifyCaseWorkflows({ page, api, url, exampleId }) {
  // Creating a case exercises FormData with an empty option and two nondefault values.
  await page.goto(`${url}/cases/new`);
  const name = `Synthetic browser case ${Date.now()} with a deliberately long project name for layout verification`;
  await page.getByLabel("Project name *", { exact: true }).fill(name);
  await choose(page, "Report type", "Quick Screen");
  await expand(page, "Offer & counterparty");
  assert.match(await page.getByRole("combobox", { name: "Offer type", exact: true }).innerText(), /Unknown/);
  await choose(page, "Offer type", "Rwa");
  await page.getByLabel("Offer price", { exact: true }).fill("$1.25 per synthetic unit");
  const created = await saveResponse(page, "/api/cases", "POST", () => page.getByRole("button", { name: "Create case", exact: true }).click());
  await page.waitForURL(`${url}/cases/${created.id}`);
  const casePath = `/api/cases/${created.id}`;
  let state = await api(casePath);
  assert.equal(state.reportType, "quick_screen");
  assert.equal(state.intake.offerType, "rwa");
  assert.equal(state.intake.offerPrice, "$1.25 per synthetic unit");
  await page.setViewportSize({ width: 768, height: 600 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Long case name must fit a narrow window");
  await page.setViewportSize({ width: 1440, height: 1050 });

  // The dashboard remembers filters after opening a case and returning.
  await page.getByRole("link", { name: "Cases", exact: true }).click();
  await page.getByLabel("Search cases", { exact: true }).fill(name);
  await choose(page, "Status", "Draft");
  await choose(page, "Sort by", "Project name");
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: "Edit intake", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill(`${name} draft`);
  let cancelledNavigation = false;
  page.once("dialog", async (dialog) => { cancelledNavigation = true; await dialog.dismiss(); });
  await page.goBack();
  await page.waitForURL(`${url}/cases/${created.id}`);
  assert(cancelledNavigation, "Back from a dirty case must ask before discarding edits");
  assert.equal(await page.getByLabel("Project name", { exact: true }).inputValue(), `${name} draft`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await page.waitForURL(`${url}/`);
  assert.equal((await api(casePath)).projectName, name, "Accepting navigation must not save a discarded draft");
  assert.equal(await page.getByLabel("Search cases", { exact: true }).inputValue(), name);
  assert.match(await page.getByRole("combobox", { name: "Status", exact: true }).innerText(), /Draft/);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();

  // Updating intake must preserve the populated example's nested material.
  const beforeIntake = (await api(`/api/cases/${exampleId}`)).intake;
  await page.goto(`${url}/cases/${exampleId}`);
  await page.getByRole("button", { name: "Edit intake", exact: true }).click();
  await expand(page, "Offer & counterparty");
  await page.getByLabel("Offer price", { exact: true }).fill("$0.86 per MRDN (browser fixture)");
  await saveResponse(page, `/api/cases/${exampleId}/intake`, "PUT", () => page.getByRole("button", { name: "Save intake", exact: true }).click());
  await page.getByText("Intake saved", { exact: true }).waitFor();
  const afterIntake = (await api(`/api/cases/${exampleId}`)).intake;
  assert.equal(afterIntake.offerPrice, "$0.86 per MRDN (browser fixture)");
  for (const key of ["counterparties", "documents", "contractAddresses", "links", "questionsToVerify"]) {
    assert.deepEqual(afterIntake[key], beforeIntake[key], `Intake edit must preserve ${key}`);
  }

  await page.goto(`${url}/cases/${created.id}?tab=evidence`);
  const source = page.getByRole("group", { name: "New source", exact: true });
  await source.getByLabel("Name / label *", { exact: true }).fill("Synthetic registry extract");
  await choose(page, "Source type", "Primary Registry", source);
  await choose(page, "Reliability", "High", source);
  await source.getByLabel("URL", { exact: true }).fill("https://registry.example/fixture");
  await saveResponse(page, `${casePath}/sources`, "POST", () => source.getByRole("button", { name: "Add source", exact: true }).click());
  await page.getByText("Source added to this case.", { exact: true }).waitFor();
  state = await api(casePath);
  assert.equal(state.sources[0].sourceType, "primary_registry");
  assert.equal(state.sources[0].reliabilityRating, "high");
  assert.equal(await source.getByLabel("Name / label *", { exact: true }).inputValue(), "");
  assert.match(await source.getByRole("combobox", { name: "Reliability", exact: true }).innerText(), /Medium/);

  const claim = page.getByRole("group", { name: "New evidence claim", exact: true });
  await claim.getByLabel("Claim *", { exact: true }).fill("The synthetic registry names the issuer.");
  await choose(page, "Claim class", "Primary", claim);
  await choose(page, "Confidence", "High", claim);
  await saveResponse(page, `${casePath}/evidence`, "POST", () => claim.getByRole("button", { name: "Add claim", exact: true }).click());
  await page.getByText("Evidence claim added to this case.", { exact: true }).waitFor();
  state = await api(casePath);
  assert.equal(state.evidenceClaims[0].claimClass, "primary");
  assert.equal(state.evidenceClaims[0].confidence, "high");

  await page.getByRole("tab", { name: "Findings", exact: true }).click();
  const finding = page.getByRole("group", { name: "New finding", exact: true });
  await finding.getByLabel("Title *", { exact: true }).fill("Synthetic unresolved authority");
  await choose(page, "Severity", "High", finding);
  await finding.getByLabel("Impact", { exact: true }).fill("Authority remains unverified in this fixture.");
  await finding.getByLabel("Mitigation", { exact: true }).fill("Obtain a signed mandate.");
  await saveResponse(page, `${casePath}/findings`, "POST", () => finding.getByRole("button", { name: "Add finding", exact: true }).click());
  await page.getByText("Obtain a signed mandate.", { exact: true }).waitFor();
  state = await api(casePath);
  assert.equal(state.findings[0].severity, "high");
  assert.equal(state.findings[0].mitigation, "Obtain a signed mandate.");

  await page.getByRole("tab", { name: "Records", exact: true }).click();
  const entity = page.getByRole("group", { name: "Add entity", exact: true });
  await entity.getByLabel("Name *", { exact: true }).fill("Synthetic issuer company");
  await choose(page, "Confidence", "High", entity);
  await choose(page, "Record type", "Person");
  await choose(page, "Record type", "Entity");
  assert.equal(await entity.getByLabel("Name *", { exact: true }).inputValue(), "Synthetic issuer company");
  await saveResponse(page, `${casePath}/records`, "POST", () => entity.getByRole("button", { name: "Add entity", exact: true }).click());
  await entity.getByText("Entity added.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit entity", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit entity", exact: true });
  await editor.getByLabel("Jurisdiction", { exact: true }).fill("Austria");
  await choose(page, "Confidence", "Medium", editor);
  state = await api(casePath);
  await saveResponse(page, `${casePath}/records/entity/${state.entities[0].id}`, "PATCH", () => editor.getByRole("button", { name: "Save changes", exact: true }).click());
  await editor.waitFor({ state: "hidden" });
  state = await api(casePath);
  assert.equal(state.entities[0].jurisdiction, "Austria");
  assert.equal(state.entities[0].confidence, "medium");

  await page.getByRole("tab", { name: "Scorecard", exact: true }).click();
  await page.getByLabel("Legal/regulatory clarity", { exact: true }).fill("8");
  await page.getByRole("checkbox", { name: /Actual legal instrument unknown/ }).check();
  await choose(page, "Confidence level", "high");
  await saveResponse(page, `${casePath}/scorecard`, "PUT", () => page.getByRole("button", { name: "Save scorecard", exact: true }).click());
  await page.getByText("Scorecard saved", { exact: true }).waitFor();
  await page.reload();
  assert.equal(await page.getByLabel("Legal/regulatory clarity", { exact: true }).inputValue(), "8");
  assert(await page.getByRole("checkbox", { name: /Actual legal instrument unknown/ }).isChecked());
  state = await api(casePath);
  assert.equal(state.scorecard.confidenceLevel, "high");
  assert.equal(JSON.parse(state.scorecard.manualGating).legalInstrumentUnknown, true);

  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await saveResponse(page, `${casePath}/research`, "POST", () => page.getByRole("button", { name: "Run rule-based checks", exact: true }).click());
  for (let attempt = 0; attempt < 120; attempt++) {
    const research = await api(`${casePath}/research`);
    if (!research.active) {
      assert.equal(research.runs[0]?.status, "completed", "Rule-based checks started from the UI must finish");
      break;
    }
    assert(attempt < 119, "Rule-based checks started from the UI did not complete");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  state = await api(casePath);
  assert.equal(state.scorecard.legalRegulatoryClarity, 8, "Research must retain the analyst's score");
  assert.equal(JSON.parse(state.scorecard.manualGating).legalInstrumentUnknown, true, "Research must retain the analyst's blocker");
  await page.getByRole("button", { name: "Run rule-based checks", exact: true }).waitFor();

  await page.getByRole("tab", { name: "Report", exact: true }).click();
  await saveResponse(page, `${casePath}/report`, "POST", () => page.getByRole("button", { name: "Save latest snapshot", exact: true }).click());
  await page.getByRole("heading", { name: "Latest saved snapshot", exact: true }).waitFor();
  state = await api(casePath);
  const snapshot = state.reports[0];
  const replace = page.getByRole("button", { name: "Replace saved snapshot", exact: true });
  await replace.click();
  const confirmation = page.getByRole("dialog", { name: `Replace snapshot v${snapshot.version}?`, exact: true });
  await confirmation.waitFor();
  await page.keyboard.press("Escape");
  await confirmation.waitFor({ state: "hidden" });
  await page.waitForFunction((element) => element === document.activeElement, await replace.elementHandle());
  assert(await replace.evaluate((element) => element === document.activeElement), "Escape restores snapshot action focus");
  await replace.click();
  await confirmation.getByRole("button", { name: "Keep saved snapshot", exact: true }).click();
  await confirmation.waitFor({ state: "hidden" });
  await page.waitForFunction((element) => element === document.activeElement, await replace.elementHandle());
  assert.equal((await api(casePath)).reports[0].version, snapshot.version, "Cancelling replacement must retain the snapshot");
  await api(`${casePath}/scorecard`, "PUT", { legalRegulatoryClarity: 3, gating: { legalInstrumentUnknown: true } });
  const html = await fetch(`${url}${casePath}/report/html`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<!doctype html>/i);
  const livePdf = await fetch(`${url}${casePath}/report/pdf`);
  assert.equal(livePdf.status, 200);
  assert.equal(Buffer.from(await livePdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  state = await api(casePath);
  assert.equal(state.reports[0].version, snapshot.version, "Current-case exports must not replace the saved snapshot");
  assert.equal(state.reports[0].overallScore, snapshot.overallScore);
  for (const file of snapshot.files) {
    assert.equal((await fetch(`${url}${casePath}/files/${file.id}`)).status, 200);
  }
}

export async function verifySettingsWorkflows({ page, api, url }) {
  await page.goto(`${url}/settings?section=providers&provider=openai`);
  await page.getByRole("tab", { name: "AI providers", exact: true }).click();
  await choose(page, "Configure provider", "OpenAI API");
  await choose(page, "Model", "Custom model ID");
  await visibleField(page, "Custom model ID").fill("fixture-custom-openai");
  await choose(page, "Effort", "Medium");
  await choose(page, "Configure provider", "Claude API");
  await choose(page, "Model", "Custom model ID");
  await visibleField(page, "Custom model ID").fill("fixture-custom-claude");
  await page.getByRole("tab", { name: "Research", exact: true }).click();
  await choose(page, "Research depth", "Quick");
  await page.getByRole("tab", { name: "AI providers", exact: true }).click();
  assert.equal(await visibleField(page, "Custom model ID").inputValue(), "fixture-custom-claude");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await choose(page, "Configure provider", "OpenAI API");
  assert.equal(await visibleField(page, "Custom model ID").inputValue(), "fixture-custom-openai");
  assert(await page.getByRole("button", { name: "Test connection", exact: true }).isDisabled());

  // A failed save keeps the draft and permits a successful retry.
  await page.route("**/api/settings/ai", (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Synthetic settings save failure"}' })
    : route.continue(), { times: 1 });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Synthetic settings save failure" }).waitFor();
  assert.equal(await visibleField(page, "Custom model ID").inputValue(), "fixture-custom-openai");
  await saveResponse(page, "/api/settings/ai", "PUT", () => page.getByRole("button", { name: "Save changes", exact: true }).click());
  await page.getByText("Connection settings saved", { exact: true }).waitFor();
  let view = await api("/api/settings/ai");
  assert.equal(view.settings.openai.model, "fixture-custom-openai");
  assert.equal(view.settings.openai.effort, "medium");
  assert.equal(view.settings.activeProvider, null, "Configuring a provider must not activate it");

  await page.getByRole("tab", { name: "Research", exact: true }).click();
  assert.match(await page.getByRole("combobox", { name: "Research depth", exact: true }).innerText(), /Quick/);
  await saveResponse(page, "/api/settings/ai", "PUT", () => page.getByRole("button", { name: "Save research settings", exact: true }).click());
  await page.getByText("Research settings saved", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("tab", { name: "Research", exact: true, selected: true }).waitFor();
  assert.equal((await api("/api/settings/ai")).settings.research.depth, "quick");

  await page.getByRole("tab", { name: "AI providers", exact: true }).click();
  const key = "sk-test-blockconsult-fixture-key-0001";
  await visibleField(page, "API key").fill("invalid");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await visibleField(page, "API key").inputValue(), "invalid");
  await visibleField(page, "API key").fill(key);
  assert.equal(await visibleField(page, "API key").getAttribute("type"), "password");
  await saveResponse(page, "/api/settings/ai/keys/openai", "PUT", () => page.getByRole("button", { name: "Save key", exact: true }).click());
  await page.getByText("Key saved securely.", { exact: true }).filter({ visible: true }).waitFor();
  view = await api("/api/settings/ai");
  assert.equal(view.keys.openai.present, true);
  assert.equal(view.keys.openai.readable, true);
  assert.equal(view.settings.activeProvider, "openai");
  assert(!JSON.stringify(view).includes(key), "Settings responses must not expose saved keys");
  assert(!(await page.locator("body").innerText()).includes(key), "Saved key must stay masked");

  await page.route("**/api/settings/ai/test", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Synthetic connection unavailable"}' }), { times: 1 });
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Synthetic connection unavailable" }).waitFor();
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByText("Fixture connection verified.", { exact: true }).waitFor();
  await choose(page, "Effort", "High");
  assert.equal(await page.getByText("Fixture connection verified.", { exact: true }).count(), 0, "Editing settings invalidates the old connection test");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();

  await page.getByRole("button", { name: "Replace key", exact: true }).click();
  await visibleField(page, "Replacement API key").fill("sk-test-blockconsult-fixture-key-0002");
  await choose(page, "Configure provider", "Claude API");
  await choose(page, "Configure provider", "OpenAI API (active)");
  assert.equal(await visibleField(page, "Replacement API key").inputValue(), "sk-test-blockconsult-fixture-key-0002");
  await saveResponse(page, "/api/settings/ai/keys/openai", "PUT", () => page.getByRole("button", { name: "Replace key", exact: true }).click());
  await page.getByText("Key saved securely.", { exact: true }).filter({ visible: true }).waitFor();
  assert.match((await api("/api/settings/ai")).keys.openai.hint, /0002/);
  await page.getByRole("button", { name: "Remove OpenAI API key", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal((await api("/api/settings/ai")).keys.openai.present, true);
  await page.getByRole("button", { name: "Remove OpenAI API key", exact: true }).click();
  await saveResponse(page, "/api/settings/ai/keys/openai", "DELETE", () => page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click());
  await page.getByText("Key removed.", { exact: true }).waitFor();
  assert.equal((await api("/api/settings/ai")).keys.openai.present, false);
  await saveResponse(page, "/api/settings/ai", "PUT", () => page.getByRole("button", { name: "Turn off AI", exact: true }).click());
  assert.equal((await api("/api/settings/ai")).settings.activeProvider, null);

  // Both pickers stay in sync; system mode follows live OS changes and reloads.
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await choose(page, "Theme", "System");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.match(await page.getByRole("combobox", { name: "Appearance", exact: true }).innerText(), /System/);
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  assert.match(await page.getByRole("combobox", { name: "Theme", exact: true }).innerText(), /System/);
}
