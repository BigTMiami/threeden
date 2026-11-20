// @ts-check
/**
 * year.js — the simulated year (js/data/demo/year-model.js) as sample data.
 *
 * scripts/build-year-demo.mjs runs the model and writes a slice of it to
 * year-data.js: the 40 biggest groups still meeting at the end of the year,
 * their members and some of everyone else (about 830 people), friendships among them, and
 * the year's feedback. This turns that slice into a town's worth of use:
 *
 *   - accounts (two in three live around Juniper Lane, the rest in New York)
 *   - groups with weeks of history: announcements with comments, polls, and
 *     sign-ups; past meetings with who came; the next meeting; a bigger event
 *     (public for public groups, so Explore has plenty); forum threads with
 *     replies; photo posts; articles and quick updates; a group chat for
 *     clubs and households; class assignments
 *   - blogs for about one person in five, with posts, likes, and comments
 *   - Leo in four of these groups (he runs one, the Juniper Lane Bike Crew),
 *     with friends, friend requests, messages, an RSVP or two, a task, and
 *     notifications from all of it
 *   - "3den Community", whose forum holds the feedback: one thread per theme
 *
 *   createYearDemo() → { members, spaces, friendships, conversations, notifications, reactions, visits (Leo's), othersVisits }
 *
 * Names, places, and words are chosen from fixed lists by each person's or
 * group's number, so the sample is the same every time.
 */

import { YEAR_DATA } from './year-data.js';
import { PERSONAS } from './year-model.js';
import { createStarterGroupModules } from '../starters.js';
import { getModuleType } from '../../modules/registry.js';
import { nextWeekday, daysFromToday, shiftDate } from './helpers.js';
import { demoPhoto } from '../demo-photos.js';

const DAY = 86400000;
const PERSONA_KEYS = Object.keys(PERSONAS);
const LEO = 'm-leo';

/** A number from 0 to 1 that's always the same for the same seed. */
const R = (seed) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const pick = (list, seed) => list[Math.floor(R(seed) * list.length) % list.length];

const FIRST = ['Adaeze', 'Bilal', 'Camila', 'Darius', 'Eleni', 'Faisal', 'Giulia', 'Hamza', 'Isla', 'Jasper', 'Keiko', 'Luca', 'Mariam', 'Nico', 'Odette',
  'Pablo', 'Rania', 'Soren', 'Tamsin', 'Ulises', 'Valentina', 'Wes', 'Xiomara', 'Yosef', 'Zara', 'Anouk', 'Benji', 'Catalina', 'Dmitri', 'Esra',
  'Florian', 'Gemma', 'Hector', 'Imani', 'Joaquin', 'Kalani', 'Liesel', 'Mohammed', 'Nell', 'Orla', 'Priyanka', 'Quentin', 'Renata', 'Sebastian',
  'Thea', 'Umar', 'Vivian', 'Wyatt', 'Yasmin', 'Zeke', 'Aiko', 'Bastian', 'Celeste', 'Diallo', 'Effie', 'Gideon', 'Halima', 'Ignacio', 'Juno', 'Lorenzo',
  'Amara', 'Bruno', 'Chiara', 'Dev', 'Elif', 'Felix', 'Greta', 'Hiro', 'Ines', 'Jonah', 'Kofi', 'Lena', 'Malik', 'Noor', 'Oscar', 'Paloma', 'Rafael',
  'Saoirse', 'Tariq', 'Uma', 'Victor', 'Willa', 'Yara', 'Zain', 'Ada', 'Cyrus', 'Delphine', 'Emeka', 'Fatima', 'Gus', 'Hana', 'Idris', 'June', 'Kai'];
const LAST = ['Achebe', 'Bergstrom', 'Cardenas', 'Dlamini', 'Echevarria', 'Fontaine', 'Gutierrez', 'Halvorsen', 'Ivanova', 'Jaramillo', 'Kaplan',
  'Lombardi', 'Mbeki', 'Nwosu', 'Olsen', 'Pacheco', 'Quiroga', 'Rahman', 'Sorensen', 'Takahashi', 'Urquhart', 'Valdez', 'Wojcik', 'Xiong',
  'Yamamoto', 'Zaragoza', 'Amari', 'Bianchi', 'Cruz', 'Duarte', 'Engel', 'Fujimoto', 'Grant', 'Hosseini', 'Ito', 'Jung', 'Khan', 'Lindgren',
  'Mendes', 'Nash', 'Okafor', 'Park', 'Ruiz', 'Shah', 'Toledo', 'Usman', 'Vance', 'Waweru', 'Yeboah', 'Zhou', 'Abara', 'Brennan', 'Castillo',
  'Delgado', 'Ekström', 'Ferreira', 'Gallo', 'Haddad', 'Iyer', 'Jovanovic', 'Kowalski', 'Laine', 'Moreau', 'Novak', 'Ortiz', 'Petrov', 'Rossi'];
const COLORS = ['#3366CC', '#7B3FA0', '#14866D', '#AC6600', '#B32424', '#2F5D8A', '#5C6BC0', '#00796B', '#8D6E63', '#C2185B'];

// Two in three people live around Juniper Lane (Leo's town); the rest in New York.
const LOCAL = ['juniper', 'crestline', 'downtown', 'riverside', 'eastside', 'lincoln', 'westgate', 'harbor'];
const NYC = ['bushwick', 'williamsburg', 'ridgewood', 'lower-east-side', 'crown-heights', 'harlem', 'astoria', 'park-slope'];
const AREA_NAMES = {
  juniper: 'Juniper Lane', crestline: 'Crestline', downtown: 'Downtown', riverside: 'Riverside', eastside: 'Eastside', lincoln: 'Lincoln', westgate: 'Westgate', harbor: 'Harbor',
  bushwick: 'Bushwick', williamsburg: 'Williamsburg', ridgewood: 'Ridgewood', 'lower-east-side': 'Lower East Side', 'crown-heights': 'Crown Heights', harlem: 'Harlem', astoria: 'Astoria', 'park-slope': 'Park Slope',
};
const areaOf = (simId) => (simId % 3 === 2 ? NYC[(simId * 5) % NYC.length] : LOCAL[(simId * 5) % LOCAL.length]);

const BIOS = {
  organizer: ['Tenant organizer.', 'Runs our block association.', 'Climate group, Thursdays.', 'Organizing for better buses.', 'Parks, libraries, and bike lanes.'],
  creator: ['Bass and bad puns.', 'Songs, mostly sad ones.', 'Photographer. Shows on weekends.', 'Drummer in two bands.', 'Ceramics and loud records.'],
  student: ['Urban planning, second year.', 'Nursing student.', 'Studying CS and coffee.', 'Grad student, history.', 'Learning Spanish, slowly.'],
  household: ['Four roommates, one dishwasher.', 'Parent of two.', 'Keeps the family calendar alive.', 'House manager by default.', 'Soup person.'],
  socializer: ['Here for the birthdays.', 'Always hosting.', 'Dinner parties and long walks.', 'Brunch committee chair.', 'Trivia captain.'],
  volunteer: ['Pantry Saturdays.', 'Volunteers at the community fridge.', 'Coaches youth soccer.', 'Library volunteer.', 'Drives for the food bank.'],
  publisher: ['Edits a neighborhood newsletter.', 'Writes about local food.', 'Zine maker.', 'Runs a small news site.', 'Local history nerd.'],
};
const HELP = {
  organizer: ['public speaking', 'flyers', 'Spanish'], creator: ['sound', 'photos', 'design'], student: ['tutoring', 'spreadsheets', 'research'],
  household: ['cooking', 'fixing things', 'childcare'], socializer: ['hosting', 'cooking', 'driving'], volunteer: ['driving', 'lifting', 'first aid'],
  publisher: ['writing', 'editing', 'photos'],
};

