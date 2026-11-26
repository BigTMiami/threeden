// @ts-check
/**
 * growth-model.js — a model of how 3den could grow by word of mouth in
 * New York, starting from four people.
 *
 *   Malik    a musician in a very online, Instagram-heavy scene where
 *            Partiful is already everywhere. He makes a page for his band,
 *            posts his shows, tells other bands to make pages too, and moves
 *            the monthly climate group he runs onto 3den. Its members organize
 *            around politics and social justice, so they start things often.
 *   Dani     an aspiring actor with lots of friends, but not good with the
 *            app: invitations go out late or half filled in.
 *   Asha     a student with a small circle who likes the app, browses Explore,
 *            and joins book clubs and the like.
 *   Luis     a line cook with lots of high school friends in the area.
 *
 * Each newcomer belongs to a scene (the music scene, organizers, theater
 * friends, the campus crowd, high school friends), usually the inviter's.
 * The scene decides how many of them already use Partiful, what they'd
 * start, and how likely they are to start it.
 *
 * Beyond invitations, the model includes:
 *   - people leaving (and coming back when invited again)
 *   - groups that meet again and again, where members bring friends
 *   - discovery without an invitation: Instagram posts, shared links,
 *     search engines, and Explore
 *   - seasons: holiday parties, people leaving town at the end of December,
 *     the January slump, back to school
 *   - competition from Partiful, which needs no account at all to RSVP
 *
 * No imports, so it runs in the browser (js/data/demo/growth.js) and in Node.
 *
 *   simulateGrowth({ seed, start, days, rates })   → { people, initiatives, daily, … }
 *
 * Every number is in RATES with the reason for it. Retention follows
 * published app benchmarks (see the report); the rest are guesses.
 */

export const RATES = {
  days: 84,
  // Of people invited who aren't on 3den yet:
  open: { party: 0.75, show: 0.6, group: 0.85 },
  join: { party: 0.5, show: 0.35, group: 0.65 }, // of those who open: a quick account (parties, shows) or a full one (groups)
  partifulPenalty: 0.55, // someone who already uses Partiful answers a 3den party at 55% of the usual rate (Partiful needs no account)
  hostElsewhere: 0.5, // a Partiful user about to host a party does it on Partiful half the time
  overlapBase: 0.03, overlapMax: 0.35, // invitee already on 3den: base + max × users / (users + 300)
  answerIfOnPlatform: 0.7,
  comeBack: 0.5, // someone who stopped using 3den answers a new invitation (and is back) at half the usual rate
  upgradeQuick: 0.2, // a quick account becomes a full one, 3 to 20 days later
  startDelay: [7, 35],
  partyLead: [7, 21],
  // Still using 3den after 30 days. Social apps keep about 6% of installs at day 30 (benchmarks in the report);
  // a guest who only answered one party is like that. Groups that meet give people a reason to come back.
  stay30: { quick: 0.06, full: 0.15, group: 0.35, starter: 0.9 },
  laterMonths: 120, // after day 30, people who stayed leave slowly: on average 120 days later
  // Groups that meet: each meeting, each active member brings a friend this often.
  bringFriend: 0.06,
  // Discovery without an invitation, per public group or upcoming public event per day:
  outsideVisits: 0.5, // people arriving from a shared link or a search engine
  outsideJoin: 0.06, // of them, make an account
  exploreBrowse: 0.004, // an active person joins a public group they found on Explore, per day
  // Instagram: of a post's reach, how many tap the link
  instagramReach: 0.25, instagramTap: 0.03,
};

// The scenes newcomers come from.
export const SCENES = {
  music: { label: 'Music scene', partiful: 0.8, start: 0.06, needs: { show: 4, band: 2, birthday: 1, housewarming: 1 } },
  organizers: { label: 'Organizers', partiful: 0.4, start: 0.14, needs: { organizing: 4, fundraiser: 2, mutualaid: 2, readinggroup: 1, birthday: 1 } },
  theater: { label: 'Theater friends', partiful: 0.7, start: 0.05, needs: { birthday: 3, reading: 2, holiday: 1, housewarming: 1 } },
  campus: { label: 'Campus', partiful: 0.5, start: 0.08, needs: { bookclub: 3, study: 2, runclub: 1, birthday: 1 } },
  highschool: { label: 'High school friends', partiful: 0.35, start: 0.05, needs: { friendsgiving: 2, cookout: 2, league: 2, birthday: 2, supper: 1 } },
};

