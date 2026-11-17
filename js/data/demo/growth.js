// @ts-check
/**
 * growth.js — the demo's growth model people: four New Yorkers who started
 * using 3den (see growth-model.js for who they are) and everyone who joined
 * through them over the 12 weeks up to today.
 *
 * It's one run of the model, started 84 days before today so that it ends
 * now (the model's seasons follow the real calendar, so the run differs a
 * little depending on the date you open the demo). The seed was picked so
 * that, for a run ending in mid-November, it lands near the middle of
 * 2,000 runs.
 *
 * What it makes:
 *   members     the people, each with member.growth = { gen, via, scene,
 *               starter, joinedDay, leftDay } and an onboarding record that
 *               says how they arrived (people from a party or show have quick
 *               accounts unless they finished one). leftDay set = they've
 *               stopped using 3den.
 *   spaces      a homepage for each host (their party is on its calendar),
 *               and a group for each group someone started, with its regular
 *               meeting on the group calendar. Shows are public events on
 *               the band's calendar.
 *   friendships each starter of something is friends with some of the
 *               people who joined through them
 *
 * Leo isn't in any of it, so his demo stays the same. The public groups
 * show up on his Explore tab, and the public shows under "farther away"
 * (New York is about 80 miles from Leo's made-up city). To see it from
 * inside, sign in as one of the four starters (they're on the sign-in screen).
 */

import { simulateGrowth, STARTERS, SCENES } from './growth-model.js';
import { STARTER_LAYOUTS, layoutForArrival } from '../starter-layouts.js';
import { createStarterGroupModules } from '../starters.js';
import { getModuleType } from '../../modules/registry.js';
import { daysFromToday } from './helpers.js';

export const GROWTH_SEED = 42;
const TODAY = 84; // the run's last day is today
const DAY = 24 * 60 * 60 * 1000;

export const STARTER_PEOPLE = {
  musician: { name: 'Malik Rivera', bio: 'Guitar and vocals in Paper Lanterns. Runs the Bushwick Climate Circle.', area: 'bushwick' },
  actor: { name: 'Dani Moreau', bio: 'Actor. Auditioning. Always up for a party.', area: 'astoria' },
  student: { name: 'Asha Kapoor', bio: 'Grad student. Book clubs, long walks, and too many tabs open.', area: 'harlem' },
  cook: { name: 'Luis Ortega', bio: 'Line cook. Mondays off.', area: 'ridgewood' },
};

const FIRST = ['Ava', 'Ben', 'Carmen', 'Diego', 'Esme', 'Femi', 'Gwen', 'Hiro', 'Ines', 'Jonah', 'Kai', 'Lena', 'Mateo', 'Nia', 'Oscar', 'Paloma',
  'Quinn', 'Rosa', 'Sol', 'Tariq', 'Uma', 'Victor', 'Wren', 'Ximena', 'Yusuf', 'Zoe', 'Amara', 'Bruno', 'Cleo', 'Dev', 'Elif', 'Felix', 'Greta',
  'Hassan', 'Ivy', 'Jules', 'Kenji', 'Lucia', 'Milo', 'Nadia', 'Omar', 'Pia', 'Rafael', 'Sana', 'Vera', 'Will', 'Yara', 'Aiden', 'Beatriz',
  'Cyrus', 'Dalia', 'Emeka', 'Farah', 'Gus', 'Hana', 'Idris', 'June', 'Kofi', 'Leila', 'Marco', 'Noor', 'Otto', 'Rhea', 'Sami'];
const LAST = ['Abbott', 'Baptiste', 'Castillo', 'Dunn', 'Eze', 'Fischer', 'Garza', 'Hughes', 'Ibarra', 'Jensen', 'Kowalski', 'Lindqvist', 'Mensah',
  'Nakamura', 'Oyelaran', 'Petrov', 'Quintero', 'Rossi', 'Sato', 'Torres', 'Ueda', 'Vasquez', 'Whitfield', 'Xu', 'Yilmaz', 'Zimmer', 'Adeyemi',
  'Brennan', 'Costa', 'Delgado', 'Ferreira', 'Gallo', 'Haddad', 'Iyer', 'Jovanovic', 'Kim', 'Laurent', 'Moreno', 'Novak', 'Okoro',
  'Patel', 'Reyes', 'Salazar', 'Tanaka', 'Vargas', 'Weiss', 'Young', 'Alvarez', 'Chowdhury', 'Dimitriou', 'Espinoza', 'Farouk'];
