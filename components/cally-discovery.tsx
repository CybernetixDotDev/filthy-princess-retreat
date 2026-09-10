"use client";

import Image from "next/image";
import { useState } from "react";

const discoveries = [
  { image: "/assets/moonIcon.png", width: 1329, height: 1183, label: "The Moon", fragment: "I like things that change. Perhaps because I've changed so much myself. Becoming doesn't frighten me nearly as much as staying somewhere I've already outgrown." },
  { image: "/assets/heartIcon.png", width: 1312, height: 1199, label: "The Heart", fragment: "I feel things rather inconveniently deeply. I haven't found a sensible way to stop. I'm not entirely sure I want to." },
  { image: "/assets/LaceyHeart.png", width: 1536, height: 1024, label: "The Key", fragment: "Curiosity has opened more doors in my life than certainty ever did. Some of them probably should have stayed closed. Naturally, those were the interesting ones." },
  { image: "/assets/bowIcon.png", width: 1374, height: 1145, label: "The Bow", fragment: "Femininity matters to me. Softness doesn't mean weakness. Pretty doesn't mean frivolous. And yes, sometimes a bow really does make everything better." },
  { image: "/assets/cosmosIcon.png", width: 1310, height: 1200, label: "The Cosmos", fragment: "I borrow language from everywhere—science, spirituality, mythology, the stars—trying to describe things humans have always felt but never quite managed to name." },
  { image: "/assets/strawberryIcon.png", width: 1167, height: 1347, label: "The Strawberry", fragment: "Pleasure doesn't always need a profound explanation. Sometimes something is delicious because it's delicious. I think we forget that." },
] as const;

export function CallyDiscovery() {
  const [active, setActive] = useState<number | null>(null);
  const selected = active === null ? null : discoveries[active];

  return <div className="cally-discovery">
    <div className="cally-discovery-objects" aria-label="Pieces of Cally's mind">
      {discoveries.map((item, index) => <button key={item.label} type="button" className={active === index ? "active" : ""} aria-pressed={active === index} aria-controls="cally-discovery-fragment" onClick={() => setActive(index)}><Image className={`cally-discovery-icon ${item.label === "The Key" ? "cally-discovery-icon-key" : ""}`} src={item.image} alt="" width={item.width} height={item.height} sizes="(max-width: 540px) 34vw, 170px" /><small>{item.label}</small></button>)}
    </div>
    <div id="cally-discovery-fragment" className="cally-discovery-fragment" aria-live="polite">
      {selected ? <div key={selected.label} className="cally-discovery-thought"><p className="eyebrow">{selected.label}</p><p>{selected.fragment}</p></div> : <p>Choose something that catches your attention.</p>}
    </div>
  </div>;
}