// Groups by kind. Each name has its own flavor: tags, a bigger event, updates, and threads.
const GROUP_NAMES = {
  organizing: ['Tenants Association', 'Climate Circle', 'Bus Riders Union', 'Community Fridge', 'Mutual Aid Network', 'Block Association', 'Library Friends', 'Parks Coalition', 'Street Trees Crew', 'Food Co-op'],
  club: ['Bike Crew', 'Run Club', 'Choir', 'Film Night', 'Board Game Club', 'Pickup Soccer', 'Supper Club', 'Open Mic', 'Climbing Club', 'Knitting Circle'],
  class: ['Spanish Practice', 'Study Group', 'Design Studio', 'Book Club', 'Coding Circle', 'Writing Workshop', 'Ceramics Class'],
  house: ['House', 'Family', 'Roommates'],
  news: ['Neighborhood News', 'Gazette', 'Weekly', 'Bulletin', 'Dispatch'],
};
const GROUP_TYPES = { organizing: 'Organizing group', club: 'Club', class: 'Class', house: 'Household', news: 'Newsletter' };
const MEETS = { organizing: 'every other week', club: 'every week', class: 'every week', house: 'every Sunday', news: 'every week' };
const MEETINGS = { organizing: 'General meeting', club: 'Weekly meetup', class: 'Weekly session', house: 'House meeting', news: 'Story meeting' };

/** [tags, the bigger event's title, its notes, a photo scene]. */
const FLAVOR = {
  'Tenants Association': [['meeting', 'community'], 'Know your rights night', 'Legal aid answers questions about leases and repairs. Interpretation in Spanish.', 'skyline'],
  'Climate Circle': [['meeting', 'outdoors'], 'Tree planting on the avenue', 'Gloves, shovels, and coffee provided. Wear boots.', 'leaves'],
  'Bus Riders Union': [['meeting', 'community'], 'Ride-along on the 14', 'We ride the whole route together and note every delay.', 'skyline'],
  'Community Fridge': [['volunteering', 'food', 'free'], 'Fridge restock and clean', 'Bring cleaning spray if you have it. Two hours, many hands.', 'pantry'],
  'Mutual Aid Network': [['volunteering', 'free', 'community'], 'Winter coat drive', 'Drop off coats and gloves, or help sort by size.', 'pantry'],
  'Block Association': [['community', 'party'], 'Block party planning night', 'Food, music, and who closes the street. Kids welcome.', 'porch'],
  'Library Friends': [['arts', 'free', 'volunteering'], 'Used book sale', 'Sorting Friday night, selling Saturday. Every dollar goes to the branch.', 'leaves'],
  'Parks Coalition': [['outdoors', 'volunteering', 'free'], 'Park cleanup', 'Meet at the north gate. Bags and grabbers provided.', 'beds'],
  'Street Trees Crew': [['outdoors', 'volunteering'], 'Tree pit weeding', 'An hour on our block, then coffee.', 'leaves'],
  'Food Co-op': [['food', 'meeting'], 'Member orientation', 'How ordering works, and a tour of the storeroom.', 'tomatoes'],
  'Bike Crew': [['outdoors', 'sports', 'free'], 'Saturday group ride', 'An easy 15 miles along the river, no one dropped. Bring a spare tube.', 'bike'],
  'Run Club': [['sports', 'outdoors', 'free'], 'Turkey trot practice run', '5K at an easy pace, then bagels.', 'sunset'],
  'Choir': [['music', 'arts'], 'Winter concert', 'Doors at 6:30. Tell your friends, it’s free.', 'choir'],
  'Film Night': [['arts', 'party'], 'Outdoor screening', 'Blankets, popcorn, and a movie we voted on.', 'stage'],
  'Board Game Club': [['party', 'free'], 'Big game night', 'Bring a game you love. We’ll have snacks.', 'porch'],
  'Pickup Soccer': [['sports', 'outdoors', 'free'], 'Saturday pickup game', 'All levels. Bring a light and a dark shirt.', 'beds'],
  'Supper Club': [['food', 'party'], 'Potluck supper', 'Theme: soups from home. Bring a bowl.', 'feast'],
  'Open Mic': [['music', 'arts', 'party'], 'Open mic night', 'Sign up at the door. Five minutes each.', 'stage'],
  'Climbing Club': [['sports'], 'Intro climbing night', 'Shoes to borrow. First timers welcome.', 'skyline'],
  'Knitting Circle': [['arts', 'free'], 'Stitch and chat', 'Bring a project, or learn to cast on.', 'porch'],
  'Spanish Practice': [['workshop', 'free'], 'Intercambio night', 'Half Spanish, half English. All levels.', 'leaves'],
  'Study Group': [['workshop'], 'Exam review session', 'Bring the practice questions you got stuck on.', 'leaves'],
  'Design Studio': [['workshop', 'arts'], 'Portfolio review', 'Five minutes each, kind feedback.', 'skyline'],
  'Book Club': [['arts', 'free'], 'Book swap', 'Bring two books, leave with two books.', 'leaves'],
  'Coding Circle': [['workshop', 'free'], 'Build night', 'Bring a laptop and something you want to make.', 'skyline'],
  'Writing Workshop': [['workshop', 'arts'], 'Reading night', 'Share three pages. Listeners bring snacks.', 'leaves'],
  'Ceramics Class': [['workshop', 'arts'], 'Glazing day', 'Everything from the last three weeks gets glazed.', 'porch'],
  'House': [['family'], 'Deep clean day', 'Music on, everyone takes a room.', 'porch'],
  'Family': [['family', 'food'], 'Sunday dinner', 'Grandma’s recipe. Someone bring bread.', 'feast'],
  'Roommates': [['family'], 'Apartment meeting', 'Bills, chores, and the couch question.', 'porch'],
  'Neighborhood News': [['meeting'], 'Readers’ meetup', 'Tell us what we should be covering.', 'skyline'],
  'Gazette': [['meeting'], 'Story meeting', 'Pitches welcome from anyone.', 'skyline'],
  'Weekly': [['meeting'], 'Story meeting', 'Pitches welcome from anyone.', 'skyline'],
  'Bulletin': [['meeting'], 'Story meeting', 'Pitches welcome from anyone.', 'skyline'],
  'Dispatch': [['meeting'], 'Readers’ meetup', 'Tell us what we should be covering.', 'skyline'],
};

