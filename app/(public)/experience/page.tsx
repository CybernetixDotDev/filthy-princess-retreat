import Image from "next/image";
import Link from "next/link";
import { ExperienceInvitation } from "@/components/experience-invitation";

export default function ExperiencePage() {
  return <main className="experience-commercial experience-five-movements">
    <section className="experience-story-movement experience-feel">
      <Image className="experience-feel-image" src="/assets/ExperienceHero.png" alt="" fill sizes="100vw" priority />
      <div className="experience-feel-shade" aria-hidden="true" />
      <div className="experience-shell experience-feel-copy">
        <p className="eyebrow">You feel something.</p>
        <h1>You can feel it, can&apos;t you?</h1>
        <p>That little pull toward something you haven&apos;t quite named.</p>
        <p className="experience-feel-emphasis"><strong>That&apos;s where Filthy Princess begins.</strong></p>
      </div>
    </section>

    <section className="experience-story-movement experience-notice">
      <div className="experience-shell experience-notice-layout">
        <div className="experience-notice-heading">
          <p className="eyebrow">Pay attention to it.</p>
          <h2>Desire rarely arrives with instructions.</h2>
        </div>
        <div className="experience-notice-prose">
          <p>Sometimes it begins as curiosity.</p>
          <div className="experience-notice-pause"><p>A thought you return to.</p><p>A sensation you notice.</p><p>Something you shouldn&apos;t find interesting—but do.</p></div>
          <p>We don&apos;t rush to satisfy it.</p>
          <p className="experience-notice-emphasis"><strong>We pay attention to it.</strong></p>
          <p>Because underneath desire there can be something much more interesting: an invitation to understand yourself.</p>
          <div className="experience-notice-progression">
            <p>Permission gives curiosity somewhere safe to go.</p>
            <p>Attention gives it space.</p>
            <p>Vulnerability lets us get closer.</p>
            <p>Trust allows connection.</p>
          </div>
          <p>And eventually, sometimes, comes surrender.</p>
          <p>Not losing control.</p>
          <p className="experience-notice-emphasis"><strong>Choosing when you no longer need to hold on.</strong></p>
          <p>We call the thing underneath all of that <strong>your deepest itch.</strong></p>
          <p>I don&apos;t know what yours is.</p>
          <p className="experience-notice-final"><strong>That&apos;s rather the point.</strong></p>
        </div>
      </div>
    </section>

    <section className="experience-story-movement experience-choose">
      <div className="experience-shell"><ExperienceInvitation /></div>
    </section>

    <section className="experience-story-movement experience-arrive">
      <div className="experience-shell experience-arrive-layout">
        <div>
          <p className="eyebrow">You arrive.</p>
          <h2>And then we see what happens.</h2>
        </div>
        <div className="experience-arrive-prose">
          <p>Maybe we talk for hours.</p>
          <p>Maybe we disappear for a walk, get ridiculously pampered, make something messy, or spend an afternoon doing absolutely nothing.</p>
          <p>There&apos;ll be beautiful food. A proper South African braai. Long conversations that occasionally wander somewhere they probably shouldn&apos;t.</p>
          <div className="experience-arrive-beat"><p>Time with me.</p><p>Time without me.</p></div>
          <p>A little flirting. A little teasing. A few things I haven&apos;t put on the website.</p>
          <p>Nothing needs to happen on cue.</p>
          <p className="experience-arrive-emphasis"><strong>I&apos;ve prepared enough that we can afford to be spontaneous.</strong></p>
          <p>And somewhere between being spoiled, getting curious and considerably less well behaved…</p>
          <p className="experience-arrive-emphasis"><strong>you might notice what you&apos;ve been paying attention to all along.</strong></p>
        </div>
      </div>
    </section>

    <section className="experience-story-movement experience-closer">
      <div className="experience-shell experience-closer-copy">
        <p className="eyebrow">Come closer.</p>
        <p>You came looking for something different.</p>
        <p>Something a little improper.</p>
        <p>A little delicious.</p>
        <p>Maybe even a little filthy.</p>
        <p className="experience-closer-pause">And look at you...</p>
        <p className="experience-closer-found"><strong>you found me.</strong></p>
        <p>Now—</p>
        <Link className="experience-come-inside" href="/retreat">come inside</Link>
      </div>
    </section>
  </main>;
}
