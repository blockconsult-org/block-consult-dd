/** Opt-in CI diagnostics. Breakpoints pause only when React has already detected a mismatch. */
import fs from "node:fs/promises";
import path from "node:path";

function observeDocument() {
  const events = [];
  const ids = new WeakMap();
  let nextId = 0;
  const node = (value) => {
    if (!value) return null;
    if (!ids.has(value)) ids.set(value, ++nextId);
    return { identity: ids.get(value), name: value.nodeName, id: value.id, value: value.nodeType === 8 ? value.nodeValue : undefined,
      role: value.getAttribute?.("role"), label: value.getAttribute?.("aria-label"), focusGuard: value.hasAttribute?.("data-radix-focus-guard") };
  };
  const record = (event) => {
    events.push({ at: Date.now(), performanceAt: performance.now(), readyState: document.readyState, ...event });
    if (events.length > 500) events.splice(0, events.length - 500);
  };
  const receive = (records) => {
    for (const mutation of records) {
      if (mutation.type === "childList" && (mutation.target === document.body || mutation.target === document.documentElement || mutation.target.id === "main-content")) {
        record({ kind: "childList", target: node(mutation.target), added: [...mutation.addedNodes].map(node), removed: [...mutation.removedNodes].map(node), previous: node(mutation.previousSibling), next: node(mutation.nextSibling) });
      } else if (mutation.type === "attributes" && ["aria-hidden", "data-aria-hidden", "data-theme"].includes(mutation.attributeName)) {
        record({ kind: "attribute", target: node(mutation.target), name: mutation.attributeName, value: mutation.target.getAttribute(mutation.attributeName) });
      }
    }
  };
  const observer = new MutationObserver(receive);
  observer.observe(document, { subtree: true, childList: true, attributes: true });
  for (const name of ["pointerdown", "click", "keydown", "focusin"]) {
    document.addEventListener(name, (event) => record({ kind: "input", name, trusted: event.isTrusted, target: node(event.target) }), true);
  }
  // Attribute observers show what changed; these stacks identify imperative root insertions.
  for (const name of ["appendChild", "insertBefore", "removeChild", "replaceChild"]) {
    const original = Node.prototype[name];
    Node.prototype[name] = function (...args) {
      if (this === document.body || this.id === "main-content") record({ kind: "dom-call", name, target: node(this), nodes: args.map(node), stack: new Error().stack });
      return original.apply(this, args);
    };
  }
  window.__bcHydrationTrace = { node, snapshot: () => { receive(observer.takeRecords()); return events.slice(); } };
}

function captureMismatch(expected, parentFiber, nextNode) {
  const node = (value) => {
    if (!value || typeof value.nodeType !== "number") return null;
    return { ...window.__bcHydrationTrace?.node(value), value: value.nodeValue, connected: value.isConnected,
      html: value.outerHTML, previous: value.previousSibling?.outerHTML ?? value.previousSibling?.nodeValue,
      next: value.nextSibling?.outerHTML ?? value.nextSibling?.nodeValue };
  };
  const kind = (value) => typeof value === "function" ? value.displayName ?? value.name : typeof value === "symbol" ? value.toString() : typeof value === "string" ? value : value?.$$typeof?.toString();
  const child = (value, depth = 0) => {
    if (value === null || typeof value !== "object") return { type: typeof value, value: typeof value === "string" ? value.slice(0,300) : kind(value) };
    if (Array.isArray(value)) return { type: "array", length: value.length, items: depth < 2 ? value.slice(0,8).map((item) => child(item, depth + 1)) : undefined };
    const payload = value._payload;
    return { type: "object", keys: Object.keys(value), thenable: typeof value.then === "function", reactType: value.$$typeof?.toString(), elementType: kind(value.type), key: value.key,
      status: value.status, payload: payload && { keys: Object.keys(payload), thenable: typeof payload.then === "function", status: payload.status, _status: payload._status, resultType: kind(payload._result), valueType: kind(payload.value), reason: payload.reason?.message,
        value: depth < 2 ? child(payload.value, depth + 1) : undefined },
      resolvedValue: depth < 2 && Object.hasOwn(value, "value") ? child(value.value, depth + 1) : undefined,
      children: depth < 2 && value.props && Object.hasOwn(value.props, "children") ? child(value.props.children, depth + 1) : undefined };
  };
  const fiber = (value) => value && ({ tag: value.tag, type: kind(value.type), key: value.key, flags: value.flags, lanes: value.lanes,
    childLanes: value.childLanes, mode: value.mode, hasAlternate: Boolean(value.alternate), stateNode: node(value.stateNode),
    props: { id: value.pendingProps?.id, className: value.pendingProps?.className, children: child(value.pendingProps?.children) } });
  const ancestors = [];
  for (let value = expected, index = 0; value && index < 25; value = value.return, index++) ancestors.push(fiber(value));
  return { at: Date.now(), performanceAt: performance.now(), url: location.href, readyState: document.readyState,
    parentIsExpected: parentFiber === expected, nextIsExpectedStateNode: nextNode === expected?.stateNode,
    nextParentIsExpectedStateNode: nextNode?.parentNode === expected?.stateNode,
    expected: fiber(expected), parentFiber: fiber(parentFiber), ancestors, childFiber: fiber(expected?.child), alternate: fiber(expected?.alternate),
    nextNode: node(nextNode), nextParent: node(nextNode?.parentNode), activeElement: node(document.activeElement),
    bodyChildren: [...document.body.childNodes].map(node), mainChildren: [...(document.querySelector("main")?.childNodes ?? [])].map(node),
    mutations: window.__bcHydrationTrace?.snapshot(), documentHtml: document.documentElement.outerHTML };
}

