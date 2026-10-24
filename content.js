'use strict';

// All the words in the game live here.
// Medical stuff follows the CDC's heat illness guidance
// (cdc.gov/extreme-heat). If you change it, double check it there.

const INTRO = [
  "The storm knocked the power out on your street two days ago.",
  "It's 3 PM and 103° outside. Your house feels even hotter.",
  "The library on Main St. opened as a cooling center. Walk there.",
  "Your neighbors lost power too. Check on them along the way.",
];

// Fact signs around the neighborhood. Numbers come straight from the
// sources listed in the README. Don't add stats that aren't sourced.
const HCPH = 'Harris County Public Health, Health Impacts of Excessive Heat in Harris County (2024)';
const FACTS = [
  {
    title: '7,627 people',
    body: 'That\'s how many heat-related illnesses were recorded in Harris County from 2019 to 2023.',
    short: '7,627 heat-related illnesses in Harris County, 2019 to 2023.',
    source: HCPH,
  },
  {
    title: 'Up 329%',
    body: 'Heat-related illnesses in Harris County increased 329% between 2019 and 2023.',
    short: 'Heat illness in Harris County rose 329% from 2019 to 2023.',
    source: HCPH,
  },
  {
    title: 'The 103° line',
    body: 'A heat index of 103°F is the National Weather Service threshold where heat becomes dangerous and can lead to heat exhaustion or heat stroke. 61% of Harris County\'s heat illnesses happened on days the heat index went over 103°F.',
    short: '61% of heat illnesses happened on days the heat index passed 103°F.',
    source: HCPH,
  },
  {
    title: 'It\'s getting hotter',
    body: 'Harris County\'s average temperature has risen 0.70 to 0.75°F per decade since 1975. More days over 100°F and more nights over 80°F are expected.',
    short: 'Harris County is warming 0.70 to 0.75°F per decade since 1975.',
    source: HCPH,
  },
  {
    title: 'Who gets hit hardest',
    body: 'Outdoor workers, children, older adults, and people with preexisting health conditions are the most affected. 14% of heat-related illnesses were job-related.',
    short: 'Outdoor workers, kids, and older adults are hit hardest. 14% of cases were job-related.',
    source: HCPH,
  },
  {
    title: 'High school athletes',
    body: 'A CDC national estimate: 9,237 time-loss heat illnesses per year among U.S. high school athletes. About two-thirds happened in August.',
    short: 'CDC estimate: 9,237 heat illnesses a year in high school athletes, mostly in August.',
    source: 'CDC, Heat Illness Among High School Athletes, United States, 2005-2009 (MMWR)',
  },
  {
    title: 'Practice, not games',
    body: 'Football had the highest rate by far, and most heat illnesses happened during practice, not games. Heat illness is a leading cause of death and disability among U.S. high school athletes, and it is preventable.',
    short: 'Most athlete heat illness happens at practice. It is preventable.',
    source: 'CDC, Heat Illness Among High School Athletes, United States, 2005-2009 (MMWR)',
  },
  {
    title: 'Free rides to cool air',
    body: 'During extreme heat, Houston activates 20+ emergency cooling centers. Libraries and multi-service centers serve as cooling centers, and free transportation is available by calling 311.',
    short: 'Houston opens 20+ cooling centers. Call 311 for a free ride.',
    source: 'Houston Health Department, Houston Activates Heat Emergency Plan',
  },
];

// Tips that pop up while you play, pause the game, and point at something.
// point: 'water' (your bottle), 'station', 'shade', 'goal', or an npc id
const COACH = {
  start: {
    title: 'Plan around the sun',
    text: "Heat peaks between 10am and 4pm, and it's 3 PM. On a normal day you'd wait for evening. Today you need AC, so head for the library.",
    point: 'goal',
  },
  sweat: {
    title: "You're sweating a lot",
    text: "You're losing water fast. Drink before you feel thirsty, because thirst means you're already behind. Press Q.",
    point: 'water',
  },
  cramps: {
    title: 'Your legs are cramping',
    text: "Cramps come early, before the worse stuff. Get under a tree and let your body cool off.",
    point: 'shade',
  },
  exhaustion: {
    title: 'This is heat exhaustion',
    text: "Dizziness, nausea, headache, heavy sweating. Stop, get into shade, and drink.",
    point: 'shade',
  },
  stroke: {
    title: 'This is heat stroke',
    text: "You're confused and your skin is hot. In real life, someone should call 911 for you, and you shouldn't drink anything because you could choke. Get to shade now.",
    point: 'shade',
  },
  empty: {
    title: 'Out of water',
    text: "Refill here. You can drink it, and you can splash it on your skin too.",
    point: 'station',
  },
  neighbor: {
    title: 'Check on your neighbors',
    text: "Heat hits older adults and outdoor workers hardest. Ms. Delgado lives alone, and her power's out too.",
    point: 'delgado',
  },
  library: {
    title: 'Almost there',
    text: "Houston opens libraries as free cooling centers on extreme-heat days. Anyone can walk in.",
    point: 'goal',
  },
};

