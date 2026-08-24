# Wheel language guidelines

For the website, the docs, and anything else with wheel's name on it.

**Motto: Stop reinventing the wheel.**

**Language: simple. Always simple.** If a sentence needs a second read, it is not done.

## The rules

1. **Concrete before abstract.** Show the code or the behavior first, then name the
   idea. "Mutate a snapshot and it throws" beats "immutability is enforced at the
   write site." If a claim has a two-line snippet, lead with the snippet.
2. **One idea per sentence.** Two ideas get two sentences. No sentence needs a
   parenthetical to survive.
3. **Say the thing, then stop.** Cut the wind-up ("It's worth noting that…"), the
   recap, and the sign-off. A section ends when its argument is finished.
4. **Claims are specific or they're cut.** "Whole-row deltas, server-authoritative,
   no CRDTs" is a claim. "Blazing fast, developer-first, best-in-class" is filler.
   No superlatives, no marketing adjectives, no exclamation points beyond one per page.
5. **Say what wheel does not do.** The tradeoffs section is the credibility section.
   Every omission gets a reason in the same breath, in public.

## Where the words live

- Home page: `packages/website/src/home.mdx` — every word, including the section
  labels and the button text. Layout components in `src/sections/` hold no copy.
- Docs pages: `content/docs/*.mdx`.
- Page title and meta description: the frontmatter of `home.mdx`, mirrored by hand
  into `packages/website/index.html`.

Tests assert structure (`data-testid`, section ids), never sentences. Rewriting copy
should never turn the suite red.
