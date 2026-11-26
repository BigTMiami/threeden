// @ts-check
/**
 * page-meta.js — what a browser tab, a search engine, or a link preview
 * (iMessage, Instagram, Slack) shows for a public page: its title and a
 * one-line description, as <title>, <meta name="description"> and the Open
 * Graph tags (og:title, og:description).
 *
 *   setPageMeta({ title: 'Paper Lanterns at Alphaville · Thu, Nov 26', description: '…' })
 *   setPageMeta(null)   → back to the app's own title (main.js does this on every page change)
 *
 * Only public things get their own: a public event, a public group's page,
 * a blog, a link-in-bio page. (A real 3den would render these tags on the
 * server, since most link previews don't run JavaScript; Google does.)
 */

const DEFAULT_TITLE = '3den · Homepage editor prototype';
const DEFAULT_DESCRIPTION = 'Homepages for groups, households, bands, and organizers.';

function setMeta(attr, key, value) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.append(tag);
  }
  tag.setAttribute('content', value);
}

export function setPageMeta(meta) {
  const title = meta?.title ? `${meta.title} · 3den` : DEFAULT_TITLE;
  const description = meta?.description || DEFAULT_DESCRIPTION;
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', meta?.title ?? '3den');
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:type', meta ? 'website' : 'website');
  setMeta('name', 'twitter:card', 'summary');
}