// first time you get near something that cools you off (or heats you up)
Object.assign(COACH, {
  asphalt: {
    title: 'Asphalt is the worst',
    text: "Dark pavement soaks up sun and throws the heat back at you. Grass heats you slower, and shade cools you down.",
    point: null,
  },
  shade: {
    title: 'Shade',
    text: "You're cooling down. Watch the meter drop. Plan your route from one shadow to the next.",
    point: null,
  },
  splash: {
    title: 'Splash pad',
    text: "Water on your skin pulls heat out of your body. Stand in the spray and you'll cool off fast.",
    point: { x: 32, y: 32 },
  },
  store: {
    title: 'Air conditioning',
    text: "Stores, malls, and libraries have AC. Ducking inside for a few minutes cools you off fast.",
    point: { x: 5.5, y: 8.6 },
  },
  snowball: {
    title: 'Snowball stand',
    text: "Shaved ice cools you a little. Water still does more for your body.",
    point: { x: 34, y: 8.6 },
  },
  station: {
    title: 'Free water',
    text: "Refill your bottle here. Every station tops you off.",
    point: 'station',
  },
  shelter: {
    title: 'Bus stop',
    text: "The shelter roof makes shade. Awnings over store fronts do the same.",
    point: { x: 30.5, y: 12 },
  },
  hat: {
    title: 'Free box',
    text: "A hat keeps the sun off your face and neck. Grab it.",
    point: { x: 2, y: 37 },
  },
});

// real-life tip that pops up right after you help each person (CDC + HCPH guidance)
const AFTER_TIPS = {
  okafor: { title: 'In real life', text: "Take breaks in shade or AC. For heat exhaustion: move somewhere cool, loosen clothes, put cool wet cloths on the skin, and sip water. Get medical help if symptoms get worse or last more than an hour." },
  jayden: { title: 'In real life', text: "Check on the people around you who are most at risk: babies, young kids, older adults, and anyone with a chronic health condition." },
  dana: { title: 'In real life', text: "Heat stroke: call 911 first. Move the person somewhere cooler and cool them with wet cloths or a cool bath. Don't give them anything to drink." },
  delgado: { title: 'In real life', text: "AC protects you best on extreme-heat days. If you don't have it, go to a cooling center, a library, or a mall." },
  dog: { title: 'In real life', text: "Don't leave kids or pets in a parked car, even for a minute." },
  luis: { title: 'In real life', text: "Heat cramps: stop what you're doing, move somewhere cool, drink water or a sports drink, and wait for the cramps to pass before you go back." },
};
for (const id in AFTER_TIPS) COACH['after_' + id] = { ...AFTER_TIPS[id], point: null };

// shown on the win screen no matter what
const EXTRA_TIPS = [
  'Wear light, loose, light-colored clothes. They hold less heat.',
  'Drink water and splash it on your skin.',
  'Above a 103° heat index, the National Weather Service calls heat dangerous. Check it before you go out.',
  "Don't leave kids or pets in a parked car.",
];

