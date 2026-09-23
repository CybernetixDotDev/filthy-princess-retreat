import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const filthLayout = readFileSync("app/filth/layout.tsx", "utf8");
const filthPage = readFileSync("app/filth/page.tsx", "utf8");
const storePage = readFileSync("app/store/page.tsx", "utf8");

test("Filth uses the shared shell while preserving its auth gate and product content", () => {
  assert.match(filthLayout, /import \{ FilthyShell \} from "@\/components\/filthy-shell"/);
  assert.match(filthLayout, /if \(!user\) redirect\("\/signin\?next=\/filth"\)/);
  assert.match(filthLayout, /return <FilthyShell>\{children\}<\/FilthyShell>/);
  assert.doesNotMatch(filthLayout, /filth-header|filth-header-actions|signOut/);
  assert.match(filthPage, /getMyFilthPageState/);
  assert.match(filthPage, /FilthMeter/);
  assert.match(filthPage, /filth-activity|filth-milestones|filth-utility/);
  assert.match(filthPage, /className="filth-page"/);
  assert.doesNotMatch(filthPage, /<main className="filth-page"/);
});

test("Store uses the shared shell while preserving acquisition and auth handoff", () => {
  assert.match(storePage, /import \{ FilthyShell \} from "@\/components\/filthy-shell"/);
  assert.match(storePage, /if \(!user\) redirect\("\/signin\?next=\/store"\)/);
  assert.match(storePage, /return <FilthyShell><div className="store-page private-store-page">/);
  assert.match(storePage, /store_products/);
  assert.match(storePage, /get_my_filth_progression/);
  assert.match(storePage, /checkout\/start\?product=/);
  assert.match(storePage, /private-store-catalogue|private-store-card/);
  assert.doesNotMatch(storePage, /<main className="store-page/);
});
