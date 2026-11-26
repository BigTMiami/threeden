// @ts-check
/**
 * blogs.js — everyone's public blog, and the likes and comments on them.
 *
 * Leo, Jamal, Grace and Priya have written on theirs, each with a
 * different kind of feed: Leo a General feed (posts with a photo, a file
 * from his vault, an event), Jamal and Grace Photo & video feeds, Priya a
 * Text feed. Everyone else has the starter blog a new account gets.
 * (Owen turned blogs off, so his stays hidden: see canViewSpace in
 * js/state/store.js.)
 */

import { daysFromToday, hoursAgo, nextWeekday } from './helpers.js';
import { PEOPLE } from './people.js';
import { demoPhoto, mixedShape } from '../demo-photos.js';
import { createStarterBlog } from '../starters.js';

// People post a mix of upright, square, and wide photos: unless a shape is given, the photo's id picks one.
const photo = (id, scene, caption, shape = mixedShape(id)) => ({ id, kind: 'image', src: demoPhoto(scene, shape), caption });

/** A post in a blog feed module (see js/modules/blog-feeds/feed-data.js). */
const feedPost = (id, authorId, hours, text, fields = {}) => ({ id, authorId, createdAt: hoursAgo(hours), editedAt: null, text, media: [], attachments: [], ...fields });

/** A public event on someone's own blog. */
function blogEvent(id, ownerId, title, date, time, endTime, location, notes, rsvps, fields = {}) {
  return {
    id, title, date, allDay: false, time, endTime, location, notes, color: 'purple', createdBy: ownerId,
    visibility: 'public', capacity: null, repeat: 'none', inviteeIds: [], rsvps,
    attendeeIds: Object.keys(rsvps).filter((memberId) => rsvps[memberId] === 'going'), createdAt: hoursAgo(40), ...fields,
  };
}