// Each person you can help.
// `lines` play first, then the question. One choice is right; wrong ones
// explain why and let you pick again.
const ENCOUNTERS = {
  okafor: {
    name: 'Mr. Okafor',
    condition: 'Heat exhaustion',
    lines: [
      ['okafor', "Hey. Hot one, huh? I gotta finish the front before my wife gets home."],
      [null, "His shirt is soaked. His face looks gray and clammy, and he's leaning his weight on the mower."],
      ['okafor', "Little dizzy. Got a headache. I'm fine."],
    ],
    question: "What's wrong with him?",
    choices: [
      {
        text: "Heat exhaustion. Get him into the shade, have him sip water, loosen his clothes.",
        correct: true,
        reply: "Heavy sweating, clammy skin, dizziness, and a headache all point to heat exhaustion. Get him somewhere cool, give him small sips of water, and put a wet cloth on his neck. If he throws up, gets worse, or still feels bad in an hour, he needs a doctor.",
      },
      {
        text: "He's sweating, so he's cooling off. He'll be fine.",
        reply: "Some sweat is normal. He's dripping, dizzy, and has a headache. If he keeps mowing, heat exhaustion can turn into heat stroke.",
      },
      {
        text: "Hand him an energy drink so he can finish faster.",
        reply: "Caffeine and sugar won't cool him down. He needs water and a break.",
      },
    ],
    after: [
      ['okafor', "Alright. The lawn can wait."],
      [null, "He sits down under the oak and tosses you a cold bottle from his cooler. Your water's full again."],
    ],
    reward: 'refill',
  },

  jayden: {
    name: 'Jayden',
    condition: 'Dehydration in a kid',
    lines: [
      [null, "A little kid sits at the bottom of the slide in full sun. His face is bright red."],
      ['jayden', "My head hurts. And I'm really thirsty. Mom said ten more minutes."],
      [null, "His mom sits on a bench across the playground, looking at her phone."],
    ],
    question: "What do you do?",
    choices: [
      {
        text: "Share some of your water, walk him to the shade, and go tell his mom.",
        correct: true,
        reply: "Kids heat up faster than adults, and they often keep quiet until they feel sick. Give him water, get him in the shade, and tell his mom.",
      },
      {
        text: "Tell him to go down the slide again. Moving around will help.",
        reply: "A metal slide in full sun can burn skin. And running around will make him hotter.",
      },
      {
        text: "Nothing. His mom is right there.",
        reply: "She's on her phone. A headache and thirst in this heat are early warning signs, and telling her takes ten seconds.",
      },
    ],
    after: [
      ['mom', "Oh, baby, why didn't you tell me? Thank you."],
    ],
    reward: 'giveSip',
  },

  dana: {
    name: 'Jogger',
    condition: 'Heat stroke',
    lines: [
      [null, "A woman in running clothes weaves down the trail. She almost walks into the bayou."],
      ['dana', "Wh... which way is... I parked... I have to finish my..."],
      [null, "Her skin is red and hot. She can barely stand, and she's not making sense."],
    ],
    question: "What do you do?",
    choices: [
      {
        text: "Call 911 right now, then cool her down fast: shade, cool water on her skin, fan her.",
        correct: true,
        reply: "Hot skin plus confusion means heat stroke, a medical emergency. Call 911 first. Then cool her with what you have: shade, cold water, wet cloths, ice on her neck and armpits. Don't give her a drink while she's confused. She could choke.",
      },
      {
        text: "Give her your water and tell her to walk it off.",
        reply: "She's confused, so she could choke on a drink. Heat stroke can kill or cause brain damage. Call 911.",
      },
      {
        text: "Help her sit down and check on her in a bit.",
        reply: "Her body can't cool itself anymore, and she'll get worse while you wait. Call 911 now.",
      },
    ],
    after: [
      [null, "You call 911. A guy on a bike helps you drag her into the shade, and he pours his water bottle over her shirt."],
      [null, "The ambulance shows up a few minutes later. A paramedic tells you that you did everything right."],
    ],
  },

  delgado: {
    name: 'Ms. Delgado',
    condition: 'High risk: older adult, no AC',
    lines: [
      ['delgado', "Oh, hi, sweetheart. I'm fine. The house is an oven, so I'm sitting out here."],
      [null, "She fans herself with a church bulletin. She looks wiped out."],
      ['delgado', "Little tired. Little queasy. I'll turn the fan on later."],
    ],
    question: "She says she's fine. What do you do?",
    choices: [
      {
        text: "Help her get to the cooling center. Call her family for a ride.",
        correct: true,
        reply: "Heat hits older adults harder, and they often can't tell how bad it's gotten. Her tiredness and nausea are warning signs.",
      },
      {
        text: "She said she's fine. Head out.",
        reply: "She's tired and queasy in a house with no AC. That's how heat exhaustion starts, and it hits older adults hardest.",
      },
      {
        text: "Tell her to sit in front of the fan with the windows open.",
        reply: "On a day like this, a fan blows hot air around. She needs AC or a cooling center.",
      },
    ],
    after: [
      ['delgado', "Okay, okay. I'll call my grandson. He's always begging to drive me somewhere."],
      [null, "Her grandson is on his way. She'll meet you at the library."],
    ],
  },

  dog: {
    name: 'Parked car',
    condition: 'Pet left in a hot car',
    lines: [
      [null, "A dog is stuck in this car with the windows up. It's panting hard and pawing at the glass."],
      [null, "You don't see anyone around, and the engine is off."],
    ],
    question: "What do you do?",
    choices: [
      {
        text: "Get help right now. Run into the store and tell someone, and call 911.",
        correct: true,
        reply: "A closed car heats up fast, even with the windows cracked. Tell an adult, have the store page the owner, and call 911.",
      },
      {
        text: "The owner will probably be back soon.",
        reply: "A closed car turns into an oven on a day like this. A few minutes can kill a pet, or a kid.",
      },
      {
        text: "Wait a few minutes and see if it gets worse.",
        reply: "Heavy panting and pawing at the glass mean the dog is already in trouble.",
      },
    ],
    after: [
      [null, "The manager pages the owner. He runs out of the store, red in the face, and apologizes to everyone in the lot."],
    ],
  },

  luis: {
    name: 'Luis',
    condition: 'Heat cramps',
    lines: [
      [null, "A guy in a hard hat sits on a bucket, rubbing his calf and wincing."],
      ['luis', "Ay, my legs keep locking up. Been framing since seven. Shift's over at six."],
      [null, "He's been sweating all day. His water jug sits by the gate, still full."],
    ],
    question: "What's wrong with him?",
    choices: [
      {
        text: "Heat cramps. He should stop, rest somewhere cool, and drink water or a sports drink.",
        correct: true,
        reply: "Cramps during hard work in the heat mean his body is low on water and salt. He should stop, rest, and drink. If the cramps last more than an hour, he needs medical help.",
      },
      {
        text: "Stretch it out and get back to work.",
        reply: "Cramps come first. If he keeps working, heat exhaustion comes next.",
      },
      {
        text: "Take a salt tablet.",
        reply: "Doctors don't recommend salt tablets unless they prescribe them. A sports drink with electrolytes works better.",
      },
    ],
    after: [
      ['luis', "Yeah, you're right. Boss can wait."],
      [null, "He moves under the tent and hands you a cooling towel. \"Wet it and put it on your neck.\""],
    ],
    reward: 'towel',
  },
};

