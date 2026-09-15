"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitGeneralEnquiry, type GeneralEnquiryState } from "@/app/actions/enquiries";
import { SubmitButton } from "@/components/submit-button";

function ImagePlaceholder({ label, className = "" }: { label: string; className?: string }) {
  return <div className={`editorial-image-placeholder ${className}`} role="img" aria-label={`Image placeholder: ${label}`}><span>Image placeholder</span><strong>{label}</strong></div>;
}

function InterestForm() {
  const [state, action] = useActionState<GeneralEnquiryState, FormData>(submitGeneralEnquiry, {});
  if (state.success) return <div className="retreat-interest-success" aria-live="polite"><p className="retreat-eyebrow">Your note has arrived</p><h3>Lovely. I&apos;ll be in touch.</h3><p>Nothing has been booked or reserved. Cally will read your note and come back to you personally.</p></div>;
  return <form className="retreat-interest-form" action={action}>
    <label>Name<input name="full_name" autoComplete="name" minLength={2} maxLength={200} required /></label>
    <label>Email<input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
    <label>Where are you coming from? <span>(optional)</span><input name="country" autoComplete="country-name" maxLength={100} /></label>
    <label className="retreat-interest-wide">Anything you&apos;d like Cally to know? <span>(optional)</span><textarea name="message" rows={5} maxLength={2000} /></label>
    {state.error && <p className="retreat-form-error" role="alert">{state.error}</p>}
    <div className="retreat-interest-wide"><SubmitButton>I&apos;d like to come →</SubmitButton></div>
  </form>;
}