// What people start. Parties and shows are events; groups are made from a template.
// `every`: a group meets every so many days (each meeting is a chance to bring friends).
export const NEEDS = {
  birthday: { kind: 'party', title: 'Birthday party', size: [15, 60], tags: ['party'], season: 'any', verb: 'celebrating a birthday' },
  housewarming: { kind: 'party', title: 'Housewarming', size: [15, 45], tags: ['party', 'food'], season: 'any', verb: 'moved into a new apartment' },
  friendsgiving: { kind: 'party', title: 'Friendsgiving', size: [12, 35], tags: ['food', 'party'], season: 'fall', verb: 'hosting Friendsgiving' },
  holiday: { kind: 'party', title: 'Holiday party', size: [20, 70], tags: ['party'], season: 'holiday', verb: 'throwing a holiday party' },
  cookout: { kind: 'party', title: 'Cookout', size: [15, 50], tags: ['food', 'outdoors'], season: 'warm', verb: 'grilling for the old crew' },
  fundraiser: { kind: 'show', title: 'Fundraiser', size: [20, 60], tags: ['community', 'food'], season: 'any', verb: 'raising money for a cause', public: true },
  show: { kind: 'show', title: 'Show', size: [15, 40], tags: ['music', 'party'], season: 'any', verb: 'playing a show', public: true, instagram: 900 },
  reading: { kind: 'show', title: 'Play reading', size: [12, 35], tags: ['arts'], season: 'any', verb: 'putting on a reading', public: true },
  band: { kind: 'group', title: 'band', template: 'club', groupType: 'Band', visibility: 'public', joining: 'admins', size: [3, 8], every: 14, verb: 'starting a band page' },
  organizing: { kind: 'group', title: 'Organizing Committee', template: 'organizing', groupType: 'Organizing group', visibility: 'public', joining: 'request', size: [10, 30], every: 30, verb: 'organizing their neighbors' },
  mutualaid: { kind: 'group', title: 'Mutual Aid', template: 'organizing', groupType: 'Mutual aid', visibility: 'public', joining: 'open', size: [10, 30], every: 14, verb: 'starting a mutual aid network' },
  readinggroup: { kind: 'group', title: 'Political Reading Group', template: 'club', groupType: 'Reading group', visibility: 'public', joining: 'request', size: [6, 15], every: 30, verb: 'starting a reading group' },
  bookclub: { kind: 'group', title: 'Book Club', template: 'club', groupType: 'Book club', visibility: 'public', joining: 'open', size: [5, 14], every: 30, verb: 'starting a book club' },
  study: { kind: 'group', title: 'Study Group', template: 'class', groupType: 'Study group', visibility: 'private', joining: 'invite', size: [4, 10], every: 7, verb: 'organizing a study group' },
  runclub: { kind: 'group', title: 'Run Club', template: 'club', groupType: 'Run club', visibility: 'public', joining: 'open', size: [6, 20], every: 7, verb: 'starting a run club' },
  league: { kind: 'group', title: 'Rec League Team', template: 'club', groupType: 'Sports team', visibility: 'private', joining: 'invite', size: [8, 16], every: 7, verb: 'getting a team together' },
  supper: { kind: 'group', title: 'Supper Club', template: 'other', groupType: 'Supper club', visibility: 'private', joining: 'invite', size: [6, 14], every: 30, verb: 'starting a supper club' },
  climate: { kind: 'group', title: 'Climate Circle', template: 'organizing', groupType: 'Climate group', visibility: 'public', joining: 'request', size: [25, 45], every: 30, verb: 'running a monthly climate group' },
};

// The four starters. `skill` scales how well their invitations work and how
// likely they are to keep going (1 = typical). `plan` is what they do first.
export const STARTERS = [
  {
    key: 'musician', name: 'Malik', scene: 'music', skill: 1.1, joinDay: 0, instagramFollowers: 1500,
    plan: [{ need: 'band', day: 0 }, { need: 'climate', day: 3 }, { need: 'show', day: 6 }],
    tellsBands: [4, 8], // other bands he tells to make a page
    about: 'a musician who posts his shows on Instagram, makes a band page, and runs a monthly climate group',
  },
  {
    key: 'actor', name: 'Dani', scene: 'theater', skill: 0.5, joinDay: 2,
    plan: [{ need: 'birthday', day: 5, size: [60, 120] }],
    about: 'an aspiring actor with lots of friends who isn’t good with the app',
  },
  {
    key: 'student', name: 'Asha', scene: 'campus', skill: 1.3, joinDay: 1, browse: 0.05,
    plan: [{ need: 'bookclub', day: 10, size: [5, 10] }],
    about: 'a student with a small circle who likes the app and joins book clubs',
  },
  {
    key: 'cook', name: 'Luis', scene: 'highschool', skill: 0.9, joinDay: 4,
    plan: [{ need: 'seasonal', day: 8, size: [40, 80] }],
    about: 'a line cook with lots of high school friends in the area',
  },
];

