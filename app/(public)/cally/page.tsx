import Image from "next/image";
import type { ReactNode } from "react";
import { CallyDiscovery } from "@/components/cally-discovery";

function CallyPortraitFrame({ className, children }: { className: string; children: ReactNode }) {
  return <figure className={`cally-image cally-portrait-frame ${className}`}>
    {children}
    <span className="cally-frame-corner cally-frame-top-left" aria-hidden="true">✦</span>
    <span className="cally-frame-corner cally-frame-top-right" aria-hidden="true">☾</span>
    <span className="cally-frame-corner cally-frame-bottom-left" aria-hidden="true">♡</span>
    <span className="cally-frame-corner cally-frame-bottom-right" aria-hidden="true">⋈</span>
  </figure>;
}

export default function CallyPage() {
  return <div className="cally-page">
    <section className="cally-movement cally-princess"><div className="cally-shell cally-princess-layout">
      <div className="cally-princess-copy"><p className="eyebrow">The Princess</p><h1>And then there&apos;s Cally.</h1><p>Pretty things. Bows. Lipstick. Ridiculous amounts of pink.</p><p>Princess by choice.</p><p className="cally-emphasis"><strong>Filthy by reputation.</strong></p><p>There is rather more to her than that.</p></div>
      <CallyPortraitFrame className="cally-image-portrait"><Image src="/assets/callyHeroImage.png" alt="Cally in her Filthy Princess world" width={1024} height={1536} sizes="(max-width: 800px) min(100vw - 2rem, 620px), min(50vw, 680px)" priority /></CallyPortraitFrame>
    </div></section>

    <section className="cally-movement cally-boxes"><div className="cally-shell cally-boxes-layout">
      <div className="cally-boxes-copy"><p className="eyebrow">If we&apos;re choosing boxes</p><h2>I&apos;m Cally.</h2><p>Trans feminine. Non-binary, if we&apos;re choosing boxes.</p><p className="cally-emphasis"><strong>Futanari Princess, if we&apos;re choosing the fun ones.</strong></p><p>I like femininity unapologetically. Pretty things. Bows. Lipstick. Being spoiled. Being a Princess.</p><p>I like people even more.</p><p>Not categories of people.</p><p className="cally-emphasis"><strong>People.</strong></p><p>I&apos;m interested in what happens underneath all the labels we use to make each other easier to understand.</p></div>
      <CallyPortraitFrame className="cally-image-interior"><Image src="/assets/CallyInterior.png" alt="Cally at her dressing table" width={1024} height={1536} sizes="(max-width: 800px) min(100vw - 2rem, 620px), min(44vw, 620px)" /></CallyPortraitFrame>
    </div></section>

    <section className="cally-movement cally-inside"><div className="cally-shell cally-inside-layout">
      <div><p className="eyebrow">What&apos;s inside?</p><h2>Little pieces of my mind.</h2><p className="cally-intro">There are things I return to. Touch one and, eventually, I&apos;ll tell you why.</p></div><CallyDiscovery />
    </div></section>

    <section className="cally-movement cally-closer"><div className="cally-shell cally-text-column"><p className="eyebrow">Come a little closer</p><h2>I&apos;m not particularly good at being mysterious.</h2><div className="cally-confession"><p>If you come close enough, I&apos;ll overshare.</p><p>I wear my heart on my sleeve.</p><p>I flirt.</p><p>I cry.</p><p>I feel everything.</p><p>I love deeply.</p><p>I&apos;m extraordinarily curious.</p></div><p className="cally-emphasis"><strong>You don&apos;t have to be my type to matter to me.</strong></p><p>My curiosity knows very few boundaries.</p><p className="cally-emphasis"><strong>But I respect yours.</strong></p></div></section>

    <section className="cally-movement cally-distracting"><Image className="cally-distracting-background" src="/assets/picnicCally.png" alt="" fill sizes="100vw" /><div className="cally-distracting-shade" aria-hidden="true" /><div className="cally-shell cally-distracting-content"><p className="eyebrow">You&apos;re distracting me</p><div className="cally-scene"><p>I&apos;m trying to get ready.</p><p>We&apos;re supposed to be going on a picnic.</p><p><strong>You&apos;re supposed to be helping.</strong></p><p>Instead, you&apos;ve discovered I&apos;m terribly easy to distract when you make me feel a certain way.</p><p>I&apos;m trying to do my makeup.</p><p>You&apos;re testing me.</p><p>I&apos;m pretending you&apos;re not getting to me.</p><p>You absolutely are.</p><p><strong>We really do need to leave.</strong></p><p>…</p><p>Stop looking at me like that.</p><p><strong>You naughty person.</strong></p><p>Anyway.</p><p><strong>Picnic.</strong></p></div></div></section>

    <section className="cally-movement cally-curious"><div className="cally-shell cally-text-column"><p className="eyebrow">Now I&apos;m curious about you</p><h2>You&apos;ve been looking at me for quite a while now.</h2><p>You know what I call myself.</p><p>You&apos;ve seen some of the things I love.</p><p>I&apos;ve told you rather more than I intended to.</p><p>Typical.</p><p>But there&apos;s something slightly unfair about all of this.</p><p className="cally-emphasis"><strong>I don&apos;t know anything about you.</strong></p><div className="cally-questions"><p>What makes you curious?</p><p>What do you think about when nobody is listening?</p><p>What do you wish people would stop assuming about you?</p><p>What would you tell me if you knew I wasn&apos;t going to laugh?</p><p><strong>What are you really looking for?</strong></p></div><p className="cally-final-line"><strong>I wonder if you&apos;ll let me meet you.</strong></p></div></section>
  </div>;
}