export async function installHydrationTrace({ page, artifactDirectory, currentContext }) {
  await fs.mkdir(artifactDirectory, { recursive: true });
  await page.addInitScript(observeDocument);
  const cdp = await page.context().newCDPSession(page);
  const pending = new Set();
  const checked = new Set();
  const breakpoints = new Map();
  const sources = new Map();
  const status = { hooks: [], mismatches: [], runtimeErrors: [], diagnosticErrors: [] };
  const schedule = (operation) => {
    const task = Promise.resolve().then(operation).catch((error) => {
      status.diagnosticErrors.push({ at: Date.now(), message: error.message, stack: error.stack });
      console.error("Hydration diagnostic error", error.message);
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };
  cdp.on("Debugger.scriptParsed", (event) => {
    if (!event.url.includes("/_next/static/chunks/") || event.url.includes("/chunks/app/") || checked.has(event.url)) return;
    checked.add(event.url);
    schedule(async () => {
      const { scriptSource } = await cdp.send("Debugger.getScriptSource", { scriptId: event.scriptId });
      // Read the actual loaded React implementation; no dependency on its emitted file hash.
      const match = /function\s+([\w$]+)\(([\w$]+)\)\{var\s+[\w$]+=Error\([\w$]+\(418,/.exec(scriptSource);
      if (!match) return;
      const prefix = scriptSource.slice(Math.max(0, match.index - 500), match.index);
      const cursors = /var ([\w$]+)=null,([\w$]+)=null,[\w$]+=!1,[\w$]+=null/.exec(prefix);
      if (!cursors) throw new Error(`Cannot identify hydration cursors in ${event.url}`);
      const offset = scriptSource.indexOf("{", match.index) + 1;
      const preceding = scriptSource.slice(0, offset).split("\n");
      const location = { url: event.url, lineNumber: preceding.length - 1, columnNumber: preceding.at(-1).length };
      const { breakpointId } = await cdp.send("Debugger.setBreakpointByUrl", location);
      const hook = { ...location, breakpointId, functionName: match[1], argumentName: match[2], parentName: cursors[1], nextName: cursors[2] };
      breakpoints.set(breakpointId, hook);
      sources.set(event.url, scriptSource);
      sources.set(event.scriptId, scriptSource);
      status.hooks.push(hook);
      console.log("Hydration diagnostic armed", JSON.stringify(hook));
    });
  });
  cdp.on("Debugger.paused", (event) => schedule(async () => {
    try {
      const hook = event.hitBreakpoints.map((id) => breakpoints.get(id)).find(Boolean);
      if (!hook) throw new Error(`Unexpected debugger pause: ${event.reason}`);
      const expression = `(${captureMismatch.toString()})(${hook.argumentName},${hook.parentName},${hook.nextName})`;
      const { result, exceptionDetails } = await cdp.send("Debugger.evaluateOnCallFrame", { callFrameId: event.callFrames[0].callFrameId, expression, returnByValue: true });
      if (exceptionDetails) throw new Error(`Cannot capture hydration state: ${exceptionDetails.text} ${result.description ?? ""}`);
      await Promise.all([...new Set(event.callFrames.map((frame) => frame.location.scriptId))].filter((id) => !sources.has(id)).map(async (id) => {
        const { scriptSource } = await cdp.send("Debugger.getScriptSource", { scriptId: id });
        sources.set(id, scriptSource);
      }));
      const detail = { ...currentContext(), hook, ...result.value, callFrames: event.callFrames.map((frame) => {
        const source = sources.get(frame.location.scriptId);
        const lines = source?.split("\n");
        const offset = lines?.slice(0, frame.location.lineNumber).reduce((total, line) => total + line.length + 1, 0) + frame.location.columnNumber;
        return { functionName: frame.functionName, url: frame.url, location: frame.location, scopes: frame.scopeChain.map((scope) => ({ type: scope.type, name: scope.name })), sourceNearFrame: source?.slice(Math.max(0, offset - 500), offset + 800) };
      }) };
      const name = `mismatch-${String(status.mismatches.length + 1).padStart(3, "0")}.json`;
      status.mismatches.push({ file: name, at: detail.at, stage: detail.stage, action: detail.action });
      await fs.writeFile(path.join(artifactDirectory, name), JSON.stringify(detail, null, 2));
      console.error("HYDRATION_MISMATCH", JSON.stringify({ file: name, stage: detail.stage, action: detail.action, url: detail.url,
        parentIsExpected: detail.parentIsExpected, expectedType: detail.expected?.type, nextNode: { name: detail.nextNode?.name, value: detail.nextNode?.value },
        recentMutations: detail.mutations?.slice(-12), callFrames: detail.callFrames.map(({ functionName, location }) => ({ functionName, location })) }));
    } finally {
      await cdp.send("Debugger.resume");
    }
  }));
  await cdp.send("Debugger.enable");
  const flush = async () => {
    while (pending.size) await Promise.allSettled([...pending]);
    await fs.writeFile(path.join(artifactDirectory, "status.json"), JSON.stringify(status, null, 2));
  };
  return { recordRuntime: (detail) => status.runtimeErrors.push(detail), flush };
}
