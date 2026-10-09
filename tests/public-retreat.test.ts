import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/retreat/page.tsx", "utf8");
const component = readFileSync("components/public-retreat-page.tsx", "utf8");
const offer = readFileSync("components/retreat-offer.tsx", "utf8");
const enquiries = readFileSync("app/actions/enquiries.ts", "utf8");
const entrance = readFileSync("app/actions/entrance.ts", "utf8");
const root = readFileSync("app/page.tsx", "utf8");

test("public Retreat loads published products inside the shared shell", () => {
  assert.match(page, /FilthyShell/);
  assert.match(page, /retreat-page-full-bleed/);
  assert.match(page, /from\("retreat_products"\)/);
  assert.match(page, /eq\("is_published", true\)/);
  assert.match(page, /order\("sort_order"\)/);
  assert.doesNotMatch(page, /requireContributorAuth|getAuthState|hasInnerSanctumAccess/);
  assert.doesNotMatch(page, /<main/);
});

test("Retreat supports only private formats and uses authoritative public pricing", () => {
  assert.match(offer, /getPublicRetreatPrice/);
  assert.match(offer, /"solo", "couples", "private_group"/);
  assert.doesNotMatch(component, /join_a_group/);
  assert.doesNotMatch(offer, /calculateRetreatUsd|price_usd_per_person/);
  assert.match(offer, /three-night|Three nights|nights/);
});

test("public Retreat enquiry uses the anonymous interest RPC without booking language", () => {
  assert.match(enquiries, /submitPublicRetreatInterest/);
  assert.match(enquiries, /submit_public_retreat_interest/);
  assert.match(enquiries, /full_name/);
  assert.match(enquiries, /product_id/);
  assert.match(enquiries, /retreat_format/);
  assert.match(enquiries, /guest_count/);
  assert.doesNotMatch(enquiries.slice(enquiries.indexOf("export async function submitPublicRetreatInterest")), /requireContributorAuth|getAuthState/);
  assert.match(offer, /Nothing has been booked or charged yet/);
});

test("anonymous entrance handoff goes to Retreat while authenticated root routing remains", () => {
  assert.match(entrance, /redirect\("\/retreat"\)/);
  assert.match(root, /if \(user\) redirect\(isAdmin \? "\/admin" : await authenticatedDestination\(\)\)/);
  assert.match(root, /redirect\("\/retreat"\)/);
});

test("public Retreat presents all twelve approved sections in order", () => {
  for (const beat of [
    "Come to South Africa.",
    "Run away with me.",
    "You&apos;ve been curious long enough.",
    "COME SPEND THREE NIGHTS WITH CALLY.",
    "LET ME GET MY HANDS ON YOU.",
    "WHAT DOES YOUR FILTH LOOK LIKE IN DAYLIGHT?",
    "AND THEN IT GETS DARK.",
    "The Filthy Feast.",
    "DON&apos;T GO TO BED YET.",
    "OH, WE&apos;RE GOING TO PLAY.",
    "HI. I&apos;M CALLY.",
    "WE REALLY DO NOTHING.",
    "WANT TO DO THAT FOR REAL?",
    "not ready?",
  ]) assert.ok(component.includes(beat), `expected page copy: ${beat}`);
  for (const beat of [
    "No performance.",
    "No exam.",
    "No graduation.",
    "Just curiosity with somewhere to go.",
    "You&apos;ve met your Filthy Princess in daylight.",
    "You&apos;ve spent enough time thinking about what filth means.",
    "Futanari Princess ♡",
    "WHAT IS FILTH?",
    "Maybe you simply had three fucking wonderful nights.",
    "you don&apos;t have to leave. ♡",
  ]) assert.ok(`${component}\n${offer}`.includes(beat), `expected refined copy: ${beat}`);
  const sections = [
    'id="top"',
    'id="nights"',
    'aria-labelledby="retreat-massage-title"',
    'aria-labelledby="retreat-day-title"',
    'aria-labelledby="retreat-sunset-title"',
    'aria-labelledby="retreat-feast-title"',
    'aria-labelledby="retreat-after-dinner-title"',
    'aria-labelledby="retreat-play-title"',
    'aria-labelledby="retreat-host-title"',
    'aria-labelledby="retreat-morning-title"',
    'id="offer"',
    'aria-labelledby="retreat-not-ready-title"',
  ];
  const positions = sections.map((section) => component.indexOf(section));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.doesNotMatch(component, /retreat-cally-scroll-scene|retreat-cally-sticky-stage|retreat-cally-scroll-track|650svh|760svh/);
});

test("Retreat uses the selected supplied images without placeholders or duplicate photography", () => {
  const imagePaths = [...component.matchAll(/src="(\/assets\/[^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(imagePaths, [
    "/assets/4bonnieHero.png",
    "/assets/MainBackground.png",
    "/assets/juicySteak.png",
    "/assets/massageRoom.png",
    ...[1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14].map((number) => `/assets/retreat/Cally_Retreat_image_${number}.jpeg`),
  ].sort());
  assert.equal(new Set(imagePaths).size, imagePaths.length);
  for (const path of imagePaths) assert.ok(existsSync(`public${path}`), `expected image asset: ${path}`);
  assert.doesNotMatch(component, /ImagePlaceholder|Image to create|retreat-image-placeholder/);
  assert.match(component, /<Image src={src} alt={alt} fill sizes={sizes}/);
  const mappings: [string, number[]][] = [
    ["retreat-story-intro", [14]],
    ["retreat-story-day", [12, 13, 11, 9, 10]],
    ["retreat-story-after-dinner", [7]],
    ["retreat-story-play", [4, 5]],
    ["retreat-story-host", [3]],
    ["retreat-story-morning", [2]],
    ["retreat-story-not-ready", [1]],
  ];
  for (const [section, numbers] of mappings) {
    const start = component.indexOf(`<section className="${section}"`);
    const content = component.slice(start, component.indexOf("</section>", start));
    for (const number of numbers) assert.ok(content.includes(`Cally_Retreat_image_${number}.jpeg`), `expected image ${number} in ${section}`);
  }
});

test("Retreat offer shows one authoritative price before the enquiry action", () => {
  assert.match(offer, /getPublicRetreatPrice/);
  assert.match(offer, /submitPublicRetreatInterest/);
  assert.match(offer, /item\.positioning/);
  assert.match(offer, /name="retreat_guest_count"/);
  assert.match(offer, /onClick={retryPrice}/);
  assert.equal((offer.match(/\{displayUsd\(/g) ?? []).length, 1);
  assert.match(offer, /TELL CALLY YOU WANT TO COME\./);
  assert.match(offer, /I&apos;M INTERESTED/);
  assert.match(offer, /Enquiring doesn&apos;t commit you to anything/);
  assert.ok(offer.indexOf("retreat-offer-price") < offer.indexOf("retreat-offer-enquiry"));
  assert.ok(component.indexOf('id="offer"') < component.indexOf('aria-labelledby="retreat-not-ready-title"'));
  assert.match(component, /href="\/inner-sanctum">Enter the Inner Sanctum →/);
});