export function createDemoBlogs() {
  const leo = {
    id: 'blog-m-leo', kind: 'blog', name: 'Leo’s blog',
    description: 'Urban policy student. Bikes, housing, and guitar on the porch.',
    memberIds: ['m-leo'],
    appearance: { cover: { kind: 'preset', preset: 'harbor', focus: 50, height: 'short' } },
    modules: [
      // About (js/modules/blog/about-module.js)
      {
        id: 'leo-about', type: 'about', title: 'About', span: 4, rows: 10,
        data: {
          headline: '',
          text: 'I fix bikes at the Saturday pantry, play guitar in Porch Lights, and write about how our neighborhood gets built. #bikerepair',
          askMeAbout: ['bike repair', 'zoning', 'pedalboards'],
          links: [{ label: 'Porch Lights demos', url: 'https://example.org/porchlights' }],
          showGroups: true,
        },
      },
      {
        id: 'leo-feed', type: 'generalfeed', title: 'Posts', span: 8, rows: 18,
        data: {
          events: [],
          posts: [
            feedPost('leo-fp-1', 'm-leo', 5, 'Practice run for Thanksgiving. Aunt Ingrid, the pecan pie is handled 🥧', { media: [photo('leo-m-1', 'pie', 'Pecan pie, attempt one')] }),
            feedPost('leo-fp-2', 'm-leo', 26, 'Fixing bikes at the Saturday pantry again. Bring yours by! #bikerepair #mutualaid', { attachments: [{ kind: 'event', eventId: 'leo-ev-1' }] }),
            feedPost('leo-fp-3', 'm-leo', 70, 'Finally drew up plans for my pedalboard. Anyone have a spare patch cable?', {
              // One post can carry several things: a file from the vault, a photo and a link.
              media: [photo('leo-m-5', 'bike', 'The current mess')],
              attachments: [
                { kind: 'file', item: { id: 'leo-fp-3-file', kind: 'note', name: 'Pedalboard plans', html: '<h3>Pedalboard</h3><p>18 in × 12 in plank, angled. Velcro strips.</p><ul><li>Tuner, then overdrive</li><li>Delay last</li></ul>' } },
                { kind: 'link', url: 'https://example.org/strings', name: 'The strings I use (example link)' },
              ],
            }),
            feedPost('leo-fp-4', 'm-leo', 120, 'First rehearsal outside with Porch Lights. The neighbors clapped (I think sincerely).', { media: [photo('leo-m-2', 'porch', 'On Jamal’s porch'), photo('leo-m-3', 'leaves', 'Juniper Lane in October', 'tall')] }),
          ],
        },
      },
      {
        id: 'leo-blog-events', type: 'events', title: 'Where I’ll be', span: 4, rows: 18,
        data: {
          ownEvents: true,
          events: [
            blogEvent('leo-ev-1', 'm-leo', 'Free bike repair at the pantry', daysFromToday(8), '10:00', '13:00', 'Eastside Library parking lot', 'Flat fixes and brake adjustments while you shop. Bring your bike, I bring the tools.', { 'm-leo': 'going', 'm-theo': 'going', 'm-grace': 'maybe' }, { color: 'blue', cover: { kind: 'image', image: demoPhoto('bike', 'panorama'), focus: 50 } }),
          ],
        },
      },
      {
        id: 'leo-blog-post', type: 'note', title: 'Long read', span: 12, rows: 14,
        data: {
          title: 'Why I joined the tenants union',
          html: '<p>Last January our apartment hit 58°F. I emailed the management company four times. Nothing happened until sixty of us signed the same letter.</p><h3>One complaint is a nuisance. A hundred is a meeting.</h3><p>The city logs every heat complaint. When they all come from the same four buildings in the same week, people with the power to fix it start returning calls.</p><h3>What’s next</h3><ul><li>The union meets Crestline’s regional manager next month.</li><li>We’re keeping a daily heat log: if you live on Juniper, add yours.</li><li>Come to the know your rights workshop at the library.</li></ul>',
          updatedAt: hoursAgo(30),
        },
      },
    ],
  };

  const jamal = {
    id: 'blog-m-jamal', kind: 'blog', name: 'Jamal Brooks · songs',
    description: 'I write songs and sing them with Porch Lights. Gigs, demos, and the stories behind them.',
    memberIds: ['m-jamal'],
    // A theme for his blog (Settings → Appearance → Theme), with his own cover on top.
    appearance: { cover: { kind: 'preset', preset: 'night', focus: 50, height: 'short' } },
    modules: [
      {
        id: 'jamal-about', type: 'about', title: 'About', span: 4, rows: 9,
        data: { headline: 'Songs, porches, and the occasional banjo.', text: 'I host the Tuesday open mic at the Backroom. Bring a song you finished this week, even a rough one. #openmic', askMeAbout: ['songwriting', 'open mics', 'banjo'], links: [] },
      },
      {
        id: 'jamal-photos', type: 'generalfeed', title: 'Photos', span: 8, rows: 18,
        data: {
          events: [],
          posts: [
            feedPost('jamal-fp-1', 'm-jamal', 12, 'Walking home after the open mic. Good crowd tonight.', { media: [photo('jamal-m-1', 'skyline', 'Walking home')] }),
            feedPost('jamal-fp-2', 'm-jamal', 40, 'Backroom open mic: three new songwriters, one kazoo. #openmic', { media: [photo('jamal-m-2', 'stage', 'Open mic at the Backroom')] }),
            feedPost('jamal-fp-3', 'm-jamal', 70, 'Porch Lights, porch edition. Recording starts in two weeks!', { media: [photo('jamal-m-3', 'porch', 'The band'), photo('jamal-m-4', 'choir', 'Harmony practice', 'square'), photo('jamal-m-5', 'skyline', 'Walking to Jamal’s', 'tall')] }),
          ],
        },
      },
      {
        id: 'jamal-blog-gigs', type: 'events', title: 'Upcoming shows', span: 4, rows: 18,
        data: {
          ownEvents: true,
          events: [
            blogEvent('jamal-gig-1', 'm-jamal', 'Solo set at the Eastside Café', daysFromToday(5), '20:00', '21:30', 'Eastside Café, 112 River St', 'New songs, old songs, and probably the radiator one. No cover; tip the barista.', { 'm-jamal': 'going', 'm-leo': 'going', 'm-iris': 'maybe' }, { capacity: 45, cover: { kind: 'image', image: demoPhoto('skyline', 'panorama'), focus: 70 } }),
            blogEvent('jamal-gig-2', 'm-jamal', 'Open mic night (hosting)', nextWeekday(2), '19:00', '22:00', 'The Backroom, 9 Mill St', 'Sign-up sheet opens at 6:30. All ages.', { 'm-jamal': 'going' }, { repeat: 'weekly', cover: { kind: 'preset', preset: 'night' } }),
          ],
        },
      },
      {
        id: 'jamal-blog-about', type: 'note', title: 'About', span: 12, rows: 7,
        data: { title: 'About the band', html: '<p>Porch Lights started on my front porch during a power outage: four neighbors, two guitars, no amps. We’re recording our first EP this winter. Want us at your block party? Message me on 3den.</p>', updatedAt: hoursAgo(200) },
      },
    ],
  };

  const grace = {
    id: 'blog-m-grace', kind: 'blog', name: 'Grace’s pantry notes',
    description: 'Notes from the Saturday pantry: what we gave out, what we need, and who showed up.',
    memberIds: ['m-grace'],
    appearance: { font: 'friendly', accent: '#14866d', background: 'mint', cover: {}, cards: 'bordered', corners: 'rounded' },
    modules: [
      {
        id: 'grace-photos', type: 'generalfeed', title: 'Saturdays', span: 12, rows: 18,
        data: {
          events: [],
          posts: [
            feedPost('grace-fp-1', 'm-grace', 14, '86 households last Saturday, our biggest yet. We ran out of rice by 11:30. Thanks @leo for fixing six bikes in the lot while people waited! #mutualaid', { media: [photo('grace-m-1', 'pantry', 'Setting up at 9:15')] }),
            feedPost('grace-fp-2', 'm-grace', 90, 'The orchard on Route 9 sent two boxes of apples and the last tomatoes of the year.', { media: [photo('grace-m-2', 'tomatoes', 'Donated tomatoes'), photo('grace-m-4', 'feast', 'Apple crisp from the leftovers', 'tall'), photo('grace-m-5', 'seeds', 'Sorting by hand', 'square'), photo('grace-m-6', 'pantry', 'The whole haul', 'panorama')] }),
            feedPost('grace-fp-3', 'm-grace', 300, 'Seed packets for spring, packed by the Lincoln Elementary garden club. #gardening #mutualaid', { media: [photo('grace-m-3', 'seeds', 'Seed packets')] }),
          ],
        },
      },
    ],
  };

  const priya = {
    id: 'blog-m-priya', kind: 'blog', name: 'Priya Nair',
    description: 'Tenant organizer. Writing down what works.',
    memberIds: ['m-priya'],
    appearance: { font: 'newspaper', accent: '#b32424', background: 'white', cover: {}, cards: 'flat', corners: 'square' },
    modules: [
      {
        id: 'priya-posts', type: 'textfeed', title: 'Notes', span: 7, rows: 18,
        data: {
          events: [],
          posts: [
            feedPost('priya-fp-1', 'm-priya', 3, 'Crestline agreed to meet with the union on the 3rd. 112 heat complaints did that. Not one angry email, 112 of them. #tenantrights'),
            feedPost('priya-fp-2', 'm-priya', 20, 'Reminder: a rent increase letter is not a lease. Don’t sign anything new until you’ve talked to legal aid. Office hours Monday at the library. #tenantrights'),
            feedPost('priya-fp-3', 'm-priya', 55, 'Door knocking tip: ask “what’s it like in January?” and then stop talking. #organizing #tenantrights'),
          ],
        },
      },
      {
        id: 'priya-blog-events', type: 'events', title: 'Office hours', span: 5, rows: 9,
        data: {
          ownEvents: true,
          events: [
            blogEvent('priya-ev-1', 'm-priya', 'Tenant office hours', nextWeekday(1), '18:00', '19:30', 'Juniper Branch Library, study room 2', 'Questions about your lease, repairs, or a rent increase? Drop in.', { 'm-priya': 'going' }, { repeat: 'weekly', color: 'red' }),
          ],
        },
      },
      {
        id: 'priya-blog-post', type: 'note', title: 'Long read', span: 5, rows: 9,
        data: {
          title: 'What I learned knocking on 200 doors',
          html: '<ol><li><b>Ask, don’t tell.</b> “What’s it like in your apartment in January?” gets further than any flyer.</li><li><b>Come back.</b> Most people sign on the second visit, not the first.</li><li><b>Write it down.</b> Our door board tracks every unit, so nobody gets knocked twice in one day or forgotten for a month.</li><li><b>Small wins count.</b> Getting one boiler fixed made the next hundred conversations easier.</li></ol>',
          updatedAt: hoursAgo(55),
        },
      },
    ],
  };

  const written = [leo, jamal, grace, priya];
  const others = PEOPLE
    .filter((person) => !written.some((blog) => blog.memberIds[0] === person.id))
    .map((person) => createStarterBlog(person.id, person.name));
  return [...written, ...others];
}

