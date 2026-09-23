import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contributePage = readFileSync("app/contribute/page.tsx", "utf8");
const contributeLayout = readFileSync("app/contribute/layout.tsx", "utf8");
const contributorPage = readFileSync("app/contributor/page.tsx", "utf8");
const contributorLayout = readFileSync("app/contributor/layout.tsx", "utf8");
const submitPage = readFileSync("app/contributor/submit/page.tsx", "utf8");
const affiliateTerms = readFileSync("app/affiliate/terms/page.tsx", "utf8");

test("canonical Contribute home uses the shared shell without the legacy Hub header", () => {
  assert.match(contributeLayout, /FilthyShell/);
  assert.match(contributeLayout, /contributor-shell/);
  assert.match(contributeLayout, /hub-main/);
  assert.match(contributeLayout, /contributor\/contributor\.css/);
  assert.doesNotMatch(contributeLayout, /hub-nav|hub-brand|signOut/);
  assert.doesNotMatch(contributeLayout, /<main/);
  assert.match(contributePage, /contributor\/page/);
  assert.match(contributorPage, /requireContributorAuth\("\/contribute"\)/);
  assert.match(contributorPage, /AffiliateActivation/);
  assert.match(contributorPage, /FilthMeter/);
  assert.match(contributorPage, /Contribute/);
});

test("legacy Contributor and submission routes remain compatible and independently guarded", () => {
  assert.match(contributorLayout, /requireContributorAuth\("\/contribute"\)/);
  assert.match(contributorLayout, /FilthyShell/);
  assert.doesNotMatch(contributorLayout, /hub-nav|hub-brand|signOut/);
  assert.doesNotMatch(contributorLayout, /<main/);
  assert.match(submitPage, /requireContributorAuth\("\/contributor\/submit"\)/);
  assert.match(submitPage, /ContributionForm/);
  assert.match(submitPage, /href="\/contribute"/);
  assert.doesNotMatch(submitPage, /FilthyShell/);
});

test("Affiliate remains inside Contribute and its terms return to the canonical home", () => {
  assert.match(contributorPage, /<p className="eyebrow">Affiliate<\/p>/);
  assert.match(contributorPage, /get_my_affiliate_state|get_my_affiliate_impact|get_my_affiliate_earnings/);
  assert.match(affiliateTerms, /href="\/contribute"/);
  assert.doesNotMatch(contributePage, /href="\/affiliate"/);
});