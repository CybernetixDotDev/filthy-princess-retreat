import Image from "next/image";
import { RetreatOffer } from "@/components/retreat-offer";
import type { RetreatFormat } from "@/lib/domain";

type Product = { id: string; name: string; positioning: string; allowed_formats: RetreatFormat[] };

function RetreatPhoto({
  src,
  alt,
  className = "",
  sizes = "(max-width: 760px) 100vw, 45vw",
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <figure className={`retreat-photo ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} />
    </figure>
  );
}

export function PublicRetreatPage({ products }: { products: Product[] }) {
  return (
    <article className="retreat-creative">
      <section className="retreat-story-hero" id="top" aria-labelledby="retreat-hero-title">
        <Image
          className="retreat-story-hero-image"
          src="/assets/MainBackground.png"
          alt="The South African retreat landscape"
          fill
          priority
          sizes="100vw"
        />
        <div className="retreat-story-hero-shade" />
        <div className="retreat-story-hero-copy">
          <p className="retreat-brand-mark">Filthy Princess</p>
          <p className="retreat-creative-eyebrow">Come to South Africa.</p>
          <h1 id="retreat-hero-title">Run away with me.</h1>
          <p className="retreat-story-hero-support">
            You&apos;ve been curious long enough. Come spend three nights somewhere your Filthy Princess doesn&apos;t have to stay inside your head. Let&apos;s see what happens when you let her out. ♡
          </p>
          <p className="retreat-story-hero-proposition">Three nights with Cally.</p>
          <p className="retreat-hand retreat-story-hero-aside">you probably shouldn&apos;t. ♡</p>
          <a className="retreat-story-scroll" href="#nights">come with me ↓</a>
        </div>
      </section>

      <section className="retreat-story-intro" id="nights" aria-labelledby="retreat-nights-title">
        <div className="retreat-intro-copy">
          <h2 id="retreat-nights-title">COME SPEND THREE NIGHTS WITH CALLY.</h2>
          <p>You&apos;ve asked questions.<br />Followed curiosities.</p>
          <p>Maybe discovered things about yourself you expected.<br />Maybe a few you didn&apos;t.</p>
          <p>Now forget about becoming anything for a while.<br />Come somewhere you can simply be.</p>
          <p>Three nights to be spoiled.<br />Pampered.<br />Fed ridiculously well.<br />Played with.<br />Surprised.<br />Left alone when you want to be.</p>
          <p>And given plenty of opportunities to discover what your particular kind of filthy feels like outside your imagination.</p>
          <p className="retreat-copy-emphasis">No performance.<br />No exam.<br />No graduation.</p>
          <p className="retreat-copy-emphasis">Just curiosity with somewhere to go.</p>
          <div className="retreat-itinerary-vandalism">
            <p className="retreat-hand">there is absolutely no itinerary. ♡</p>
            <p className="retreat-hand"><s>okay there is.</s></p>
            <p>I just refuse to show it to you.</p>
          </div>
        </div>
        <RetreatPhoto
          src="/assets/retreat/Cally_Retreat_image_14.jpeg"
          alt="Cally and guests sharing drinks on a terrace overlooking the landscape at sunset"
          className="retreat-intro-photo"
        />
      </section>

      <section className="retreat-story-massage" aria-labelledby="retreat-massage-title">
        <div className="retreat-massage-image-wrap">
          <Image
            className="retreat-massage-image"
            src="/assets/massageRoom.png"
            alt="The private massage room"
            width={1200}
            height={850}
            sizes="(max-width: 760px) 100vw, 52vw"
          />
        </div>
        <div className="retreat-massage-copy">
          <p className="retreat-creative-eyebrow">Pampering</p>
          <h2 id="retreat-massage-title">LET ME GET MY HANDS ON YOU.</h2>
          <p className="retreat-massage-lead">When I said you could stop doing the work, I meant it.</p>
          <p className="retreat-massage-pressure">Hard.<br />Deep.<br />Energetic.</p>
          <p className="retreat-massage-sensory">Warm oil.<br />Tired shoulders.<br />Every stubborn little knot I&apos;ve decided needs my attention.</p>
          <p className="retreat-massage-slow">and then...</p>
          <p className="retreat-massage-pause">stop.</p>
          <p className="retreat-massage-pause">let that breath out.</p>
          <p className="retreat-massage-release">uhhhh.</p>
          <p className="retreat-massage-still">You don&apos;t need to discover anything right now.<br />Just lie there.</p>
          <p className="retreat-hand retreat-massage-cally">I&apos;ll take care of you. ♡</p>
          <p className="retreat-massage-sting">A little unconventional.<br />A lot of filthy. ♡</p>
        </div>
      </section>

      <div className="retreat-day-night">
        <section className="retreat-story-day" aria-labelledby="retreat-day-title">
          <div className="retreat-day-copy">
            <h2 id="retreat-day-title">WHAT DOES YOUR FILTH LOOK LIKE IN DAYLIGHT?</h2>
            <p>Maybe we disappear into the forest.<br />Walk barefoot along the beach.<br />Find a river.<br />Swim naked if that happens to be your kind of afternoon.<br />Lie beside the pool until somebody gets hungry.</p>
            <p>Maybe I&apos;ll put something strange and delicious in front of you just because I want to see your face when you taste it.</p>
            <p>Maybe you wear something you&apos;ve never quite had the nerve to wear.<br />Maybe you say something you&apos;ve never quite had the nerve to say.</p>
            <p>Maybe we laugh so hard at something completely inappropriate that we forget we were supposed to be discovering ourselves.</p>
            <p>Maybe we go somewhere.<br />Maybe we don&apos;t.</p>
          </div>
          <div className="retreat-day-gallery" aria-label="Daylight at the Retreat">
            <RetreatPhoto src="/assets/retreat/Cally_Retreat_image_12.jpeg" alt="Golden sunlight over a forest valley and rocky stream" className="retreat-day-forest" sizes="(max-width: 760px) 100vw, 1120px" />
            <RetreatPhoto src="/assets/retreat/Cally_Retreat_image_13.jpeg" alt="A secluded beach at sunset, with sunglasses and pink fabric on the rocks" className="retreat-day-beach" sizes="(max-width: 760px) 50vw, 560px" />
            <RetreatPhoto src="/assets/retreat/Cally_Retreat_image_11.jpeg" alt="Cally enjoying golden afternoon light in the river" className="retreat-day-river" sizes="(max-width: 760px) 50vw, 560px" />
            <RetreatPhoto src="/assets/retreat/Cally_Retreat_image_9.jpeg" alt="Cally relaxing on a pink towel beside the pool" className="retreat-day-pool" sizes="(max-width: 760px) 50vw, 560px" />
            <RetreatPhoto src="/assets/retreat/Cally_Retreat_image_10.jpeg" alt="Small sensory plates with an oyster, figs, and rich sauces" className="retreat-day-plates" sizes="(max-width: 760px) 50vw, 560px" />
          </div>
          <div className="retreat-do-nothing">
            <h2>SOMETIMES WE DO ABSOLUTELY NOTHING.</h2>
            <p>Because your Filthy Princess doesn&apos;t need to become a better version of you either.</p>
            <p>Sometimes she just wants another coffee.</p>
            <p className="retreat-copy-emphasis">There is nowhere you need to be.</p>
          </div>
        </section>

        <section className="retreat-story-sunset" aria-labelledby="retreat-sunset-title">
          <Image
            className="retreat-sunset-image"
            src="/assets/4bonnieHero.png"
            alt="Firelight at the retreat as evening arrives"
            fill
            sizes="(max-width: 760px) 100vw, 76vw"
          />
          <div className="retreat-sunset-shade" />
          <div className="retreat-sunset-copy">
            <h2 id="retreat-sunset-title">AND THEN IT GETS DARK.</h2>
            <p>You&apos;ve met your Filthy Princess in daylight.<br />Let&apos;s see what she does after dark.</p>
            <p className="retreat-hand">I&apos;ll light the fire.</p>
          </div>
        </section>
      </div>

      <section className="retreat-story-feast" aria-labelledby="retreat-feast-title">
        <div className="retreat-feast-copy">
          <p className="retreat-creative-eyebrow">Dinner with Cally</p>
          <h2 id="retreat-feast-title">The Filthy Feast.</h2>
          <p className="retreat-feast-lead">I hope you&apos;re hungry.</p>
          <p>When I cook for you, we&apos;re not doing tiny portions and polite little plates.</p>
          <p>There&apos;s fire.<br />Smoke.<br />Butter.<br />Chutney.<br />Meat cooked slowly until it barely needs convincing.</p>
          <p>Things dripping.<br />Things you tear apart.<br />Something saucy you weren&apos;t expecting.<br />Something sweet even though you&apos;ve already eaten far too much.</p>
          <p className="retreat-feast-texture">Juicy.<br />Saucy.<br />Messy.<br />Delicious.</p>
          <p>You&apos;ve spent enough time thinking about what filth means.</p>
          <p className="retreat-copy-emphasis">EAT SOME.</p>
          <div className="retreat-feast-vandalism">
            <p>Napkins are provided.</p>
            <p className="retreat-hand"><s>or you can lick your fingers. I won&apos;t judge.</s></p>
            <p className="retreat-hand">or I could. ♡</p>
          </div>
        </div>
        <figure className="retreat-feast-image">
          <Image
            src="/assets/juicySteak.png"
            alt="Juicy steak cooked over an open fire"
            fill
            sizes="(max-width: 760px) 100vw, 52vw"
          />
        </figure>
      </section>

      <section className="retreat-story-after-dinner" aria-labelledby="retreat-after-dinner-title">
        <RetreatPhoto
          src="/assets/retreat/Cally_Retreat_image_7.jpeg"
          alt="A whisky glass with a lipstick mark beside a glowing fire"
          className="retreat-after-dinner-backdrop"
          sizes="100vw"
        />
        <div className="retreat-after-dinner-copy">
          <h2 id="retreat-after-dinner-title">DON&apos;T GO TO BED YET.</h2>
          <p>The plates disappear.<br />The fire gets lower.<br />The whisky comes out.</p>
          <h2 className="retreat-after-dinner-second">A LITTLE LESS POLITE.</h2>
          <p>And somewhere around here, people tend to become a little less interested in saying the correct thing.</p>
          <p>You&apos;ve spent enough of your life knowing what you&apos;re supposed to say.<br />Tonight I&apos;m much more interested in what you&apos;re curious enough to say.</p>
          <p className="retreat-hand retreat-after-dinner-question">Tell me something you probably shouldn&apos;t.</p>
        </div>
      </section>

      <section className="retreat-story-play" aria-labelledby="retreat-play-title">
        <div className="retreat-play-copy">
          <h2 id="retreat-play-title">OH, WE&apos;RE GOING TO PLAY.</h2>
          <p>Not everything you discover about yourself needs a breakthrough attached to it.</p>
          <p>Some things are worth doing for the extremely sophisticated reason that...</p>
          <p className="retreat-hand retreat-play-mostly">they&apos;re fun.</p>
          <div className="retreat-play-fragments">
            <p>Princess when it suits me.</p>
            <p>Filthy when it doesn&apos;t.</p>
            <p>Sinful occasionally.</p>
            <p>Playful almost always.</p>
          </div>
          <div className="retreat-play-vandalism">
            <p className="retreat-play-identity">Filthy <s>Princess</s></p>
            <p className="retreat-hand retreat-play-replacement">Futanari Princess ♡</p>
          </div>
          <p className="retreat-play-meow">meow.</p>
        </div>
        <div className="retreat-play-images">
          <RetreatPhoto
            src="/assets/retreat/Cally_Retreat_image_4.jpeg"
            alt="Cally seated in a rain-soaked garden, surrounded by warm lantern light"
            className="retreat-play-photo retreat-play-photo-first"
            sizes="(max-width: 760px) 50vw, 320px"
          />
          <RetreatPhoto
            src="/assets/retreat/Cally_Retreat_image_5.jpeg"
            alt="Cally raising a glass among pink velvet cushions on a sunlit terrace"
            className="retreat-play-photo retreat-play-photo-second"
            sizes="(max-width: 760px) 50vw, 320px"
          />
        </div>
      </section>

      <section className="retreat-story-host" aria-labelledby="retreat-host-title">
        <RetreatPhoto
          src="/assets/retreat/Cally_Retreat_image_3.jpeg"
          alt="Cally looking directly at you in a candlelit room with flowers and deep pink velvet"
          className="retreat-host-photo"
        />
        <div className="retreat-host-copy">
          <h2 id="retreat-host-title">HI. I&apos;M CALLY.</h2>
          <p>I&apos;ve asked myself the same question I&apos;ve been asking you.<br />WHAT IS FILTH?</p>
          <p>I have some answers.<br />I&apos;m sure I&apos;ll find some more.<br />And I have a suspicion yours won&apos;t look exactly like mine.</p>
          <p>Good.<br />I&apos;m not here to tell you who your Filthy Princess is.</p>
          <p>I&apos;m here to cook for her.<br />Spoil her.<br />Make her laugh.<br />Give her somewhere beautiful to exist.</p>
          <p>And occasionally...<br />encourage her into a little trouble.</p>
          <p className="retreat-hand">Curious?<br />So am I. ♡</p>
        </div>
      </section>

      <section className="retreat-story-morning" aria-labelledby="retreat-morning-title">
        <RetreatPhoto
          src="/assets/retreat/Cally_Retreat_image_2.jpeg"
          alt="Cally resting with a cup of coffee beside breakfast on a warm morning terrace"
          className="retreat-morning-photo"
          sizes="100vw"
        />
        <div className="retreat-morning-copy">
          <p className="retreat-creative-eyebrow">Morning</p>
          <h2 id="retreat-morning-title">SOMETIMES...</h2>
          <h2>WE REALLY DO NOTHING.</h2>
          <p>No exercise.<br />No breakthrough.<br />No reflection prompt waiting beside your coffee.<br />No requirement to tell everyone what you&apos;ve learned about yourself.</p>
          <p>Maybe something changed.<br />Maybe nothing did.<br />Maybe you simply had three fucking wonderful nights.</p>
          <p>That&apos;s allowed too. ♡</p>
        </div>
      </section>

      <section className="retreat-story-offer" id="offer" aria-labelledby="retreat-offer-title">
        <div className="retreat-offer-intro">
          <h2 id="retreat-offer-title">WANT TO DO THAT FOR REAL?</h2>
          <p>Come spend three private nights inside the Filthy Princess world.</p>
        </div>
        <div className="retreat-inclusions">
          <h3>Included</h3>
          <ul>
            <li>Beautiful private accommodation</li>
            <li>Food and drinks, including the Filthy Feast</li>
            <li>Pampering and massage</li>
            <li>Daytime adventures, indulgences and plenty of doing nothing</li>
            <li>Filthy Princess evenings</li>
            <li>Privacy</li>
            <li>Surprises</li>
            <li>Cally personally hosting your retreat</li>
          </ul>
        </div>
        <RetreatOffer products={products} />
      </section>

      <section className="retreat-story-not-ready" aria-labelledby="retreat-not-ready-title">
        <RetreatPhoto
          src="/assets/retreat/Cally_Retreat_image_1.jpeg"
          alt="A quiet portrait of Cally seated against deep pink velvet"
          className="retreat-not-ready-photo"
        />
        <div className="retreat-not-ready-copy">
          <h2 id="retreat-not-ready-title">not ready?</h2>
          <p>you don&apos;t have to leave. ♡</p>
          <a href="/inner-sanctum">Enter the Inner Sanctum →</a>
        </div>
      </section>
    </article>
  );
}
