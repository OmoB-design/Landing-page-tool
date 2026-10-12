import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { PersonMark } from "@/components/app/mark";

/**
 * Home's greeting (Figma: Home 17:978 and Home Dark 38:2392): a 40 px mark and a 30 px serif
 * "Welcome, <first name>", 8 px in from the cards; 64 px below, three 285 px getting-started
 * cards, 16 px apart. Each card has a 207 px textured painting with a drawing of a page and the
 * step in 13 px below. (A done state is to come from the owner's design.)
 */
export function Welcome({ name }: { name: string }) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <section
      aria-labelledby="welcome-title"
      className="mx-auto flex w-full max-w-home-card flex-col gap-2 md:max-w-home-row"
    >
      <div className="flex flex-col gap-5 px-2 pb-14">
        <span className="flex h-14.5 w-12.5 items-center justify-center">
          <PersonMark name={name} className="size-10 font-sans text-type-h5" />
        </span>
        <h1
          id="welcome-title"
          className="font-serif text-type-h4 font-medium text-button-secondary-text"
        >
          Welcome, {first}
        </h1>
      </div>
      <ul role="list" className="grid gap-4 md:grid-cols-3">
        <WelcomeCard
          href="/brands/new"
          image="/home/add-brand.png"
          lead="Add a brand."
          rest="Paste your store’s address and we read its colours, fonts, voice and products."
          texture={{ id: "home-texture-brand", radius: 14 }}
          drawing={<FloatingWindow />}
        />
        <WelcomeCard
          href="/templates"
          image="/home/pick-template.png"
          lead="Pick a template."
          rest="Start from a proven page in the library, then rearrange its sections."
          texture={{ id: "home-texture-template", radius: 15 }}
          drawing={<FramedWindow />}
        />
        <WelcomeCard
          href="/pages/new"
          image="/home/create-page.png"
          lead="Create a page."
          rest="Choose a product and who it’s for. It builds in the background, ready to review."
          texture={{ id: "home-texture-page", radius: 14 }}
          drawing={<FramedWindow />}
        />
      </ul>
    </section>
  );
}

/**
 * A getting-started card (Figma: Follow Button Container): 18 px corners, the frame edge, the
 * painting with its page drawing, and the step 10 px in with 32 px below. On hover the border
 * deepens, as on Quality's Home cards (Border-divider → Border-input-hover); nothing moves.
 */
function WelcomeCard({
  href,
  image,
  lead,
  rest,
  texture,
  drawing,
}: {
  href: string;
  image: string;
  lead: string;
  rest: string;
  texture: { id: string; radius: number };
  drawing: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group relative flex h-full flex-col overflow-hidden rounded-card bg-surface-primary outline-none edge hover:edge-strong focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div aria-hidden className="relative h-51.75 shrink-0 overflow-hidden">
          <TextureFilter {...texture} />
          {/* The plain painting under the textured one fills the specks the texture pulls in
              from past the edge, so the edges stay clean as in Figma. */}
          <Image
            src={image}
            alt=""
            fill
            preload
            sizes="(min-width: 768px) 285px, 100vw"
            className="object-cover"
          />
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 768px) 285px, 100vw"
            className="object-cover"
            // An SVG filter reference (Figma's Texture effect), not a style value.
            style={{ filter: `url(#${texture.id})` }}
          />
          {drawing}
        </div>
        {/* Figma's first line sits 3 px lower than its 10 px padding (a taller line box). */}
        <p className="px-2.5 pt-3.25 pb-8 text-type-body-small text-sub-text">
          <span className="font-medium text-heading-01">{lead}</span> {rest}
        </p>
      </Link>
    </li>
  );
}

/**
 * Figma's Texture effect (grain 2.5, radius 14 or 15, clipped to the shape) as an SVG filter:
 * noise moves each pixel a few px, for a frosted, painterly grain. Frequency and strength were
 * tuned by eye against Figma's render of the paintings.
 */
function TextureFilter({ id, radius }: { id: string; radius: number }) {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <filter
        id={id}
        x="0"
        y="0"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.6"
          numOctaves={1}
          seed={3}
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale={radius * 0.75}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}

// ── Page drawings (Figma: the windows over each painting; light in both themes) ──────────

/** A two-line placeholder: a short darker line 12 px above a longer light one. */
function Lines() {
  return (
    <>
      <span className="absolute top-0 left-0 h-1.5 w-15.5 rounded-full bg-illustration-line-strong" />
      <span className="absolute top-3 left-0 h-1.5 w-33 rounded-full bg-illustration-line" />
    </>
  );
}

/** Add a brand: a large window coming in from the right, cut off by the card. */
function FloatingWindow() {
  return (
    <div
      className={`absolute top-6.75 left-6 h-49.5 w-74.75 rounded-sm rounded-tl-lg bg-illustration-surface shadow-illustration-float`}
    >
      <div className="absolute top-28 left-21">
        <Lines />
      </div>
    </div>
  );
}

/** Pick a template and Create a page: a framed window inside the painting. */
function FramedWindow() {
  return (
    <div
      className={`absolute top-7 left-6 h-38.25 w-59.25 rounded-sm bg-illustration-surface shadow-illustration-window`}
    >
      <div className="absolute top-22.5 left-13.25">
        <Lines />
      </div>
    </div>
  );
}
