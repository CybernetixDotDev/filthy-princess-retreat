import Link from "next/link";

export default function HomePage() {
	return <main className="home-story">
		<section className="home-beat home-hero" aria-labelledby="home-title">
			<div className="home-image-placeholder home-hero-image"><span>Hero image</span></div>
			<div className="home-hero-shade" aria-hidden="true" />
			<div className="home-shell home-hero-copy">
				<p className="home-kicker">Chapter I</p>
				<h1 id="home-title">Filthy Princess</h1>
				<p>You probably shouldn&apos;t be this curious.</p>
				<a className="home-scroll" href="#not-right">go on then ↓</a>
			</div>
		</section>

		<section id="not-right" className="home-beat home-disruption">
			<div className="home-shell home-split">
				<div className="home-image-placeholder home-detail-image"><span>Detail / evidence image</span></div>
				<div className="home-statement">
					<p>It looks like one kind of story.</p>
					<p className="home-turn">It isn&apos;t.</p>
				</div>
			</div>
		</section>

		<section className="home-beat home-provocation">
			<div className="home-shell home-text-column">
				<p>Funny thing about curiosity.</p>
				<p>It usually tells on you.</p>
				<div className="home-fragment">
					<p>The things that make you look twice.</p>
					<p>The things you pretend don&apos;t.</p>
					<p>The little thought you probably shouldn&apos;t have had.</p>
				</div>
				<p className="home-first-voice">I like those.</p>
			</div>
		</section>

		<section className="home-beat home-evidence">
			<div className="home-shell home-split home-split-reverse">
				<div className="home-human-copy">
					<p>Sorry about the mess.</p>
					<p>I wasn&apos;t expecting you quite yet.</p>
				</div>
				<div className="home-image-placeholder home-evidence-image"><span>Evidence of someone</span></div>
			</div>
		</section>

		<section className="home-beat home-reveal">
			<div className="home-shell home-text-column">
				<p className="home-simple">Filthy is easy.</p>
				<p>The interesting part is what happens<br />when you stop pretending you aren&apos;t curious.</p>
				<div className="home-about">
					<p>About me.</p>
					<p>About this.</p>
					<p>About yourself.</p>
				</div>
			</div>
		</section>

		<section className="home-beat home-cally-reveal">
			<div className="home-shell home-cally-layout">
				<div className="home-image-placeholder home-cally-image"><span>Cally reveal image</span></div>
				<div className="home-cally-copy">
					<h2>And then there&apos;s Cally.</h2>
					<p>Princess.<br />Trouble-maker.<br />Terribly curious about people.</p>
					<p>And apparently the woman behind all of this.</p>
					<p>You found my little corner of the world.</p>
					<p>You may as well meet me.</p>
					<Link className="home-cally-link" href="/cally">Meet Cally →</Link>
				</div>
			</div>
		</section>
	</main>;
}