// Not-encounter people you can still talk to
const SMALL_TALK = {
  mom: [['mom', "Thanks again. I'm keeping him in the shade until we leave."]],
  momBefore: [['mom', "Sorry, hon, I'm on hold with the power company."]],
  volunteer: [['volunteer', "Water's free. Take as much as you want. We're out here till sundown."]],
};

// What it feels like as you heat up. The thresholds are in script.js.
const STAGES = [
  { label: 'Feeling okay', tone: 'ok' },
  { label: 'Sweating a lot', tone: 'warn', coach: 'sweat' },
  { label: 'Cramps, feeling weak', tone: 'warn', coach: 'cramps' },
  { label: 'Dizzy, headache, nauseous', tone: 'bad', coach: 'exhaustion' },
  { label: 'Confused, skin hot', tone: 'bad', coach: 'stroke' },
];

const LOSE_LINE = "If this were real: for heat exhaustion, get to shade or AC, loosen clothes, cool your skin with wet cloths, and sip water. If someone is confused, fainting, or has hot, dry skin, that's heat stroke: call 911 immediately and do not give them anything to drink.";

const FIRST_AID = {
  exhaustion: [
    'Move to a cool place.',
    'Loosen clothes.',
    'Use cool, wet cloths or a cool bath.',
    'Sip water.',
    'Get medical help if they throw up, symptoms get worse, or last longer than 1 hour.',
  ],
  stroke: [
    'Call 911 right away.',
    'Move them to a cooler place.',
    'Cool them with cool cloths or a cool bath.',
    'Do not give them anything to drink.',
  ],
};

const SNOWBALL_FLAVORS = ["Tiger's blood", 'Pickle', 'Mango chamoy'];

// Achievements. `hint` shows (as ???) on the win screen until you get it.
const ACHIEVEMENTS = [
  { id: 'hat', name: 'Free hat', desc: 'Found a straw hat in a free box.', hint: 'Somebody is giving stuff away near home.' },
  { id: 'towel', name: 'Cooling towel', desc: 'Got a cooling towel.', hint: 'Someone might give you something useful.' },
  { id: 'splash', name: 'Playing in the water', desc: 'Ran through the splash pad.', hint: 'The park has more than a playground.' },
  { id: 'snowball', name: 'Brain freeze', desc: 'Got a snowball on Main St.', hint: 'Something cold on Main St.' },
  { id: 'ac', name: 'AC break', desc: 'Cooled off inside the corner store.', hint: 'Not every building is locked.' },
  { id: 'hydrated', name: 'Hydrated', desc: 'Refilled at 3 different water stations.', hint: 'Keep that bottle full.' },
  { id: 'neighbor', name: 'Good neighbor', desc: 'Helped all 6 people.', hint: 'Six people need you.' },
  { id: 'facts', name: 'Fact checker', desc: 'Read all 8 signs.', hint: 'Read everything posted around town.' },
  { id: 'coolhead', name: 'Cool head', desc: 'Made it without ever getting dizzy.', hint: 'Stay out of the danger zone.' },
  { id: 'grackle', name: 'Grackle chaser', desc: 'Scared the grackles in the parking lot.', hint: 'Houston has a bird problem.' },
];
