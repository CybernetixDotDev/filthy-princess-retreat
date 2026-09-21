"use client";
export default function ContributorError({ reset }: { reset: () => void }) { return <section className="hub-card"><h1>We couldn’t load that.</h1><p>Please try again in a moment.</p><button type="button" className="hub-button" onClick={reset}>Try again</button></section>; }
