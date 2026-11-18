#!/usr/bin/env node
/** Reproduce Next's host-child replay bug and verify the actual route boundary. */
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = await build({
  stdin: {
    resolveDir: root,
    sourcefile: "hydration-fixture.jsx",
    contents: `
      import React from "react";
      import { hydrateRoot } from "react-dom/client";
      import { RouteContent } from "./src/components/shell/route-content";

      const parameters = new URL(location.href).searchParams;
      const errors = [];
      const initialMain = document.querySelector("main");
      const pending = Promise.resolve(React.createElement("p", null, "Stable route content"));
      // RSC children use this lazy wrapper around a thenable payload.
      if (parameters.get("child") === "lazy") pending.status = "pending";
      const lazy = {
        $$typeof: Symbol.for("react.lazy"),
        _payload: pending,
        _init(payload) {
          if (payload.status === "fulfilled") return payload.value;
          payload.then((value) => { payload.status = "fulfilled"; payload.value = value; });
          throw payload;
        },
      };
      const content = parameters.get("child") === "lazy" ? lazy : pending;
      function Fixture() {
        React.useEffect(() => {
          window.hydrationResult = {
            errors,
            retainedMain: document.querySelector("main") === initialMain,
            text: document.querySelector("main").textContent,
            reactVersion: React.version,
          };
        }, []);
        return React.createElement("main", { id: "main-content" },
          parameters.get("boundary") === "route"
            ? React.createElement(RouteContent, null, content)
            : content);
      }
      // Next starts document hydration in a transition. A settling child can replay main.
      React.startTransition(() => hydrateRoot(document.getElementById("root"), React.createElement(Fixture), {
        onRecoverableError(error) { errors.push(error.message); },
      }));
    `,
  },
  bundle: true,
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    react: path.join(root, "node_modules/next/dist/compiled/react"),
    "react-dom": path.join(root, "node_modules/next/dist/compiled/react-dom"),
  },
});

const server = http.createServer((request, response) => {
  if (request.url === "/fixture.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(fixture.outputFiles[0].text);
  } else {
    response.setHeader("content-type", "text/html");
    response.end('<!doctype html><html lang="en"><head><title>Hydration regression</title></head><body><div id="root"><main id="main-content"><p>Stable route content</p></main></div><script src="/fixture.js"></script></body></html>');
  }
});
let browser;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch();
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  let reactVersion;
  for (const child of ["promise", "lazy"]) {
    for (const boundary of ["direct", "route"]) {
      for (let repetition = 0; repetition < 3; repetition++) {
        await page.goto(`http://127.0.0.1:${server.address().port}/?child=${child}&boundary=${boundary}`);
        await page.waitForFunction(() => window.hydrationResult !== undefined);
        const result = await page.evaluate(() => window.hydrationResult);
        reactVersion = result.reactVersion;
        assert.equal(result.text, "Stable route content");
        if (boundary === "direct") {
          assert.equal(result.errors.length, 1, `${child}: the negative control must reproduce the installed React bug`);
          assert.match(result.errors[0], /Minified React error #418/);
          assert.equal(result.retainedMain, false, `${child}: the negative control must expose discarded server DOM`);
        } else {
          assert.deepEqual(result.errors, [], `${child}: RouteContent must hydrate without recovery`);
          assert.equal(result.retainedMain, true, `${child}: RouteContent must retain server-rendered main`);
        }
        assert.deepEqual(runtimeErrors, [], "Unexpected browser runtime errors");
      }
    }
  }
  console.log(`PASS: Next bundled React ${reactVersion}; 6 negative controls reproduce host-child hydration recovery, 6 actual RouteContent checks retain server DOM without errors.`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
