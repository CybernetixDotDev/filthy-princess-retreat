"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

const turnEase = [0.65, 0.05, 0.22, 1] as const;

export function ExperienceInvitation() {
  const [flipped, setFlipped] = useState(false);
  const reduceMotion = useReducedMotion();

  return <>
    <div className="experience-invitation-intro">
      <p className="eyebrow">Choose your way in.</p>
      <h2>Maybe you&apos;re looking for something.</h2>
      <p><strong>Maybe you think you&apos;ve already found it.</strong></p>
    </div>
    <div className="experience-invitation-scene">
      <motion.div
        className="experience-invitation"
        initial={false}
        animate={reduceMotion ? { rotateY: 0, scale: 1 } : { rotateY: flipped ? 180 : 0, scale: [1, 0.985, 1] }}
        transition={{
          rotateY: { duration: 1.05, ease: turnEase },
          scale: { duration: 1.05, ease: turnEase, times: [0, 0.5, 1] },
        }}
      >
        <article className="experience-invitation-face experience-invitation-front" aria-hidden={flipped}>
          <Image className="experience-card-art" src="/assets/awakening.png" alt="" fill sizes="(max-width: 540px) calc(100vw - 2rem), 420px" />
          <div className="experience-card-shade" aria-hidden="true" />
          <div className="experience-invitation-copy">
            <p className="eyebrow">Sexual Awakening &amp; Self Discovery</p>
            <h3>You are the centre.</h3>
            <div className="experience-invitation-body">
              <div className="experience-card-lines"><p>Your curiosity.</p><p>Your pleasure.</p><p>Your attention.</p></div>
              <p>Be pampered. Spoiled. Adored.</p>
              <p>We&apos;ll gently follow what pulls you—and see where it leads.</p>
              <p className="experience-invitation-emphasis"><strong>Come find what lives underneath the wanting.</strong></p>
            </div>
          </div>
          <motion.button className="experience-invitation-turn" type="button" onClick={() => setFlipped(true)} tabIndex={flipped ? -1 : 0} whileHover={reduceMotion ? undefined : { x: 3 }} transition={{ duration: 0.25, ease: "easeOut" }}>Unless you already know…</motion.button>
        </article>

        <article className="experience-invitation-face experience-invitation-back" aria-hidden={!flipped}>
          <Image className="experience-card-art" src="/assets/temptation.png" alt="" fill sizes="(max-width: 540px) calc(100vw - 2rem), 420px" />
          <div className="experience-card-shade experience-card-shade-back" aria-hidden="true" />
          <div className="experience-invitation-copy">
            <p className="eyebrow">Just Plain Filthy</p>
            <h3>You think you know what you want.</h3>
            <div className="experience-invitation-body">
              <div className="experience-card-lines"><p>A fantasy.</p><p>A temptation.</p><p>That thing you keep imagining.</p></div>
              <p>Here, you&apos;re allowed to say it.</p>
              <p>Explore it. Question it. Play with it.</p>
              <p>Because getting what you want and understanding <strong>why you want it</strong> aren&apos;t always the same thing.</p>
              <p className="experience-invitation-emphasis"><strong>Let&apos;s find out which one you&apos;re actually hungry for.</strong></p>
            </div>
          </div>
          <motion.button className="experience-invitation-turn" type="button" onClick={() => setFlipped(false)} tabIndex={flipped ? 0 : -1} whileHover={reduceMotion ? undefined : { x: -3 }} transition={{ duration: 0.25, ease: "easeOut" }}>Changed your mind?</motion.button>
        </article>
      </motion.div>
    </div>
    <div className="experience-invitation-after"><p>Still not sure which one you are?</p><strong>Good.</strong></div>
  </>;
}