const COLORS = ['#3366CC', '#7B3FA0', '#14866D', '#AC6600', '#B32424', '#2F5D8A', '#5C6BC0', '#00796B', '#8D6E63', '#C2185B'];
// New York neighborhoods (in js/utils/places.js), by scene.
const AREAS = {
  music: ['bushwick', 'williamsburg', 'ridgewood', 'lower-east-side'],
  organizers: ['bushwick', 'crown-heights', 'harlem', 'lower-east-side'],
  theater: ['astoria', 'lower-east-side', 'harlem'],
  campus: ['harlem', 'park-slope', 'williamsburg'],
  highschool: ['ridgewood', 'astoria', 'crown-heights'],
};
const AREA_NAMES = { bushwick: 'Bushwick', williamsburg: 'Williamsburg', ridgewood: 'Ridgewood', 'lower-east-side': 'Lower East Side', 'crown-heights': 'Crown Heights', harlem: 'Harlem', astoria: 'Astoria', 'park-slope': 'Park Slope' };
const VENUES = { bushwick: 'Alphaville', williamsburg: 'Union Pool', ridgewood: 'Trans-Pecos', 'lower-east-side': 'Pianos', 'crown-heights': 'Friends and Lovers', harlem: 'Shrine', astoria: 'The Sparrow', 'park-slope': 'Union Hall' };
const BAND_WORDS = [['Paper', 'Tin', 'Velvet', 'Low', 'Night', 'Copper', 'Glass', 'Static'], ['Lanterns', 'Foxes', 'Harbor', 'Hours', 'Orchard', 'Signal', 'Weather', 'Choir']];