/** Announcement titles and bodies by kind. */
const UPDATES = {
  organizing: [
    ['Flyering this Saturday', 'Meet at 10 by the corner store. We have 400 flyers and two hours.'],
    ['Meeting moved to the library', 'Same time, the community room on the second floor. Elevator by the back door.'],
    ['We need two more volunteers', 'For the table at the farmers market on Sunday, 9 to noon. Reply here.'],
    ['Letter to the council: sign by Friday', 'The letter is in the vault. Add your name and building.'],
    ['Notes from last meeting', 'Three decisions, and who’s doing what. The full notes are in the forum.'],
    ['Thank you for showing up', 'Forty-one people at the hearing. They noticed.'],
  ],
  club: [
    ['New route this week', 'Same start, longer middle, coffee at the end.'],
    ['Bring a friend night', 'Anyone new gets the first round on us.'],
    ['Venue change for Thursday', 'The usual place is closed for a private event. We’ll be next door.'],
    ['Photos from last time are up', 'Check the photos. Tag yourself if you want.'],
    ['Dues for the season', 'Ten dollars, pay whoever is holding the jar.'],
    ['We hit 20 people!', 'Thanks for bringing your friends. Keep it coming.'],
  ],
  class: [
    ['Chapter 6 for next week', 'Read it before Thursday. Questions in the comments.'],
    ['Practice session on Sunday', 'Two hours at the library. Bring the questions you got stuck on.'],
    ['Room change', 'We’re in room 204 from now on.'],
    ['Share your notes here', 'If you took good notes last week, post them in the comments.'],
  ],
  house: [
    ['Rent is due on the 1st', 'Venmo the usual amount. I’ll send it on the 2nd.'],
    ['Plumber on Wednesday', 'Between 1 and 4. Water is off then.'],
    ['Recycling is now Tuesdays', 'The city changed it. Bins out Monday night.'],
    ['Who’s around for the holidays?', 'Someone has to water the plants.'],
  ],
  news: [
    ['Sunday issue is up', 'Five stories, two recipes, and the crossword.'],
    ['Looking for a photographer', 'For the market story. Paid in coffee and a byline.'],
    ['Tips welcome', 'Seen something we should cover? Reply here or message me.'],
    ['Story meeting on Monday', '7pm, upstairs at the café.'],
  ],
};
const COMMENTS = ['I can make it.', 'Count me in!', 'Thanks for organizing this.', 'Can I bring a friend?', 'Running 10 minutes late, save me a seat.', 'I’ll bring snacks.',
  'Is there parking nearby?', 'Great turnout last time 🙌', 'Can’t make this one, next time!', 'I have a folding table if we need one.', 'Love this.', 'Who has the keys?',
  'Sending to my neighbor too.', 'What time does it end?', 'I can help set up.', 'So glad we’re doing this.'];
/** @type {[string, string, string[]][]} */
const THREADS = [
  ['Who can bring a folding table on Saturday?', 'We need two. I can bring one.', ['I have one. I’ll drop it off at 9.', 'I can carry it over if someone has a car.']],
  ['Ideas for the next action', 'What should we focus on after the hearing? Throw out anything.', ['A petition at the farmers market?', 'Door-knocking on the east side.', 'A teach-in at the library.']],
  ['Translation help', 'Our flyers need Spanish and Chinese. Anyone?', ['I can do Spanish tonight.', 'My mom can check the Chinese.']],
  ['Notes from the last meeting', 'Three decisions and who’s doing what. Add anything I missed.', ['Thanks for writing this up!']],
  ['Carpool to the hearing', 'Who’s driving? I have three seats.', ['I need a ride from Lincoln.', 'I can take two from Eastside.', 'Leaving at 5:15.']],
  ['Snacks rotation', 'Let’s take turns bringing snacks. Sign up below.', ['I’ll do the first one.', 'Next week is mine.']],
];
const CHAT = [
  'Anyone have a phone charger I can borrow tonight?', 'Running late, start without me', 'That was so fun yesterday', 'Who’s bringing what on Saturday?',
  'I can do snacks', 'Does someone have the address?', 'Pinned the plan above', 'Thanks everyone 🙏', 'See you there!', 'Lol yes', 'Can we move it to 7?', '7 works',
  'Picture from last week 📸', 'Forgot my scarf at the meetup, anyone see it?', 'Got it, I’ll bring it Thursday', 'Weather looks good for the weekend'];
const BLOG_POSTS = {
  organizer: ['Forty-one people showed up to the hearing tonight. Forty-one!', 'Spent the morning knocking on doors on the east side. Everyone has a story about their heat.', 'Reminder that public comment is open until Friday. Two minutes, you can do it.'],
  creator: ['New song is almost done. The bridge is fighting me.', 'Shot the market this morning. The light was unreal.', 'Played my first set in a year tonight. Shaky, happy.'],
  student: ['Midterms are done. Sleeping for a week.', 'Found the best study spot in the library: third floor, by the maps.', 'Our group project is about bus stops and I can’t stop noticing them.'],
  household: ['Soup season has officially started in this house.', 'Kids built a fort out of the couch cushions. The couch is gone now.', 'We finally made a chore list. Morale is mixed.'],
  socializer: ['Hosting dinner Friday, the table fits ten, I invited fourteen.', 'Best brunch spot in the neighborhood? Asking for twelve friends.', 'Trivia team came in second. We were robbed.'],
  volunteer: ['Pantry served 112 families this Saturday. Thank you to everyone who came.', 'Our fridge was empty by noon. Restocking tomorrow at 9 if you can help.', 'Coached my first youth soccer game. We lost 6–1 and everyone had a great time.'],
  publisher: ['New issue is out: the bakery is closing, and the market is coming back.', 'Spent the day in the city archives. Our block used to be a farm.', 'If you have a tip for a story, my messages are open.'],
};
const BLOG_SCENES = { organizer: 'skyline', creator: 'stage', student: 'leaves', household: 'feast', socializer: 'pie', volunteer: 'pantry', publisher: 'skyline' };
const KIND_LABEL = { problem: 'Problem', missing: 'Wish', confusing: 'Confusing', praise: 'Praise' };

const photo = (id, scene, caption, shape) => ({ id, kind: 'image', src: demoPhoto(scene, shape), caption });