export function EditorialRetreatPage() {
  return <article className="retreat-editorial">
    <section className="retreat-editorial-hero"><div className="retreat-editorial-hero-copy"><p className="retreat-eyebrow">The Filthy Princess Retreat</p><h1>Come disappear for a little while.</h1><p className="retreat-editorial-lead">A private escape filled with beautiful food, ridiculous comfort, long mornings, late nights, little surprises — and a princess who has been looking forward to having you.</p><a className="retreat-editorial-cta" href="#what-this-is">Discover the Retreat ↓</a></div><ImagePlaceholder className="retreat-hero-placeholder" label="Cinematic luxury retreat hero" /></section>

    <section className="retreat-editorial-section retreat-editorial-split" id="what-this-is"><div><p className="retreat-eyebrow">What this actually is</p><h2>This isn&apos;t a hotel.</h2><p className="retreat-editorial-lead">It isn&apos;t a conventional retreat either. For a few days, ordinary life stays outside.</p><p>You stay somewhere beautiful, eat extraordinarily well, sleep late, dress up, stay in, explore, get spoiled and experience things personally created around you.</p><p className="retreat-editorial-quiet">Some things are planned.<br />Some things happen because Cally had an idea.<br />And some things are better left until you&apos;re here.</p></div><ImagePlaceholder label="Intimate luxury detail" /></section>

    <section className="retreat-editorial-section retreat-editorial-split retreat-editorial-reverse"><ImagePlaceholder label="Accommodation, bedroom or private retreat environment" /><div><p className="retreat-eyebrow">The stay</p><h2>Somewhere worth running away to.</h2><p>Privacy. Beautiful accommodation. Soft sheets, baths, beautiful surroundings, quiet spaces and the freedom from ordinary responsibilities.</p><p className="retreat-editorial-emphasis">Luxury because, for once, you don&apos;t have to think about very much at all.</p></div></section>

    <section className="retreat-editorial-section retreat-food"><div><p className="retreat-eyebrow">Filthy Foods</p><h2>You definitely won&apos;t be going hungry.</h2><p>Beautiful breakfasts, long mornings, picnics, elegant meals, comforting food, desserts and a little Filthy Princess personality threaded through it all.</p><p>Some exist because Cally decided strawberries and chocolate were a perfectly reasonable dinner.</p><p className="retreat-editorial-emphasis">Come hungry.</p></div><ImagePlaceholder label="High-end food editorial" /></section>

    <section className="retreat-editorial-section retreat-day"><div className="retreat-day-heading"><p className="retreat-eyebrow">A day at Filthy Princess</p><h2>There isn&apos;t really an itinerary.</h2></div><div className="retreat-day-grid"><div><ImagePlaceholder label="Slow morning" /><h3>Morning</h3><p>Waking naturally, coffee, breakfast, no rushing.</p></div><div><ImagePlaceholder label="Beautiful afternoon" /><h3>Afternoon</h3><p>Exploring somewhere beautiful, a picnic, pampering, or deciding not to leave.</p></div><div><ImagePlaceholder label="Dressed-up evening" /><h3>Evening</h3><p>Dressing up, wonderful food, something sparkling and whatever Cally has planned.</p></div><div className="retreat-day-late"><h3>Late</h3><p>That&apos;s between you and the princess.</p></div></div></section>

    <section className="retreat-editorial-section retreat-editorial-split retreat-editorial-reverse"><ImagePlaceholder label="Pampering, thoughtful preparation or beautiful detail" /><div><p className="retreat-eyebrow">Being looked after</p><h2>Being spoiled is kind of the point.</h2><p>You aren&apos;t coming to organise anything. Favourite things, comfort, thoughtful details, remembered preferences and personalised attention are all part of the shape of the stay.</p><p className="retreat-editorial-lead">The Retreat should feel less like being processed through luxury hospitality and more like somebody genuinely wanted you to have an extraordinary few days.</p></div></section>

    <section className="retreat-editorial-section retreat-cally-section"><div><p className="retreat-eyebrow">Cally</p><h2>You&apos;re not exactly coming here to avoid me.</h2><p>Cally is your hostess, companion, experience creator and mischievous guide. Retreat Cally isn&apos;t a fictional character. She is everyday Cally, amplified: curious, warm, easily distracted by pretty things and very committed to making you feel welcome.</p><Link className="retreat-editorial-cta" href="/cally">Meet Cally →</Link></div><ImagePlaceholder label="Warm, sophisticated, mischievous Cally Retreat portrait" /></section>

    <section className="retreat-editorial-section retreat-editorial-split"><div><p className="retreat-eyebrow">The Filthy Princess Experience</p><h2>And then things get a little more Filthy Princess.</h2><p>Accommodation, food and pampering are only part of the stay. The Filthy Princess Experience is playful, personal, curious, occasionally ridiculous and sometimes surprisingly meaningful.</p><p>There are two ways to enter it. You can follow curiosity inward, or let it take you somewhere a little more mischievous.</p><Link className="retreat-editorial-cta" href="/experience">Discover the Experiences →</Link></div><ImagePlaceholder label="Experience and discovery editorial" /></section>

    <section className="retreat-editorial-section retreat-surprises"><p className="retreat-eyebrow">Surprises</p><h2>The best bits probably aren&apos;t on this page.</h2><p className="retreat-editorial-lead">Some surprises are tiny. Some are extravagant. Some are useful, some are entirely unnecessary, and some are things you take home.</p><div className="retreat-detail-grid">{["Gifts", "Keys", "Baths", "Strawberries", "Handwritten notes", "Something unexplained"].map((label) => <ImagePlaceholder key={label} label={label} />)}</div></section>

    <section className="retreat-editorial-section retreat-qualification"><p className="retreat-eyebrow">Qualification</p><h2>You might belong here if…</h2><div className="retreat-qualification-list"><p>You value privacy over packaged tourism.</p><p>You prefer personal experiences to predictable itineraries.</p><p>You notice beautiful things.</p><p>You are curious, have a sense of humour and enjoy comfort.</p><p>You are comfortable spending time with someone unconventional.</p><p className="retreat-editorial-emphasis">…I want to know what this is like.</p></div></section>

    <section className="retreat-editorial-section retreat-interest"><div><p className="retreat-eyebrow">Express your interest</p><h2>Tell me you&apos;d like to come.</h2><p>You don&apos;t need to choose dates.<br />You don&apos;t need to configure a package.<br />You don&apos;t need to book anything right now.</p></div><InterestForm /></section>

    <section className="retreat-editorial-section retreat-sanctum"><p className="retreat-eyebrow">The Inner Sanctum</p><h2>Not quite ready to run away with me?</h2><p>That&apos;s okay. You don&apos;t need to attend the Retreat to enter the Filthy Princess world. There are stories, games, photographs, discoveries, interactions, participation and evolving experiences waiting inside.</p><p>And eventually, you may find that the princess has something much bigger planned for you.</p><Link className="retreat-editorial-cta" href="/store">Enter the Inner Sanctum →</Link><Link className="retreat-editorial-cta retreat-bookings-link" href="/bookings">See what&apos;s happening next →</Link></section>
  </article>;
}