export function createGrowthDemo() {
  const start = new Date(Date.now() - TODAY * DAY);
  const run = simulateGrowth({ seed: GROWTH_SEED, start });
  // A second seeded stream for names, places, and RSVPs, so the model's own numbers don't shift.
  let s = 9001;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  const at = (day) => Date.now() - (TODAY - day) * DAY - between(1, 10) * 60 * 60 * 1000;
  const dateOf = (day) => daysFromToday(day - TODAY);
  const idOf = (person) => `g-${person.id}`;
  const initiativeOf = (id) => run.initiatives.find((i) => i.id === id);

  // ── People ──
  const taken = new Set();
  const members = run.people.map((person) => {
    const known = person.starter ? STARTER_PEOPLE[person.starter] : null;
    let first, last;
    if (known) [first, last] = known.name.split(' ');
    else do { first = pick(FIRST); last = pick(LAST); } while (taken.has(`${first} ${last}`));
    taken.add(`${first} ${last}`);
    let username = `${first}${last[0]}`.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    while (taken.has(`@${username}`)) username += between(1, 9);
    taken.add(`@${username}`);
    const quick = person.quick && person.upgradedDay == null;
    const usesPhone = quick && rand() < 0.55;
    const initiative = initiativeOf(person.initiativeId);
    const isGroup = initiative?.need.kind === 'group';
    const source = person.starter
      ? (STARTERS.find((st) => st.key === person.starter).plan[0].need === 'birthday' || person.starter === 'cook' ? 'host' : 'organizer')
      : isGroup ? 'group' : 'event';
    const settled = TODAY - person.joinedDay > 10;
    return {
      id: idOf(person),
      name: `${first} ${last}`,
      username,
      email: usesPhone ? null : `${username}@example.com`,
      phone: usesPhone ? `+1718555${String(1000 + person.id).slice(-4)}` : null,
      textNotifications: usesPhone && rand() < 0.6,
      initials: `${first[0]}${last[0]}`,
      color: pick(COLORS),
      bio: known?.bio ?? '',
      password: null,
      ...(quick ? { quick: true } : {}),
      location: { placeId: known?.area ?? pick(AREAS[person.scene]), radiusMiles: 5 },
      createdAt: at(person.joinedDay),
      growth: {
        gen: person.gen, via: person.via, scene: SCENES[person.scene].label, starter: Boolean(person.starter), persona: person.starter,
        joinedDay: person.joinedDay, leftDay: person.leftDay,
      },
      onboarding: {
        source,
        itemId: initiative && !isGroup ? `grow-ev-${initiative.id}` : null,
        spaceId: initiative && isGroup ? `grow-grp-${initiative.id}` : null,
        layout: layoutForArrival(source),
        startedAt: at(person.joinedDay),
        done: [], tipsSeen: [], suggestionsDismissed: [],
        hidden: settled, noteDismissed: settled, doneShown: settled, answered: true, blogWelcome: null,
      },
    };
  });
  const memberOf = (personId) => members[personId - 1];

  // ── Parties, shows, and groups ──
  const homepages = new Map();
  const groups = [];
  const friendships = [];
  const bandOf = new Map(); // owner member id → their band group

  const homepageOf = (member) => {
    if (!homepages.has(member.id)) {
      const modules = (STARTER_LAYOUTS[member.onboarding.layout] ?? STARTER_LAYOUTS.everything).modules();
      if (!modules.some((m) => m.type === 'calendar')) modules.push({ id: `${member.id}-cal`, type: 'calendar', title: 'My calendar', span: 12, rows: 11, data: { events: [] } });
      homepages.set(member.id, { id: `home-${member.id}`, kind: 'personal', name: 'My homepage', memberIds: [member.id], appearance: {}, modules });
    }
    return homepages.get(member.id);
  };
  const calendarOf = (space) => space.modules.find((m) => m.type === 'calendar' || (m.type === 'events' && m.data?.ownEvents))
    ?? space.modules.find((m) => Array.isArray(m.data?.events));

  const usedGroupNames = new Set();
  for (const initiative of run.initiatives) {
    const owner = memberOf(initiative.ownerId);
    const need = initiative.need;
    const ownerPerson = run.people[initiative.ownerId - 1];
    const joinedIds = initiative.joinedNew.map((id) => idOf(run.people[id - 1]));
    const existingIds = initiative.answeredExisting.map((id) => idOf(run.people[id - 1])).filter((id) => id !== owner.id);
    const area = owner.location.placeId;
    const first = owner.name.split(' ')[0];

    for (const id of joinedIds) {
      if (rand() < 0.3) {
        const joined = memberOf(Number(id.slice(2))).createdAt;
        friendships.push({ id: `grow-fr-${friendships.length + 1}`, from: owner.id, to: id, status: 'accepted', createdAt: joined + DAY, respondedAt: joined + DAY + 3600000 });
      }
    }

    if (need.kind !== 'group') {
      const everyone = [...joinedIds, ...existingIds];
      const rsvps = {};
      for (const id of everyone) {
        const roll = rand();
        rsvps[id] = roll < 0.62 ? 'going' : roll < 0.85 ? 'maybe' : 'no';
      }
      rsvps[owner.id] = 'going';
      const isShow = initiative.needId === 'show';
      const band = bandOf.get(owner.id);
      const title = isShow ? `${band?.name ?? first} at ${VENUES[area] ?? 'the venue'}`
        : initiative.needId === 'birthday' ? `${first}’s birthday`
          : initiative.needId === 'reading' ? `Reading: a new play by ${first}`
            : need.title;
      const event = {
        id: `grow-ev-${initiative.id}`,
        kind: 'event',
        title,
        date: dateOf(initiative.eventDay),
        allDay: false,
        time: isShow ? '21:00' : initiative.needId === 'cookout' ? '14:00' : '19:30',
        endTime: isShow ? '23:00' : initiative.needId === 'cookout' ? '19:00' : '23:30',
        location: isShow ? `${VENUES[area] ?? 'Venue'}, ${AREA_NAMES[area] ?? ''}` : `${between(10, 980)} ${pick(['Knickerbocker Ave', 'Ditmars Blvd', 'Seneca Ave', 'Nostrand Ave', 'Frederick Douglass Blvd', 'Bedford Ave'])}`,
        area,
        tags: need.tags,
        notes: `${first} is ${need.verb}.${initiative.reach ? ` Posted on Instagram: ${initiative.reach} people tapped the link.` : ''} Invited ${initiative.invited} people by link.`,
        color: isShow ? 'purple' : pick(['blue', 'orange', 'green', 'red']),
        createdBy: owner.id,
        repeat: 'none',
        visibility: need.public ? 'public' : 'invite',
        capacity: null,
        inviteeIds: need.public ? [] : everyone,
        rsvps,
        attendeeIds: Object.keys(rsvps).filter((id) => rsvps[id] === 'going'),
        createdAt: at(initiative.day),
        invitedByLink: { sent: initiative.invited, opened: initiative.opened, joined: joinedIds.length, instagramTaps: initiative.reach },
      };
      const home = band ?? homepageOf(owner);
      calendarOf(home).data.events.push(event);
    } else {
      let name = initiative.needId === 'band' ? `${pick(BAND_WORDS[0])} ${pick(BAND_WORDS[1])}`
        : initiative.needId === 'climate' ? 'Bushwick Climate Circle'
          : initiative.needId === 'supper' ? `${first}’s ${need.title}`
            : `${AREA_NAMES[area] ?? 'Brooklyn'} ${need.title}`;
      if (ownerPerson.starter === 'musician' && initiative.needId === 'band') name = 'Paper Lanterns';
      while (usedGroupNames.has(name)) name = `${name} ${between(2, 9)}`;
      usedGroupNames.add(name);
      const memberIds = [owner.id, ...new Set([...joinedIds, ...existingIds])];
      const roles = Object.fromEntries(memberIds.map((id, i) => [id, i === 0 ? 'owner' : i === 1 ? 'admin' : 'member']));
      const modules = createStarterGroupModules(need.template)
        .map((m) => ({ ...m, data: m.data ?? getModuleType(m.type).createInitialData() }));
      const news = modules.find((m) => m.type === 'announcements');
      if (news) {
        news.data = {
          posts: [{
            id: `grow-post-${initiative.id}`, authorId: owner.id, title: `Welcome to ${name}`, pinned: true, createdAt: at(initiative.day), seenBy: [], comments: [],
            body: `Thanks for joining! I’m ${need.verb}, and this is where we’ll keep track of everything.`,
          }],
        };
      }
      const group = {
        id: `grow-grp-${initiative.id}`,
        kind: 'group',
        name,
        description: `Started by ${first}, who’s ${need.verb}. Meets ${need.every === 7 ? 'every week' : need.every === 14 ? 'every other week' : 'once a month'}.`,
        visibility: need.visibility,
        joining: need.joining,
        groupType: need.groupType,
        template: need.template,
        memberIds,
        roles,
        permissions: {},
        appearance: {},
        joinRequests: [],
        ...(need.visibility === 'public' ? { tabs: [{ id: 'home', name: 'Home', visibility: 'public' }] } : {}),
        ...(need.joining === 'invite' ? { inviteCode: `grow${initiative.id}` } : {}),
        modules,
        createdAt: at(initiative.day),
        invitedByLink: { sent: initiative.invited, opened: initiative.opened, joined: joinedIds.length, meetings: initiative.meetings },
      };
      // Its regular meeting, on the group calendar (bands play shows instead).
      const calendar = calendarOf(group);
      if (calendar && initiative.needId !== 'band') {
        const next = initiative.day + need.every * Math.ceil((TODAY - initiative.day + 1) / need.every);
        calendar.data.events.push({
          id: `grow-meet-${initiative.id}`, kind: 'event', title: need.every === 7 ? 'Weekly meetup' : need.every === 14 ? 'Meetup' : 'Monthly meeting',
          date: dateOf(next), allDay: false, time: '19:00', endTime: '20:30', location: `${AREA_NAMES[area] ?? 'Brooklyn'}`, area, tags: ['meeting'],
          notes: '', color: 'green', createdBy: owner.id, repeat: need.every === 7 ? 'weekly' : 'monthly', visibility: 'group', capacity: null,
          inviteeIds: [], rsvps: {}, attendeeIds: [], createdAt: at(initiative.day),
        });
      }
      if (initiative.needId === 'band') bandOf.set(owner.id, group);
      groups.push(group);
    }
  }

  // Starters get a homepage too.
  for (const member of members.filter((m) => m.growth.starter)) homepageOf(member);

  return { members, spaces: [...homepages.values(), ...groups], friendships, run };
}