/** Likes and comments on the demo posts (see js/state/reactions.js). */
export function createDemoReactions() {
  const comment = (id, authorId, hours, body) => ({ id, authorId, body, createdAt: hoursAgo(hours) });
  return {
    'feedpost:leo-fp-1': {
      likes: ['m-nora', 'm-jamal', 'm-grace'],
      comments: [
        comment('c-1', 'm-nora', 4, 'Save me a slice!!'),
        comment('c-2', 'm-jamal', 3, 'Bring some to rehearsal as proof.'),
      ],
    },
    'feedpost:leo-fp-4': { likes: ['m-jamal', 'm-priya'], comments: [comment('c-3', 'm-jamal', 100, 'Sincerely. They were sincere.')] },
    'feedpost:jamal-fp-1': { likes: ['m-leo', 'm-iris'], comments: [] },
    'feedpost:jamal-fp-3': { likes: ['m-leo', 'm-iris', 'm-grace'], comments: [comment('c-4', 'm-leo', 60, 'Can’t wait to record these.')] },
    'feedpost:grace-fp-1': { likes: ['m-priya', 'm-nora'], comments: [comment('c-5', 'm-priya', 12, 'You all are amazing.')] },
    'feedpost:priya-fp-1': { likes: ['m-grace', 'm-maya'], comments: [comment('c-6', 'm-maya', 2, 'Proud of this union.')] },
  };
}
