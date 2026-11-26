# Template patterns: a study of CSS Digital's work (2026-11-24)

**Reference only.** CSS Digital (Customer Service Solutions, Cristina and Horatiu Hot) show ten landing pages in the Work section of css-digital.com (`/p/*.html`). They are their designs, with made-up brands and AI images. The owner chose (2026-11-24) to **learn the structures and angles and design Lander's own templates in Figma**, not to import their pages. So this file describes what each kind of page *does*, section by section, and never their copy, images, names or visual design. Design every template fresh; when in doubt, change it.

Lander today has an advertorial (30-day wear test), a listicle (10 reasons) and a Top 5 ranking. The types `long_form` and `product_page` exist with no template.

## What all ten pages share

- **One page per angle, matched to where the click came from.** Each page names its traffic source: Google Search (the keyword in the headline), Google Shopping/PMax (the product card that was clicked), Discover (a curiosity headline), YouTube (the video's promise). Lander could tag each template with its source and temperature (cold: advertorial, listicle, quiz; warm: sales page, product page) and suggest one in New page ("Where is the traffic from?").
- **A bar on top** (sale or free shipping) and **a buy bar that stays on screen**: at the bottom with the product name, price, rating and Add to cart (sales and product pages), or a slim top bar with the brand and Shop (advertorials and listicles). Lander has a sticky shop bar; the bottom bar with price and rating is new.
- **Proof in numbers**: average rating, review count, customers or units sold, near the top and again before the last CTA.
- **A guarantee** stated near every CTA (money back, satisfaction nights, "keep the bottle").
- **An FAQ accordion** near the end (6–9 questions) that also handles objections and the guarantee.
- **A last offer block** that repeats the headline promise, the price or deal and the CTA.

## The six to design first

Slots below use the markup contract (`data-lp-*`, see the template-onboarding skill): prices and the promo bar follow the page's offer (B7.2), sale-only parts hide without one.

### 1. Sales page: search keyword match (`long_form`, warm/search)

A long single-product page whose headline repeats the search term the visitor typed.

| # | Section | Its job | Building blocks |
|---|---|---|---|
| 1 | Shipping bar, header | Trust before anything | Free-shipping line, logo, 3 anchor links |
| 2 | Hero | Say the keyword back, promise the result | Category kicker; H1 with the keyword; one-line mechanism; rating + review count; CTA; "what's in the set"; 3 trust ticks (e.g. dermatologist approved) |
| 3 | Proof in numbers | Settle doubt fast | 4 big numbers (rating, reviews, awards, guarantee); award logos |
| 4 | Visible results | Show it works | Before/after pairs (3) |
| 5 | Why it's different | Separate from the category | Short H2 + paragraph |
| 6 | How it works | Make it easy | 3 steps with images |
| 7 | The key ingredient / technology | The mechanism | Named complex, image, 2–3 lines |
| 8 | Three transformations | Benefits | 3 outcome tiles |
| 9 | Ingredient grid | Depth for the careful buyer | 6 ingredient cards (image, name, one line) |
| 10 | Made for you if… | Self-qualification | Checklist of 4–6 situations; reviews beside it; CTA |
| 11 | Product box | The buy decision | Title, rating, price, what's included, quantity, Add to cart |
| 12 | Reviews | Social proof | Review count headline, 3–6 reviews with stars |
| 13 | FAQ | Objections | 8 accordion items, guarantee inside |
| 14 | Final CTA | Close | Repeat promise, review, price, CTA, guarantee |
| — | Bottom buy bar | Always one tap from buying | Product, price, rating, Add to cart |

New for Lander: the before/after pairs, the ingredient grid, the "made for you if" checklist, the product box with quantity, the bottom buy bar with price.

### 2. Sales page: video match (`long_form`, warm/YouTube)

Picks up the promise of a video ad and proves it in the same order.

| # | Section | Its job | Building blocks |
|---|---|---|---|
| 1 | Guarantee bar, header | Lower the risk first | "N nights/days guarantee", logo, small nav |
| 2 | Hero | The video's promise in one line | H1; one-line why; CTA ("try it risk-free"); guarantee |
| 3 | Benefit cards | What you'll feel | 3–4 cards (icon, title, line), numbered |
| 4 | The story of the material/idea | Belief | Short essay section (90 words) |
| 5 | Not all X are the same | Separate from rivals | Comparison in prose or a small table |
| 6 | How it's made | Quality | 3 steps with images |
| 7 | Product box | Buy | Gallery, size/variant picker, deal (e.g. buy 1 get 1), price, small timer, Add to cart, guarantee |
| 8 | Reviews | Proof | Customers-count headline, reviews with stars |
| 9 | FAQ | Objections | Long, honest answers |
| — | Sticky top header + bottom buy bar | | Variant and price in the bar |

New for Lander: a variant picker (size/colour) in the product box; the deal line (B1G1) from the offer.

### 3. Advertorial: "the switch" (`advertorial`, cold/Discover)

"The thing you use isn't working? Here's what people switch to." Short (about 700 words), a comparison at its heart.

| # | Section | Its job | Building blocks |
|---|---|---|---|
| 1 | Slim header | Editorial feel | Logo, sticky |
| 2 | Hero | Name the frustration | H1 as a question; 2-line dek; "learn more" CTA; before/after; rating badge with review count |
| 3 | The problem with the usual fix | Why it fails | What it's recommended for (list); what it doesn't do (list with crosses) |
| 4 | Introducing the alternative | The new mechanism | Name, image, 2 lines |
| 5 | Alternative vs the usual | Make the case | Comparison table (4–6 rows, ticks/crosses) |
| 6 | Why people switch | Proof | Reviews with before/after, stars |
| 7 | Your next step | Offer | Risk-free try, CTA, guarantee (days) |
| 8 | FAQ | Objections | 6 accordion items |

New for Lander: the "vs the usual fix" table as the centre of an advertorial (we have a comparison table, not this angle); the problem list with crosses.

### 4. Advertorial: a parent's story (`advertorial`, cold/Discover)

A long first-person story (about 1,900 words) from a parent, with the product found halfway.

| # | Section | Its job | Building blocks |
|---|---|---|---|
| 1 | Sale bar with CTA | Offer for the impatient | Sale + guarantee line, "shop the routine" button |
| 2 | Kicker, H1, dek, byline | Credible article | Category kicker; question headline; one-line dek; author with a short bio line; updated date, read time; hero photo with caption |
| 3 | The problem at home | Empathy | Story paragraphs |
| 4 | Everything we tried first | Failed alternatives | Short story section |
| 5 | The label that stopped me | The trigger | Ingredient worry |
| 6 | Someone recommended it | The discovery | Product photos, stars, a starter routine box with price and CTA |
| 7 | Why it worked | Mechanism | Short points, a review |
| 8 | What happened / months later | Result | Story, photos, second CTA |
| 9 | The guarantee that sealed it | Risk | Guarantee in the parent's words |
| 10 | What other parents say | Proof | Reviews with photos |
| 11 | Questions I had | Objections | 6 accordion items in the author's voice |
| 12 | Going all in? | Upsell | The full kit: what's inside, saving, CTA |
| — | Bottom buy bar | | Kit name, price, guarantee |

New for Lander: a starter box mid-story and a bigger kit at the end (two products or two bundles: needs bundle offers, see below; until then one product with two CTAs); the author bio line.

### 5. Listicle: editorial premium (`listicle`, cold/Discover)

Seven reasons, quiet and editorial (serif type, soft colours), for an older, careful buyer.

| # | Section | Its job | Building blocks |
|---|---|---|---|
| 1 | Slim sticky top bar | Always shoppable | Product name, Shop |
| 2 | Kicker, H1, dek, byline | Article | "Hair health edit"-style kicker; "N reasons people are quietly switching to…" headline; dek; rating; editorial team byline |
| 3 | Hero image + 4 facts | Positioning | Product photo; 4 short "free from" facts |
| 4–10 | Reasons 1–7 | The case | Each: numbered H2 as a benefit, 80–100 words, an image or a review on some |
| 11 | Readers' words | Proof | 3 short reviews |
| 12 | The honest trial offer | Close | Trial length, what's included, price, CTA, guarantee |

Different from our 10-reasons: fewer, longer reasons; the trial framing of the offer; a calmer look. Worth designing as a second listicle style rather than a new type.

### 6. Listicle: loud sale with a vs table (`listicle`, cold/Discover)

Five reasons in big uppercase type, a sale everywhere, and a comparison against the alternative category.

| # | Section | Its job | Building blocks |
|---|---|---|---|
| 1 | Sale bar + sticky header | The deal first | Sale line, logo, Shop |
| 2 | Kicker, H1, rating | Hook | Uppercase headline "N reasons X beats Y"; rating with customer count; CTA; a free-gift line |
| 3 | Sale card | Offer up front | Up to N% off, 3 product facts |
| 4–8 | Reasons 1–5 | The case | Each: uppercase H2, image, 40–60 words, sometimes a review |
| 9 | How it works | Ease | 3–4 steps with images, CTA |
| 10 | X vs Y | The comparison | Table (5–7 rows) |
| 11 | Reviews | Proof | Review wall with stars, count |
| 12 | FAQ | Objections | 9 accordion items |
| 13 | Final sale CTA | Close | Sale headline, review, CTA, guarantee |

New for Lander: the sale card near the top driven by the offer (`data-lp-promo`, sale-only); the X-vs-Y table in a listicle.

## Later: what Lander needs first

- **Product page with bundles** (`product_page`, warm/Shopping): gallery, rating, price with "save N%", a bundle builder (1–4 items, rising discount), a scent/variant picker, subscribe & save vs one-time, ingredients, reviews, FAQ, "you may also like", bottom buy bar. Needs **bundle offers** (tiers by quantity, buy X get Y, subscribe & save) priced through Shopify cart links: an extension of B7's offers.
- **Collection page** (warm/Shopping): a promo hero, category chips, a product grid with quick add and swatches, a bundle-and-save tile. Needs **multi-product pages** (a page for a collection, not one product): a new type and new wizard steps.
- **Quiz** (`quiz_bridge`, cold/YouTube): a short assessment (questions, progress, a result that recommends the product). Needs a **quiz engine** (questions and result logic in the template, kept through export) and copy rules for questions.

## Suggested order

1. Sales page: search keyword match (fills `long_form`).
2. Advertorial: the switch.
3. Listicle: loud sale with a vs table.
4. Sales page: video match.
5. Advertorial: a parent's story.
6. Listicle: editorial premium.
7. Then bundle offers, which unlock the product page; the collection page and the quiz after.

Each template follows the template-onboarding skill (Figma handover, markup contract, instructions, smoke build, sign-off): about one build each.
