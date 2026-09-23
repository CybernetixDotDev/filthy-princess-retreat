import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { CustomerPresentationState } from "../lib/customer-presentation.ts";
import { customerDestinations } from "../lib/customer-destinations.ts";

const require = createRequire(import.meta.url);
const signOut = async () => {};
function load(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const anonymous: CustomerPresentationState = { authenticated: false, user: null, isAdmin: false, hasInnerSanctumAccess: false, filth: null };
const participant: CustomerPresentationState = {
  authenticated: true, user: { id: "never-display-this-id", displayName: "Cally", email: "cally@example.com" }, isAdmin: false, hasInnerSanctumAccess: false,
  filth: { lifetime_filth: 120, available_filth: 35, current_level: 2, current_level_title: "Curious", current_level_threshold: 100, next_level: 3, next_level_title: "Closer", next_level_threshold: 200, filth_to_next_level: 80, progress_percentage: 20, can_spend_filth: false },
};
function render(state: CustomerPresentationState, pathname = "/inner-sanctum/tasks") {
  const { FilthyNav } = load("components/filthy-nav.tsx", {
    "next/navigation": { usePathname: () => pathname },
    "@/lib/customer-destinations": { customerDestinations },
    "@/app/actions/auth": { signOut },
  });
  return renderToStaticMarkup(createElement(FilthyNav as ComponentType<{ state: CustomerPresentationState }>, { state }));
}
function assertWorld(html: string) {
  for (const href of ["/retreat", "/inner-sanctum", "/store", "/filth", "/contribute"]) {
    assert.ok(html.includes(`href="${href}"`), href);
  }
  for (const phrase of ["run away", "come closer", "take something", "get filthy", "make something"]) assert.ok(html.includes(phrase));
}

test("anonymous navigation offers both account entrances and the whole world, without fake identity or Filth", () => {
  const html = render(anonymous);
  assertWorld(html);
  assert.match(html, /href="\/signin\?mode=signup"[^>]*>Join free/);
  assert.match(html, /href="\/signin"[^>]*>Sign in/);
  assert.doesNotMatch(html, /filthy-nav-identity|filthy-nav-track|Your Filth:|Account &amp; settings/);
});

test("non-member and member retain the same world links and authoritative Filth values", () => {
  for (const hasInnerSanctumAccess of [false, true]) {
    const html = render({ ...participant, hasInnerSanctumAccess });
    assertWorld(html);
    assert.match(html, /Open account for Cally/);
    assert.match(html, /120 lifetime, 35 available/);
    assert.match(html, /20% progress toward Closer/);
    assert.match(html, /style="width:20%"/);
    assert.match(html, /href="\/you"/);
    assert.match(html, /cally@example.com/);
    assert.match(html, /Sign out/);
    assert.doesNotMatch(html, /href="\/admin"|never-display-this-id|\/inner-sanctum\/you/);
  }
});

test("Admin appears only in the authenticated account surface", () => {
  const html = render({ ...participant, isAdmin: true });
  assertWorld(html);
  assert.match(html, /href="\/admin"/);
  assert.doesNotMatch(render({ ...anonymous, isAdmin: true }), /href="\/admin"/);
});

test("missing optional Filth is a functional link, never a false zero or empty track", () => {
  const html = render({ ...participant, filth: null });
  assert.match(html, /aria-label="View your Filth"/);
  assert.doesNotMatch(html, /filthy-nav-track|0 lifetime|0% progress/);
});

test("identity falls back safely and long labels remain text", () => {
  const user = participant.user!;
  assert.match(render({ ...participant, user: { ...user, displayName: null } }), /Open account for cally/);
  assert.match(render({ ...participant, user: { ...user, displayName: null, email: null } }), /Open account for Your account/);
  const html = render({ ...participant, user: { ...user, displayName: "Long name ".repeat(30) + "<script>" } });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /Long name <script>/);
});

test("nested active matching does not mark unrelated prefix routes active", () => {
  assert.equal((render(participant).match(/aria-current="page"/g) ?? []).length, 2);
  assert.doesNotMatch(render(participant, "/inner-sanctum-other"), /aria-current="page"/);
});

test("Filth and Store destinations receive active state in both navigation surfaces", () => {
  for (const pathname of ["/filth", "/store"]) {
    const html = render(participant, pathname);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 2, pathname);
  }
});

test("native dialog triggers are labelled, collapsed initially, and decorations are hidden", () => {
  const html = render(participant);
  assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.equal((html.match(/<dialog /g) ?? []).length, 2);
  assert.match(html, /Close account/);
  assert.match(html, /Close world navigation/);
  assert.match(html, /aria-hidden="true" focusable="false"/);
});

test("shell composes state once and passes it to the existing client nav", async () => {
  let reads = 0;
  const { FilthyShell } = load("components/filthy-shell.tsx", {
    "@/lib/customer-presentation": { getCustomerPresentationState: async () => { reads++; return participant; } },
    "@/components/filthy-nav": { FilthyNav: ({ state }: { state: CustomerPresentationState }) => { assert.equal(state, participant); return createElement("nav", null, "navigation"); } },
  });
  const shell = FilthyShell as (props: { children: string }) => Promise<ReturnType<typeof createElement>>;
  const html = renderToStaticMarkup(await shell({ children: "content" }));
  assert.equal(reads, 1);
  assert.match(html, /<nav>navigation<\/nav><main[^>]*>content<\/main>/);
});