/**
 * Seasons, by calendar date: how likely people are to start things, how big
 * parties get, and how many people are in town to answer.
 */
export function seasonOf(date) {
  const m = date.getMonth(), d = date.getDate();
  if (m === 11 && d >= 21) return { party: 0.6, group: 0.4, around: 0.6, label: 'holidays away' }; // Dec 21–31
  if (m === 0) return { party: 0.6, group: 1.2, around: 0.9, label: 'January' }; // slump, but resolutions start groups
  if (m === 10 && d >= 10) return { party: 1.4, group: 0.9, around: 1, label: 'Friendsgiving' };
  if (m === 11) return { party: 1.6, group: 0.8, around: 1, label: 'holiday parties' };
  if (m === 9 && d >= 20) return { party: 1.3, group: 1, around: 1, label: 'Halloween' };
  if (m === 8) return { party: 1, group: 1.3, around: 1, label: 'back to school' };
  if (m === 6 || m === 7) return { party: 1.1, group: 0.8, around: 0.8, label: 'summer' };
  return { party: 1, group: 1, around: 1, label: '' };
}

/** A small seeded random number generator (mulberry32), so a run can be repeated. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pickWeighted = (weights) => {
    const entries = Object.entries(weights);
    let roll = next() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [key, w] of entries) { roll -= w; if (roll <= 0) return key; }
    return entries.at(-1)[0];
  };
  return {
    next,
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    pickWeighted,
    delay: (mean) => Math.min(14, Math.floor(-Math.log(1 - next()) * mean)),
    exp: (mean) => -Math.log(1 - next()) * mean,
  };
}

/**
 * Run the model once.
 *   start   the date of day 0 (seasons follow the calendar)
 *
 * people:      [{ id, gen, joinedDay, via, initiativeId, scene, starter, quick, upgradedDay,
 *                 leftDay (null = still active at the end), cameBack }]
 *              via: 'starter' | 'party' | 'show' | 'group' | 'friend' (brought to a meeting)
 *                   | 'instagram' | 'link' (a shared link or a search engine) | 'band-referral'
 * initiatives: [{ id, ownerId, need, needId, day, eventDay, invited, opened, joinedNew,
 *                 answeredExisting, meetings, reach, public }]
 * daily:       [{ day, users, active }]
 */