export function createYearDemo() {
  const data = /** @type {any} */ (YEAR_DATA);
  const ago = (days, hours = 10) => Date.now() - days * DAY - hours * 3600000;
  const idOf = (simId) => `y-${simId}`;

  // ── People ──
  const taken = new Set();
  const members = data.people.map(([simId, personaIndex, source, joinedAgo, satisfaction, , , activeDays]) => {
    const persona = PERSONA_KEYS[personaIndex];
    const first = FIRST[(simId * 7) % FIRST.length];
    let last = LAST[(simId * 11 + 3) % LAST.length];
    for (let n = 1; taken.has(`${first} ${last}`); n++) {
      // Try every last name once; after that, add a middle initial.
      last = n < LAST.length ? LAST[(simId * 11 + 3 + n) % LAST.length] : `${'ABCDEFGHJKLMNPRSTW'[n % 18]}. ${LAST[(simId + n) % LAST.length]}`;
    }
    taken.add(`${first} ${last}`);
    let username = `${first}${last[0]}`.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    while (taken.has(`@${username}`)) username += String((simId % 9) + 1);
    taken.add(`@${username}`);
    return {
      id: idOf(simId),
      name: `${first} ${last}`,
      username,
      email: `${username}@example.com`,
      initials: `${first[0]}${last[0]}`,
      color: COLORS[simId % COLORS.length],
      bio: BIOS[persona][simId % BIOS[persona].length],
      helpWith: simId % 3 === 0 ? HELP[persona].slice(0, 2) : [],
      password: null,
      location: { placeId: areaOf(simId), radiusMiles: 5 },
      createdAt: ago(joinedAgo),
      // Marks a simulated person: kept off the sign-in screen's list, like the growth model's people.
      growth: { year: true, persona, source, joinedAgo, satisfaction, activeDays },
    };
  });
  const byId = new Map(members.map((m) => [m.id, m]));
  const firstName = (id) => (id === LEO ? 'Leo' : byId.get(id)?.name.split(' ')[0] ?? 'Someone');
  const fullName = (id) => (id === LEO ? 'Leo L' : byId.get(id)?.name ?? 'Someone');
  const personaOf = (id) => byId.get(id)?.growth.persona ?? 'socializer';

  const conversations = [];
  const reactions = {};
  const notifications = [];
  let noteCount = 0;
  const notify = (actorId, kind, text, spaceId, moduleId, itemId, href, hours, read = false) => {
    notifications.push({ id: `y-note-${++noteCount}`, recipientId: LEO, actorId, kind, text, spaceId, moduleId, itemId, href, createdAt: Date.now() - hours * 3600000, read });
  };

  // ── Groups ──
  // Leo joins four: the first club near him becomes the Juniper Lane Bike Crew (he runs it),
  // and he's a member of the first organizing group, newsletter, and class near him.
  const local = (g) => LOCAL.includes(areaOf(g[2]));
  const leoPicks = {
    club: data.groups.find((g) => g[1] === 'club' && local(g))?.[0],
    organizing: data.groups.find((g) => g[1] === 'organizing' && local(g))?.[0],
    news: data.groups.find((g) => g[1] === 'news' && local(g))?.[0],
    class: data.groups.find((g) => g[1] === 'class' && local(g))?.[0],
  };
  const leoGroupIds = new Set(Object.values(leoPicks).filter((x) => x != null));
  const leoSpaces = [];

  const used = new Set();
  const spaces = data.groups.map(([gid, kind, ownerSim, isPublic, createdAgo, meetings, liveSims]) => {
    const owner = idOf(ownerSim);
    const leoIn = leoGroupIds.has(gid);
    const leoRuns = gid === leoPicks.club;
    const area = leoRuns ? 'juniper' : areaOf(ownerSim);
    const names = GROUP_NAMES[kind];
    // Each kind's names in turn; a name used in this area already moves on to the next.
    let base = leoRuns ? 'Bike Crew' : names[gid % names.length];
    let name = kind === 'house' ? `${byId.get(owner)?.name.split(' ').slice(-1)[0] ?? 'Our'} ${base}` : `${AREA_NAMES[area]} ${base}`;
    for (let n = 1; used.has(name) && n < names.length; n++) {
      base = names[(gid + n) % names.length];
      name = kind === 'house' ? `${byId.get(owner)?.name.split(' ').slice(-1)[0] ?? 'Our'} ${base}` : `${AREA_NAMES[area]} ${base}`;
    }
    while (used.has(name)) name = `${name} ${(gid % 7) + 2}`;
    used.add(name);
    const [tags, specialTitle, specialNotes, scene] = FLAVOR[base] ?? FLAVOR[names[0]];

    let memberIds = [owner, ...liveSims.map(idOf).filter((id) => id !== owner && byId.has(id))];
    if (leoIn) memberIds = leoRuns ? [LEO, ...memberIds] : [...memberIds.slice(0, 3), LEO, ...memberIds.slice(3)];
    const lead = memberIds[0];
    const roles = Object.fromEntries(memberIds.map((id, i) => [id, i === 0 ? 'owner' : i <= 2 ? 'admin' : 'member']));
    const spaceId = `y-grp-${gid}`;
    const modules = createStarterGroupModules(kind).map((m) => ({ ...m, id: `${spaceId}-${m.type}`, data: m.data ?? getModuleType(m.type).createInitialData() }));
    const others = memberIds.filter((id) => id !== lead && id !== LEO);
    const someone = (k) => others[(gid * 7 + k * 5) % Math.max(1, others.length)] ?? lead;
    const several = (k, n) => [...new Set(Array.from({ length: n }, (_, i) => someone(k + i * 3)))];
    const daysOld = Math.max(10, createdAgo);
    const s = (k) => gid * 101 + k; // a seed

    // ── Announcements: a welcome, then a few weeks of updates with comments ──
    const news = modules.find((m) => m.type === 'announcements');
    if (news) {
      const updates = UPDATES[kind];
      const count = 3 + (gid % 3);
      /** @type {any[]} */
      const posts = Array.from({ length: count }, (_, k) => {
        const [title, body] = updates[(gid + k) % updates.length];
        const daysBack = Math.min(daysOld - 1, 1 + k * 4 + (gid % 3));
        const author = k % 2 ? someone(k) : lead;
        const comments = several(k + 10, Math.floor(R(s(k)) * 4)).map((id, c) => ({ id: `${spaceId}-p${k}c${c}`, authorId: id, body: pick(COMMENTS, s(k * 10 + c)), createdAt: ago(Math.max(0, daysBack - 1), 6 - c) }));
        return { id: `${spaceId}-p${k}`, authorId: author, title, body, pinned: false, createdAt: ago(daysBack, 3 + (k % 5)), seenBy: others.slice(0, 6 + (k % 8)), comments };
      });
      // Organizing groups ask who's coming and who'll bring what; clubs and houses run a poll.
      if (kind === 'organizing') {
        posts[0] = { ...posts[0], title: 'Tabling at the market Saturday', body: 'We’ll have a table at the farmers market from 10 to 1. Sign up for a slot or something to bring.',
          rsvp: { when: `Sat 10am · ${AREA_NAMES[area]} market`, answers: Object.fromEntries(several(30, 4).map((id, i) => [id, i === 3 ? 'maybe' : 'going'])) },
          signups: [
            { id: `${spaceId}-su1`, label: '10 to 11:30', spots: 3, memberIds: several(40, 2) },
            { id: `${spaceId}-su2`, label: '11:30 to 1', spots: 3, memberIds: several(41, 1) },
            { id: `${spaceId}-su3`, label: 'Bring a folding table', spots: 1, memberIds: [] },
          ] };
      } else if (kind === 'club' || kind === 'house') {
        const options = kind === 'club' ? ['Thursday', 'Friday', 'Saturday morning'] : ['Pizza', 'Tacos', 'Dumplings'];
        posts[1] = { ...posts[1], title: kind === 'club' ? 'Which night works best?' : 'What should we order Friday?', body: 'Vote below. I’ll call it on Wednesday.',
          poll: { id: `${spaceId}-poll`, question: kind === 'club' ? 'Best night for the meetup?' : 'Friday dinner?', multiple: false, anonymous: false, closesOn: null, closed: false, chosenId: null, createdBy: posts[1].authorId, createdAt: posts[1].createdAt,
            options: options.map((text, i) => ({ id: `${spaceId}-o${i}`, text, when: null })),
            votes: Object.fromEntries(several(50, 5).map((id, i) => [id, [`${spaceId}-o${(i + gid) % 3}`]])) } };
      }
      posts.push({ id: `${spaceId}-welcome`, authorId: lead, title: `Welcome to ${name}`, body: `We meet ${MEETS[kind]}. Introduce yourself in the comments, and check the calendar for what’s next.`, pinned: true, createdAt: ago(daysOld), seenBy: others.slice(0, 14),
        comments: several(60, 3).map((id, c) => ({ id: `${spaceId}-wc${c}`, authorId: id, body: ['Hi everyone!', 'Glad to be here.', 'Hello from down the street 👋'][c], createdAt: ago(Math.max(1, daysOld - 2 - c)) })) });
      news.data.posts = posts;
    }

    // ── Events: past meetings with who came, the next one, and a bigger event ──
    const calendar = modules.find((m) => m.type === 'calendar' || (m.type === 'events' && m.data?.ownEvents)) ?? modules.find((m) => Array.isArray(m.data?.events));
    const eventIds = [];
    if (calendar) {
      const every = kind === 'organizing' ? 14 : 7;
      const nextDate = kind === 'house' ? nextWeekday(0) : nextWeekday(1 + (gid % 5));
      const time = kind === 'club' ? '18:30' : '19:00';
      const visibility = isPublic ? 'public' : 'group';
      const evBase = { kind: 'event', allDay: false, time, endTime: '20:30', location: AREA_NAMES[area], area, color: 'green', createdBy: lead, repeat: 'none', visibility, capacity: null, inviteeIds: [] };
      const past = [];
      for (let k = 1; k <= 4; k++) {
        const date = shiftDate(nextDate, -every * k);
        if ((Date.now() - new Date(date).getTime()) / DAY > daysOld) break;
        const asked = memberIds.filter((id, i) => id !== LEO && R(s(200 + k * 50 + i)) < 0.65).slice(0, 18);
        const rsvps = Object.fromEntries(asked.map((id, i) => [id, i % 6 === 5 ? 'maybe' : 'going']));
        if (leoIn && k <= 2) rsvps[LEO] = 'going';
        past.push({ ...evBase, id: `${spaceId}-m${k}`, title: MEETINGS[kind], date, tags: ['meeting'], notes: '', rsvps,
          attendeeIds: Object.keys(rsvps).filter((id, i) => rsvps[id] === 'going' && i % 5 !== 4), createdAt: ago(every * k + 6) });
      }
      const rsvps = Object.fromEntries(memberIds.filter((id) => id !== LEO).slice(0, 18).map((id, i) => [id, i % 5 === 4 ? 'maybe' : 'going']));
      const next = {
        ...evBase, id: `${spaceId}-meet`, title: MEETINGS[kind], date: nextDate, tags: ['meeting'], notes: `We’ve met ${meetings} times so far.`,
        repeat: kind === 'organizing' ? 'none' : 'weekly', rsvps, attendeeIds: Object.keys(rsvps).filter((id) => rsvps[id] === 'going'), createdAt: ago(daysOld),
        pastVisits: Object.fromEntries(memberIds.slice(0, 6).map((id) => [id, Math.min(meetings, 3 + (id.length % 9))])),
      };
      const specialRsvps = Object.fromEntries(memberIds.filter((id) => id !== LEO && R(s(900) + id.length) < 0.8).slice(0, 26).map((id, i) => [id, i % 4 === 3 ? 'maybe' : 'going']));
      const special = {
        ...evBase, id: `${spaceId}-special`, title: specialTitle, date: daysFromToday(3 + (gid % 16)), time: tags.includes('outdoors') ? '10:00' : '18:00', endTime: tags.includes('outdoors') ? '12:30' : '21:00',
        location: `${AREA_NAMES[area]}`, tags, notes: specialNotes, color: 'purple', capacity: kind === 'club' && gid % 3 === 0 ? 30 : null,
        rsvps: specialRsvps, attendeeIds: Object.keys(specialRsvps).filter((id) => specialRsvps[id] === 'going'), createdAt: ago(6 + (gid % 5)),
      };
      calendar.data.events = [...(calendar.data.events ?? []), ...past, next, special];
      eventIds.push(next.id, special.id);
    }

    // ── Forum threads (organizing groups) ──
    const forum = modules.find((m) => m.type === 'forum');
    if (forum) {
      forum.data.threads = Array.from({ length: 3 + (gid % 3) }, (_, k) => {
        const [title, body, answers] = THREADS[(gid + k) % THREADS.length];
        const author = k === 0 ? lead : someone(80 + k);
        const daysBack = Math.min(daysOld - 1, 2 + k * 5);
        const replies = answers.map((text, r) => ({ id: `${spaceId}-t${k}r${r}`, authorId: someone(90 + k * 4 + r), body: text, createdAt: ago(Math.max(0, daysBack - 1 - r), 4), votes: {} }));
        return { id: `${spaceId}-t${k}`, authorId: author, title, body, tag: '', createdAt: ago(daysBack), votes: Object.fromEntries(several(100 + k, 2 + (k % 4)).map((id) => [id, 1])), followers: [author], replies };
      });
    }

    // ── Photos (clubs) ──
    const photos = modules.find((m) => m.type === 'generalfeed' && m.title === 'Photos');
    if (photos) {
      photos.data.posts = Array.from({ length: 3 }, (_, k) => {
        const id = `${spaceId}-ph${k}`;
        const author = k === 0 ? lead : someone(110 + k);
        reactions[`feedpost:${id}`] = { likes: several(120 + k, 2 + (gid + k) % 5).concat(leoIn && k === 0 ? [LEO] : []), comments: k === 0 ? [{ id: `${id}-c1`, authorId: someone(130), body: 'What a night!', createdAt: ago(1 + k * 6, 2) }] : [] };
        return { id, authorId: author, createdAt: ago(1 + k * 6, 5), editedAt: null, text: ['From last week 📸', 'Good crowd tonight.', 'This group 💛'][k], media: [photo(`${id}-m`, k === 1 ? 'sunset' : scene, '', k === 2 ? 'square' : 'wide')], attachments: [] };
      });
    }

    // ── Articles and quick updates (newsletters) ──
    const articles = modules.find((m) => m.type === 'articles');
    if (articles) {
      const writers = [lead, someone(140), someone(141)];
      articles.data.articles = [
        { id: `${spaceId}-a1`, authorId: writers[0], kicker: 'Local', headline: `What’s changing on ${AREA_NAMES[area]}’s main street`, dek: 'New bike lanes, a closing bakery, and the market that’s coming back in spring.',
          hero: { src: demoPhoto('skyline', 'wide'), caption: `${AREA_NAMES[area]} at dusk.`, credit: `Photo: ${firstName(someone(1))}` },
          html: '<p>Three things are changing this winter, and two of them you’ll notice on your way to work.</p><p>The city finished the protected bike lane in October. Shop owners we talked to are split: some say more people walk by; others miss the parking.</p><blockquote>“We’ve been here 31 years. We’ll figure it out.”</blockquote><p>The Saturday market returns in April, with twice as many stalls.</p>',
          status: 'published', createdAt: ago(6), publishedAt: ago(5), updatedAt: ago(5), history: [] },
        { id: `${spaceId}-a2`, authorId: writers[1], kicker: 'Food', headline: 'The best cheap lunch within ten blocks', dek: 'We ate at fourteen places so you don’t have to.', hero: null,
          html: '<p>Our rule: under twelve dollars, ready in ten minutes, and good enough to come back for.</p><p>Number one surprised all of us: a dumpling counter inside a laundromat.</p>',
          status: 'published', createdAt: ago(14), publishedAt: ago(13), updatedAt: ago(13), history: [] },
        { id: `${spaceId}-a3`, authorId: writers[2], kicker: 'Schools', headline: 'The after-school program that runs on volunteers', dek: 'Forty kids, six adults, and a lot of glue sticks.', hero: null,
          html: '<p>Every weekday at 3:15, the cafeteria fills up again. Parents started it three years ago when the old program closed.</p><p>They need two more volunteers on Thursdays.</p>',
          status: 'published', createdAt: ago(24), publishedAt: ago(23), updatedAt: ago(23), history: [] },
      ];
    }
    const quick = modules.find((m) => m.type === 'textfeed');
    if (quick) {
      quick.data.posts = ['Road closed on the avenue Saturday for the parade.', 'The library extended its hours: open until 8 on weekdays.', 'Lost cat near the park: orange, answers to Pumpkin.', 'Correction: the market opens at 9, not 8.']
        .slice(0, 2 + (gid % 3)).map((text, k) => ({ id: `${spaceId}-q${k}`, authorId: k ? someone(150 + k) : lead, createdAt: ago(k * 3, 7), editedAt: null, text, media: [], attachments: [] }));
    }

    // ── Class assignments ──
    const work = modules.find((m) => m.type === 'submissions');
    if (work) {
      const sub = (memberId, k, status) => ({ memberId, status, turnedInAt: ago(2 + k, 3), items: [{ id: `${spaceId}-s${k}-${memberId}`, kind: 'text', text: 'My notes are attached. I got stuck on the last part.' }], grade: null, feedback: '' });
      work.data.assignments = [
        { id: `${spaceId}-as1`, title: 'Week 6 practice', createdBy: lead, createdAt: ago(9), instructions: 'Do the exercises at the end of chapter 6. Bring questions.', due: daysFromToday(-2), dueTime: '23:59', points: 10,
          submissions: several(160, 5).map((id, k) => sub(id, k, 'turned-in')) },
        { id: `${spaceId}-as2`, title: 'Week 7 practice', createdBy: lead, createdAt: ago(2), instructions: 'Chapter 7, the first ten questions.', due: daysFromToday(5), dueTime: '23:59', points: 10, submissions: [] },
      ];
    }

    // ── A group chat (clubs and households) ──
    if (kind === 'club' || kind === 'house') {
      const convId = `y-conv-${gid}`;
      modules.push({ id: `${spaceId}-chat`, type: 'chat', title: kind === 'house' ? 'House chat' : 'Group chat', span: 6, rows: 12, data: { conversationId: convId } });
      const count = 6 + (gid % 5);
      const messages = Array.from({ length: count }, (_, k) => {
        const author = leoIn && k === count - 3 ? LEO : someone(170 + k);
        const minutes = (count - k) * (60 + (gid % 7) * 30);
        return { id: `${convId}-${k}`, authorId: author, body: CHAT[(gid + k) % CHAT.length], createdAt: Date.now() - minutes * 60000, editedAt: null, deleted: false, reactions: k % 4 === 1 ? { '👍': several(180 + k, 2) } : {} };
      });
      const readAt = Object.fromEntries(memberIds.slice(0, 12).map((id) => [id, messages[messages.length - 1].createdAt]));
      if (leoIn) readAt[LEO] = messages[messages.length - 3].createdAt; // two he hasn't read
      conversations.push({ id: convId, kind: 'group', name: kind === 'house' ? 'House chat' : 'Group chat', memberIds: [], spaceId, moduleId: `${spaceId}-chat`, createdAt: ago(daysOld), messages, readAt });
    }

    // ── The group Leo runs and the organizing group get a task list ──
    if (leoIn && (leoRuns || kind === 'organizing')) {
      const t = (id, text, fields) => ({ id: `${spaceId}-${id}`, text, done: false, assigneeIds: [], due: '', priority: '', notes: '', subtasks: [], createdAt: ago(4), ...fields });
      modules.push({ id: `${spaceId}-todo`, type: 'todo', title: 'Tasks', span: 6, rows: 12, data: { tasks: leoRuns ? [
        t('k1', 'Plan the Saturday route', { assigneeIds: [LEO], due: daysFromToday(2), priority: 'high' }),
        t('k2', 'Ask the bike shop about a discount', { assigneeIds: [someone(190)], due: daysFromToday(6) }),
        t('k3', 'Find a sweep rider for the back of the group', {}),
        t('k4', 'Print route cards', { assigneeIds: [someone(191)], done: true }),
      ] : [
        t('k1', 'Reserve the library room for December', { assigneeIds: [someone(192)], due: daysFromToday(3), priority: 'medium' }),
        t('k2', 'Make the sign-in sheet for the hearing', { assigneeIds: [LEO], due: daysFromToday(4) }),
        t('k3', 'Call the council member’s office', {}),
        t('k4', 'Count the petition signatures', { assigneeIds: [someone(193), someone(194)], done: true }),
      ] } });
    }

    const space = {
      id: spaceId, kind: 'group', name, area,
      description: `${GROUP_TYPES[kind]} in ${AREA_NAMES[area]}. Meets ${MEETS[kind]}.`,
      visibility: isPublic || leoRuns ? 'public' : 'private', joining: isPublic || leoRuns ? 'request' : 'invite', groupType: GROUP_TYPES[kind], template: kind,
      memberIds, roles, permissions: {}, appearance: {}, joinRequests: [],
      joinedAt: Object.fromEntries(memberIds.map((id) => [id, id === LEO ? ago(Math.min(daysOld, 40)) : byId.get(id)?.createdAt ?? ago(daysOld)])),
      ...(isPublic || leoRuns ? { tabs: [{ id: 'home', name: 'Home', visibility: 'public' }] } : {}),
      modules, createdAt: ago(daysOld),
    };
    if (leoIn) leoSpaces.push({ space, kind, leoRuns, eventIds, someone, news, forum });
    return space;
  });

  // ── Friendships from the model ──
  const friendships = data.friendships.map(([a, b], i) => {
    const later = Math.max(byId.get(idOf(a))?.createdAt ?? Date.now(), byId.get(idOf(b))?.createdAt ?? Date.now());
    return { id: `y-fr-${i + 1}`, from: idOf(a), to: idOf(b), status: 'accepted', createdAt: later + DAY, respondedAt: later + DAY + 3600000 };
  });

  // ── Leo's friends: people from his four groups, and a few more ──
  const leoFriends = [];
  for (const { space } of leoSpaces) for (const id of space.memberIds.filter((x) => x !== LEO).slice(0, 9)) if (!leoFriends.includes(id)) leoFriends.push(id);
  for (const m of members) if (leoFriends.length < 36 && m.location.placeId === 'juniper' && !leoFriends.includes(m.id)) leoFriends.push(m.id);
  leoFriends.forEach((id, i) => {
    const since = Math.max(byId.get(id)?.createdAt ?? 0, ago(200)) + DAY * (1 + (i % 9));
    friendships.push({ id: `y-fr-leo-${i}`, from: i % 3 ? id : LEO, to: i % 3 ? LEO : id, status: 'accepted', createdAt: Math.min(since, ago(1)), respondedAt: Math.min(since + 7200000, ago(0, 20)) });
  });
  // Three people asked to be his friend; he asked one.
  const strangers = members.filter((m) => !leoFriends.includes(m.id) && m.location.placeId === 'crestline').slice(0, 4).map((m) => m.id);
  strangers.slice(0, 3).forEach((id, i) => friendships.push({ id: `y-fr-ask-${i}`, from: id, to: LEO, status: 'pending', createdAt: ago(0, 3 + i * 9), respondedAt: null }));
  if (strangers[3]) friendships.push({ id: 'y-fr-ask-leo', from: LEO, to: strangers[3], status: 'pending', createdAt: ago(2), respondedAt: null });

  // ── Blogs: Leo's friends, and about one person in five ──
  const blogs = [];
  const bloggers = members.filter((m, i) => leoFriends.includes(m.id) || i % 5 === 0);
  for (const m of bloggers) {
    const persona = personaOf(m.id);
    const close = leoFriends.includes(m.id);
    const sim = Number(m.id.slice(2));
    const lines = BLOG_POSTS[persona];
    const count = close ? 2 + (sim % 2) : 1 + (sim % 2);
    const posts = Array.from({ length: count }, (_, k) => {
      const id = `${m.id}-bp${k}`;
      const hours = close ? 5 + k * 40 + (sim % 30) : 12 + k * 60 + (sim % 90);
      const friendsHere = friendships.filter((f) => f.status === 'accepted' && (f.from === m.id || f.to === m.id)).map((f) => (f.from === m.id ? f.to : f.from));
      const likes = friendsHere.filter((id2, j) => R(sim * 13 + k * 7 + j) < 0.55);
      reactions[`feedpost:${id}`] = {
        likes,
        comments: close && k === 0 ? [{ id: `${id}-c1`, authorId: friendsHere.find((x) => x !== LEO) ?? LEO, body: pick(['So good!', 'Wish I’d been there.', 'Yes!!', 'Proud of you.', 'Save me a seat next time.'], sim), createdAt: Date.now() - (hours - 2) * 3600000 }] : [],
      };
      return { id, authorId: m.id, createdAt: Date.now() - hours * 3600000, editedAt: null, text: lines[(sim + k) % lines.length], media: close && k === 0 && sim % 2 === 0 ? [photo(`${id}-m`, BLOG_SCENES[persona], '', 'wide')] : [], attachments: [] };
    });
    blogs.push({
      id: `blog-${m.id}`, kind: 'blog', name: `${m.name.split(' ')[0]}’s blog`, description: m.bio, memberIds: [m.id], appearance: {},
      modules: [
        { id: `blog-${m.id}-feed`, type: 'generalfeed', title: 'Posts', span: 8, rows: 16, data: { posts, events: [] } },
        { id: `blog-${m.id}-about`, type: 'note', title: 'About me', span: 4, rows: 8, data: { title: '', html: `<p>${m.bio}</p>`, updatedAt: null } },
      ],
    });
  }

  // ── Leo in his groups: RSVPs, people asking to join, likes, and notifications ──
  for (const { space, kind, leoRuns, eventIds, someone, news, forum } of leoSpaces) {
    const calendar = space.modules.find((m) => (m.data?.events ?? []).some((e) => e.id === eventIds[0]));
    const events = calendar?.data.events ?? [];
    const next = events.find((e) => e.id === eventIds[0]);
    const special = events.find((e) => e.id === eventIds[1]);
    if (leoRuns) {
      // His group: he hosts the meetup and the Saturday ride, and two people asked to join.
      for (const e of [next, special]) if (e) { e.createdBy = LEO; e.rsvps[LEO] = 'going'; e.attendeeIds = [...new Set([...e.attendeeIds, LEO])]; }
      space.joinRequests = strangers.slice(0, 2).map((id, i) => ({ memberId: id, at: ago(0, 4 + i * 20) }));
      strangers.slice(0, 2).forEach((id, i) => notify(id, 'approval', `${fullName(id)} asked to join ${space.name}`, space.id, null, null, `#settings-${space.id}`, 4 + i * 20));
      if (special) notify(someone(1), 'event', `${fullName(someone(1))} and ${Object.keys(special.rsvps).length - 2} others are going to “${special.title}”`, space.id, calendar.id, special.id, `#event-${special.id}`, 7);
      const photos = space.modules.find((m) => m.type === 'generalfeed' && m.title === 'Photos');
      if (photos?.data.posts[0]) notify(someone(2), 'like', `${fullName(someone(2))} liked a photo in ${space.name}`, space.id, photos.id, photos.data.posts[0].id, `#module-${photos.id}`, 26, true);
    } else if (kind === 'organizing') {
      if (special) notify(space.memberIds[0], 'event', `New event in ${space.name}: “${special.title}”`, space.id, calendar.id, special.id, `#event-${special.id}`, 11);
      if (forum?.data.threads[1]) {
        const t = forum.data.threads[1];
        t.replies.push({ id: `${t.id}-leo`, authorId: LEO, body: 'I can help with this. I’ll bring the clipboard.', createdAt: ago(1, 2), votes: { [someone(3)]: 1 } });
        t.replies.push({ id: `${t.id}-leo2`, authorId: someone(4), body: '@leo thank you! I’ll put you on the list.', createdAt: ago(0, 18), votes: {} });
        t.followers = [...new Set([...t.followers, LEO])];
        notify(someone(4), 'reply', `${fullName(someone(4))} replied to you in “${t.title}” (${space.name})`, space.id, forum.id, t.id, `#module-${forum.id}`, 18);
      }
      const tasks = space.modules.find((m) => m.type === 'todo');
      if (tasks) notify(space.memberIds[0], 'assigned', `${fullName(space.memberIds[0])} assigned you “Make the sign-in sheet for the hearing” (${space.name})`, space.id, tasks.id, `${space.id}-k2`, `#module-${tasks.id}`, 30);
    } else if (kind === 'news') {
      // He follows along; one comment from him, and a reply to it.
      const post = news?.data.posts?.[1];
      if (post) {
        post.comments.push({ id: `${post.id}-leo`, authorId: LEO, body: 'Happy to take photos if you still need someone.', createdAt: ago(2, 5) });
        post.comments.push({ id: `${post.id}-leo-r`, authorId: space.memberIds[0], body: 'Yes please! I’ll message you.', createdAt: ago(1, 20) });
        notify(space.memberIds[0], 'reply', `${fullName(space.memberIds[0])} replied to your comment on “${post.title}” (${space.name})`, space.id, news.id, post.id, `#module-${news.id}`, 44, true);
      }
    } else if (kind === 'class' && special) {
      notify(space.memberIds[0], 'invited', `${fullName(space.memberIds[0])} invited you to the event “${special.title}” (${space.name})`, space.id, calendar.id, special.id, `#event-${special.id}`, 15);
    }
  }
  // Friends: who accepted his request, and a like on his blog.
  leoFriends.filter((_, i) => i % 3 === 0).slice(0, 2).forEach((id, i) => notify(id, 'friend', `${fullName(id)} accepted your friend request`, null, null, null, `#blog-${id}`, 20 + i * 30, i > 0));
  strangers.slice(0, 3).forEach((id, i) => notify(id, 'friend', `${fullName(id)} wants to be your friend`, null, null, null, '#feed-friends', 3 + i * 9));
  const likers = leoFriends.slice(0, 5);
  reactions['feedpost:leo-fp-2'] = { likes: likers.slice(0, 4), comments: [{ id: 'y-c-leo-2', authorId: likers[0], body: 'My back tire thanks you in advance.', createdAt: ago(0, 22) }] };
  reactions['feedpost:leo-fp-3'] = { likes: likers.slice(1, 5), comments: [{ id: 'y-c-leo-3', authorId: likers[2], body: 'I have a spare cable, I’ll bring it Saturday.', createdAt: ago(2, 6) }] };
  notify(likers[0], 'reply', `${fullName(likers[0])} commented on your post`, 'blog-m-leo', 'leo-feed', 'leo-fp-2', '#blog-m-leo', 22);
  notify(likers[1], 'like', `${fullName(likers[1])} and 3 others liked your post`, 'blog-m-leo', 'leo-feed', 'leo-fp-3', '#blog-m-leo', 50, true);

  // ── Leo's messages with his new friends ──
  const dm = (n, friendId, lines, unread) => {
    const id = `y-conv-leo-${n}`;
    const messages = lines.map(([fromLeo, text, minutes], k) => ({ id: `${id}-${k}`, authorId: fromLeo ? LEO : friendId, body: text, createdAt: Date.now() - minutes * 60000, editedAt: null, deleted: false, reactions: {} }));
    const last = messages[messages.length - 1].createdAt;
    conversations.push({ id, kind: 'direct', name: '', memberIds: [LEO, friendId], spaceId: null, moduleId: null, createdAt: messages[0].createdAt - 60000, messages,
      readAt: { [LEO]: unread ? messages[messages.length - 1 - unread].createdAt : last, [friendId]: last } });
  };
  const [f1, f2, f3, f4] = leoFriends;
  if (f1) dm(1, f1, [[0, 'Are you leading the ride Saturday?', 60 * 26], [1, 'Yes! 10am at the north gate.', 60 * 25], [0, 'Can I bring my cousin? She’s new to riding.', 95], [0, 'She has a bike, just slow 😅', 94]], 2);
  if (f2) dm(2, f2, [[1, 'Thanks for the cable!', 60 * 50], [0, 'Anytime. How’s the pedalboard?', 60 * 49], [1, 'Loud.', 60 * 48]], 0);
  if (f3) dm(3, f3, [[0, 'Saw your post about the hearing. Want to carpool?', 60 * 8], [1, 'Yes, I can drive.', 60 * 7], [0, 'Perfect, I’ll be at the corner at 5:15.', 40]], 1);
  if (f4) dm(4, f4, [[0, `Hi Leo! ${firstName(f1)} said you fix bikes?`, 60 * 30 * 24], [1, 'I do! Bring it to the Saturday pantry.', 60 * 29 * 24]], 0);

  // When Leo last opened each of his new groups.
  const visits = Object.fromEntries(leoSpaces.map(({ space }, i) => [space.id, ago(0, 5 + i * 14)]));
  // When everyone else last opened theirs: most within the week; about one in twelve has drifted off (Group health lists them).
  const othersVisits = {};
  for (const space of spaces) {
    space.memberIds.forEach((id, i) => {
      if (id === LEO) return;
      const r = R(Number(id.slice(2)) * 31 + i);
      const daysBack = r < 0.08 ? 35 + Math.floor(r * 400) : Math.floor(r * 8);
      (othersVisits[id] ??= {})[space.id] = Math.max(space.joinedAt[id] ?? 0, ago(daysBack, (i * 3) % 20));
    });
  }

  // ── 3den Community: the year's feedback, one thread per theme ──
  const voices = new Set();
  for (const t of data.themes) { t.voters.forEach((id) => voices.add(idOf(id))); t.quotes.forEach(([id]) => voices.add(idOf(id))); }
  const communityMembers = ['m-leo', ...[...voices].filter((id) => byId.has(id))];
  const threads = data.themes.map((t, i) => {
    const authorSim = t.quotes[0]?.[0];
    const author = authorSim ? idOf(authorSim) : 'm-leo';
    const votes = Object.fromEntries(t.voters.map((id) => [idOf(id), 1]));
    const body = [
      t.ask ? `What would fix it: ${t.ask}` : 'Keep this.',
      `${t.people} ${t.people === 1 ? 'person' : 'people'} raised this ${t.count} ${t.count === 1 ? 'time' : 'times'} this year.`,
      t.status === 'shipped' ? 'Status: in 3den.' : 'Status: not built yet.',
    ].join('\n\n');
    return {
      id: `y-fb-${t.id}`, authorId: author, title: t.title, body, tag: KIND_LABEL[t.kind] ?? 'General',
      createdAt: ago(Math.max(1, t.firstDaysAgo)), pinned: i < 3, locked: false, votes, followers: [author], seenAt: { 'm-leo': ago(0) },
      replies: t.quotes.slice(1).map(([simId, quote, daysAgo], k) => ({ id: `y-fb-${t.id}-r${k}`, authorId: idOf(simId), body: quote, createdAt: ago(Math.max(1, daysAgo)), votes: {} })),
    };
  });
  const community = {
    id: 'y-community', kind: 'group', name: '3den Community',
    description: 'Ideas, problems, and praise from a year of people using 3den. Vote for what matters to you.',
    visibility: 'public', joining: 'open', groupType: 'Community',
    memberIds: communityMembers,
    roles: { 'm-leo': 'owner' },
    permissions: {}, appearance: {}, joinRequests: [],
    joinedAt: Object.fromEntries(communityMembers.map((id) => [id, byId.get(id)?.createdAt ?? ago(365)])),
    tabs: [{ id: 'home', name: 'Home', visibility: 'public' }],
    modules: [
      { id: 'y-community-news', type: 'announcements', title: 'From the 3den team', span: 12, rows: 9, data: { posts: [
        { id: 'y-community-p1', authorId: 'm-leo', title: 'What we heard this year', pinned: true, createdAt: ago(1), seenBy: [], comments: [],
          body: `${data.totals.feedbackPeople.toLocaleString('en-US')} of you told us something this year, ${data.totals.feedback.toLocaleString('en-US')} times in all. Every theme has a thread below. Vote for what you want next.` },
      ] } },
      { id: 'y-community-forum', type: 'forum', title: 'Ideas and problems', span: 12, rows: 24, data: {
        tags: ['Problem', 'Wish', 'Confusing', 'Praise'],
        settings: { defaultSort: 'top', guidelines: 'One idea per thread. Vote instead of “+1”.' },
        threads,
      } },
    ],
    createdAt: ago(365),
  };

  return { members, spaces: [...spaces, community, ...blogs], friendships, conversations, notifications, reactions, visits, othersVisits };
}