export function simulateGrowth({ seed = 1, start = new Date(), days = RATES.days, rates = RATES, starters = STARTERS } = {}) {
  const r = makeRandom(seed);
  const people = [];
  const initiatives = [];
  const queue = []; // { day, ownerId, needId, size }
  const daily = [];
  const dateOf = (day) => { const d = new Date(start); d.setDate(d.getDate() + day); return d; };

  const isActive = (p, day) => p.joinedDay <= day && (p.leftDay == null || p.leftDay > day);

  /** When they stop using 3den, counted from `from` (the day they joined, or came back). */
  function setStay(person, kind, skill = 1, from = person.joinedDay) {
    const stay = Math.min(0.95, rates.stay30[kind] * (person.scene === 'organizers' ? 1.3 : 1) * skill);
    person.leftDay = from + (r.chance(stay) ? 30 + Math.round(r.exp(rates.laterMonths)) : 1 + Math.round(r.exp(6)));
  }

  function addPerson(fields, stayKind, skill) {
    const person = { id: people.length + 1, quick: false, upgradedDay: null, cameBack: 0, starter: null, ...fields };
    people.push(person);
    setStay(person, stayKind, skill);
    return person;
  }

  /** A newcomer may later start something of their own. */
  function maybeStart(person) {
    const scene = SCENES[person.scene];
    const startDay = person.joinedDay + r.int(...rates.startDelay);
    if (startDay > days || (person.leftDay != null && person.leftDay <= startDay)) return;
    const needId = r.pickWeighted(scene.needs);
    const need = NEEDS[needId];
    const season = seasonOf(dateOf(startDay));
    let rate = scene.start * (need.kind === 'group' ? season.group : season.party);
    if (person.quick) rate *= person.upgradedDay != null ? 0.8 : 0.5;
    // A Partiful user hosting a party often does it there instead.
    if (need.kind === 'party' && r.chance(scene.partiful)) rate *= 1 - rates.hostElsewhere;
    if (!r.chance(rate)) return;
    queue.push({ day: startDay, ownerId: person.id, needId });
    if (person.quick && (person.upgradedDay == null || person.upgradedDay > startDay)) person.upgradedDay = startDay; // hosting needs a full account
  }

  /** Someone hears about something. Returns the new person, or null. */
  function reach({ day, initiative, via, scene, openRate, joinRate, kind, gen, skill = 1 }) {
    const season = seasonOf(dateOf(day));
    const users = people.filter((p) => p.joinedDay <= day && p.id !== initiative.ownerId);
    const overlap = rates.overlapBase + rates.overlapMax * (users.length / (users.length + 300));
    if (users.length && r.chance(overlap)) {
      const who = r.pick(users);
      if (initiative.answeredExisting.includes(who.id)) return null;
      const away = !isActive(who, day);
      if (r.chance(rates.answerIfOnPlatform * (away ? rates.comeBack : 1) * season.around)) {
        initiative.answeredExisting.push(who.id);
        if (away) { who.cameBack++; setStay(who, kind === 'group' ? 'group' : 'full', 1, day); }
      }
      return null;
    }
    if (!r.chance(openRate * season.around * skill)) return null;
    initiative.opened++;
    const partiful = kind !== 'group' && r.chance(SCENES[scene].partiful);
    if (!r.chance(Math.min(0.95, joinRate * skill * (partiful ? rates.partifulPenalty : 1)))) return null;
    const joinedDay = day + r.delay(1.5);
    if (joinedDay > days) return null;
    const quick = kind !== 'group';
    const person = addPerson({ gen, joinedDay, via, initiativeId: initiative.id, scene, quick }, quick ? 'quick' : 'group');
    initiative.joinedNew.push(person.id);
    if (quick && r.chance(rates.upgradeQuick)) {
      person.upgradedDay = joinedDay + r.int(3, 20);
      if (person.leftDay != null && person.leftDay < person.upgradedDay) person.upgradedDay = null;
      else setStay(person, 'full');
    }
    maybeStart(person);
    return person;
  }

  // The starters.
  for (const s of starters) {
    const person = addPerson({ gen: 0, joinedDay: s.joinDay, via: 'starter', initiativeId: null, scene: s.scene, starter: s.key }, 'starter', s.skill);
    for (const step of s.plan) queue.push({ day: s.joinDay + step.day, ownerId: person.id, needId: step.need, size: step.size, skill: s.skill, instagram: s.instagramFollowers });
    if (s.tellsBands) person.tellsBands = s.tellsBands;
  }

  for (let day = 0; day <= days; day++) {
    const season = seasonOf(dateOf(day));

    // New invitations going out today.
    for (const item of queue.filter((q) => q.day === day)) {
      const owner = people[item.ownerId - 1];
      if (!isActive(owner, day)) continue;
      let needId = item.needId;
      if (needId === 'seasonal') needId = season.party >= 1.3 ? (dateOf(day).getMonth() === 10 ? 'friendsgiving' : 'holiday') : season.label === 'summer' ? 'cookout' : 'birthday';
      const need = NEEDS[needId];
      const starter = starters.find((s) => s.key === owner.starter);
      const skill = item.skill ?? 1;
      let invited = r.int(...(item.size ?? need.size));
      if (need.kind === 'party') invited = Math.round(invited * Math.min(1.3, season.party));
      const initiative = {
        id: initiatives.length + 1, ownerId: owner.id, need, needId, day,
        eventDay: need.kind === 'group' ? null : day + r.int(...rates.partyLead),
        invited, opened: 0, joinedNew: [], answeredExisting: [], meetings: 0, reach: 0, public: Boolean(need.public || need.visibility === 'public'),
        scene: owner.scene,
      };
      initiatives.push(initiative);
      const sceneFor = () => (r.chance(0.8) ? owner.scene : r.pick(Object.keys(SCENES)));
      for (let k = 0; k < invited; k++) {
        reach({ day, initiative, via: need.kind, scene: needId === 'climate' ? 'organizers' : sceneFor(), openRate: rates.open[need.kind], joinRate: rates.join[need.kind], kind: need.kind, gen: owner.gen + 1, skill });
      }
      // Instagram: a show posted to the musician's followers.
      if (need.instagram && item.instagram) {
        const taps = Math.round(item.instagram * rates.instagramReach * rates.instagramTap * (0.6 + r.next() * 0.8));
        initiative.reach = taps;
        for (let k = 0; k < taps; k++) reach({ day, initiative, via: 'instagram', scene: 'music', openRate: 1, joinRate: rates.join.show, kind: 'show', gen: owner.gen + 1 });
      }
      // Malik tells other bands to make a page.
      if (needId === 'band' && owner.tellsBands) {
        const bands = r.int(...owner.tellsBands);
        for (let k = 0; k < bands; k++) {
          if (!r.chance(0.35)) continue;
          const joinedDay = day + r.int(2, 20);
          if (joinedDay > days) continue;
          const leader = addPerson({ gen: owner.gen + 1, joinedDay, via: 'band-referral', initiativeId: initiative.id, scene: 'music' }, 'group');
          initiative.joinedNew.push(leader.id);
          queue.push({ day: joinedDay, ownerId: leader.id, needId: 'band' });
          queue.push({ day: joinedDay + r.int(5, 20), ownerId: leader.id, needId: 'show', instagram: r.int(300, 1500) });
        }
      }
      // A band keeps playing shows; the musician's are posted to Instagram.
      if (needId === 'show' && starter?.instagramFollowers) queue.push({ day: day + r.int(12, 18), ownerId: owner.id, needId: 'show', instagram: starter.instagramFollowers, skill });
    }

    // Groups that meet today: members bring friends; existing members stay engaged.
    for (const initiative of initiatives) {
      const need = initiative.need;
      if (need.kind !== 'group' || day === initiative.day || (day - initiative.day) % need.every !== 0) continue;
      const owner = people[initiative.ownerId - 1];
      if (!isActive(owner, day)) continue;
      initiative.meetings++;
      const members = [owner, ...initiative.joinedNew.map((id) => people[id - 1]), ...initiative.answeredExisting.map((id) => people[id - 1])]
        .filter((p) => isActive(p, day));
      for (const member of members) {
        if (!r.chance(rates.bringFriend * season.around)) continue;
        reach({ day, initiative, via: 'friend', scene: member.scene, openRate: 1, joinRate: rates.join.group, kind: 'group', gen: member.gen + 1 });
      }
    }

    // Discovery without an invitation: shared links and search engines find public groups and upcoming public events.
    const publicThings = initiatives.filter((i) => i.public && i.day <= day && (i.eventDay == null ? isActive(people[i.ownerId - 1], day) : i.eventDay >= day));
    for (const initiative of publicThings) {
      const visits = Math.round(r.exp(rates.outsideVisits));
      for (let k = 0; k < visits; k++) {
        if (!r.chance(rates.outsideJoin)) continue;
        const joinedDay = day + r.delay(1);
        if (joinedDay > days) continue;
        const kind = initiative.need.kind;
        const person = addPerson({ gen: people[initiative.ownerId - 1].gen + 1, joinedDay, via: 'link', initiativeId: initiative.id, scene: initiative.scene, quick: kind !== 'group' }, kind === 'group' ? 'group' : 'quick');
        initiative.joinedNew.push(person.id);
        maybeStart(person);
      }
    }
    // Explore: active people join public groups they find (this adds members, not new people).
    const publicGroups = publicThings.filter((i) => i.need.kind === 'group');
    if (publicGroups.length) {
      for (const person of people.filter((p) => isActive(p, day))) {
        const browse = starters.find((s) => s.key === person.starter)?.browse ?? rates.exploreBrowse;
        if (!r.chance(browse)) continue;
        const group = r.pick(publicGroups);
        if (group.ownerId !== person.id && !group.answeredExisting.includes(person.id) && !group.joinedNew.includes(person.id)) group.answeredExisting.push(person.id);
      }
    }

    daily.push({ day, users: people.filter((p) => p.joinedDay <= day).length, active: people.filter((p) => isActive(p, day)).length });
  }
  for (const p of people) {
    if (p.upgradedDay != null && p.upgradedDay > days) p.upgradedDay = null;
    if (p.leftDay != null && p.leftDay > days) p.leftDay = null;
  }
  return { people, initiatives, daily, days, start, rates };
}

/** Totals by week, for charts: [{ week, users, active }] */
export function weeklyTotals(run) {
  return run.daily.filter((d) => d.day % 7 === 0);
}
