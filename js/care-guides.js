// Curated species care guides — the "professional advice" layer.
// Matched by Latin name (so new plants of the same species get advice too),
// with a generic fallback for anything unknown.

const GUIDES = [
  {
    match: /strelitzia/i,
    healthyLooksLike: 'Glossy, deep-green, paddle-shaped leaves held upright on strong stems, with a new leaf spear emerging every few weeks in the growing season. Splits along the leaf edges are normal and even healthy on maturing plants — they let wind through in nature.',
    wateringTechnique: 'Water thoroughly until it runs from the drainage holes, then let the top 2–5cm (1–2in) of soil dry out before watering again. Strelitzia would rather be slightly dry than wet — thick roots store water.',
    seasonal: 'Heavy drinker in summer, much slower in winter — roughly halve the watering frequency from November to February. Feed only spring through summer. Bigger pot + brighter light = faster growth toward the dramatic split-leaf stage.',
    problems: [
      { symptom: 'Leaf edges curling inward', cause: 'Underwatering or low humidity', fix: 'Check the soil — if dry several cm down, water deeply. Curling from dryness reverses within a day or two.' },
      { symptom: 'Yellowing lower leaves', cause: 'Overwatering, or natural shedding of the oldest leaf', fix: 'One old leaf yellowing occasionally is normal. Several at once: let the soil dry out further between waterings and confirm the pot drains.' },
      { symptom: 'Brown, crispy leaf edges', cause: 'Tap-water salts, dry air, or inconsistent watering', fix: 'Water more consistently and flush the pot through every month or two to rinse accumulated salts.' },
      { symptom: 'No new leaves for months', cause: 'Not enough light', fix: 'This plant wants the brightest spot you have — a south or east window with some direct sun. It tolerates less but stalls.' },
    ],
    proTips: [
      'Wipe the big leaves with a damp cloth monthly — dust meaningfully cuts the light they can use.',
      'Rotate a quarter-turn at each watering so it grows straight instead of leaning to the window.',
    ],
  },
  {
    match: /philodendron bipennifolium/i,
    healthyLooksLike: 'Distinctive glossy, horse-head-shaped lobed leaves spaced along a climbing stem, each new leaf a little larger than the last when it has support and light. Aerial roots gripping the moss pole are a great sign.',
    wateringTechnique: 'Water when the top 5cm (2in) of the chunky mix is dry — probe with a finger or chopstick. Aroids like this hate sitting wet; the chunky mix should drain fast.',
    seasonal: 'Grows spring through early autumn; keep the moss pole damp then to encourage aerial roots to grab. Slow to nearly dormant in winter — water less and don’t feed.',
    problems: [
      { symptom: 'Leggy, sparse growth with long bare stem between leaves', cause: 'Not enough light', fix: 'Move it brighter (no direct sun). You can also prune the vine tip — it will branch and fill out, and the cutting roots easily in water.' },
      { symptom: 'Yellow leaves', cause: 'Usually overwatering', fix: 'Let the mix dry further between waterings; check drainage. Remove fully yellow leaves — they won’t recover.' },
      { symptom: 'Brown crispy patches', cause: 'Direct sun scorch', fix: 'Bright indirect only. Move it out of any direct beam; damaged spots won’t heal but new leaves will be clean.' },
      { symptom: 'Leaves shrinking as it climbs', cause: 'Pole too dry / nothing to root into', fix: 'Mist or water the moss pole so aerial roots can take hold — leaf size tracks how well the aerial roots feed the vine.' },
    ],
    proTips: [
      'Woody-looking stem sections near the pole are normal mature stem, not damage.',
      'Tie new growth loosely to the pole every few weeks; it climbs faster with guidance.',
    ],
  },
  {
    match: /epipremnum|pothos/i,
    healthyLooksLike: 'Full trailing vines with crisp white-and-green marbled leaves (Manjula shows wide cream margins with a slightly ruffled edge). New leaves every couple of weeks in season, with strong variegation.',
    wateringTechnique: 'Let the soil dry out well — at least the top half of the pot — then water thoroughly. Slight leaf-droop is a reliable "water me" signal; it perks back within hours.',
    seasonal: 'Very forgiving year-round. Growth slows in winter; water perhaps every 10–14 days then. Variegated pothos grows slower than plain green ones — that’s the white tissue, not a problem.',
    problems: [
      { symptom: 'Small holes or spots in leaves', cause: 'Possible pests (spider mites, thrips) or mechanical damage', fix: 'Inspect leaf undersides with a light. Fine webbing = spider mites: shower the plant, then treat weekly with insecticidal soap or neem. No pests found: old damage, just watch new leaves.' },
      { symptom: 'Variegation fading to green', cause: 'Not enough light', fix: 'Move it brighter — the white sectors make no energy, so in dim light the plant reverts toward green. Bright indirect keeps the marbling.' },
      { symptom: 'Yellow leaves dropping', cause: 'Overwatering', fix: 'Hanging pots dry unevenly — always finger-test before watering, and empty the built-in saucer after.' },
      { symptom: 'Brown crisp tips on white areas', cause: 'White tissue is fragile — dry air or salts', fix: 'Cosmetic. Trim with clean scissors following the leaf shape; consider filtered water if it spreads.' },
    ],
    proTips: [
      'Trim leggy runners just after a node — the vine branches at the cut and the cutting roots in water for free plants.',
      'An occasional lukewarm shower keeps the foliage dust-free and knocks off would-be pests.',
    ],
  },
  {
    match: /maranta/i,
    healthyLooksLike: 'Flat, vividly patterned leaves — red herringbone veins over deep green — that fold upward at night (the "prayer" habit) and reopen by morning. Active folding is one of the best signs it’s happy.',
    wateringTechnique: 'Keep the soil evenly moist like a wrung-out sponge — never soggy, never bone-dry. Small drinks often beats rare soakings. Use filtered, distilled, or overnight-rested water: Maranta is genuinely sensitive to fluoride and mineral salts in tap water.',
    seasonal: 'Loves warm, humid summers; keep it away from heater vents and cold windows in winter (nothing below ~15°C/60°F). Feed lightly spring–summer only.',
    problems: [
      { symptom: 'Brown, crispy leaf tips', cause: 'Tap-water fluoride/salts or dry air — the classic Maranta complaint', fix: 'Switch to filtered or distilled water permanently, raise humidity (group plants or use a pebble tray), and trim dead tips with scissors just inside the brown.' },
      { symptom: 'Leaves stopped folding at night', cause: 'Stress — usually light too low or too high, or thirst', fix: 'Check soil moisture first, then move to medium indirect light. Folding resumes when conditions settle.' },
      { symptom: 'Faded, washed-out leaf color', cause: 'Too much direct sun', fix: 'Direct sun bleaches the pattern. Pull it back from the window or behind a sheer curtain.' },
      { symptom: 'Curled, limp leaves', cause: 'Underwatering or cold draft', fix: 'Water if dry; move away from AC vents and drafty windows.' },
    ],
    proTips: [
      'A bathroom or kitchen window with decent light is prime Maranta real estate — free humidity.',
      'Flush the pot with plenty of (filtered) water every month or so to rinse out fertilizer salts.',
    ],
  },
  {
    match: /philodendron hederaceum|heartleaf/i,
    healthyLooksLike: 'Cascades of glossy heart-shaped leaves on trailing vines, new leaves emerging with a bronze tint and darkening to deep green. Vines lengthen noticeably every month in season.',
    wateringTechnique: 'Let the top 2–5cm (1–2in) dry between waterings, then water until it drains. Very tolerant of a missed watering; far less tolerant of constant wetness.',
    seasonal: 'Near-continuous grower in decent light; slows in winter — stretch watering intervals and stop feeding.',
    problems: [
      { symptom: 'A leaf turning fully yellow and drooping', cause: 'Overwatering or poor drainage', fix: 'Let the pot dry out properly before the next watering and confirm water actually exits the drainage holes. Remove the yellow leaf once it pulls away easily — it won’t green back.' },
      { symptom: 'Long bare vines, few leaves', cause: 'Low light', fix: 'Brighter spot, and pinch back the bare vines — each cut point pushes new growth and the plant fills in.' },
      { symptom: 'Brown mushy stems at soil line', cause: 'Rot from chronic overwatering', fix: 'Take healthy tip cuttings immediately and root them in water — the cuttings are the rescue plan.' },
    ],
    proTips: [
      'One of the easiest plants to propagate: snip below a node, drop in water, roots in 2–4 weeks.',
      'It tells you it’s thirsty by drooping slightly — learn its look and you’ll never overwater.',
    ],
  },
  {
    match: /phalaenopsis|orchid/i,
    healthyLooksLike: 'Firm, leathery leaves without wrinkles; thick silvery-green aerial roots with bright green growing tips. For a keiki (baby plant): roots lengthening and a new leaf every couple of months means it’s establishing.',
    wateringTechnique: 'Read the roots, not a schedule: bright green roots = hydrated, wait; silvery-grey = time to water. Then soak the bark/moss thoroughly and let it drain fully — never leave standing water around the roots or in the crown (the leaf center).',
    seasonal: 'Feed "weakly, weekly" — quarter-strength orchid fertilizer while actively growing. A few degrees cooler at night in autumn helps trigger flower spikes on mature plants.',
    problems: [
      { symptom: 'Wrinkled, limp leaves', cause: 'Dehydration — roots either too dry or rotted (so they can’t drink)', fix: 'Check the roots: silvery/firm = just water more attentively. Brown/mushy = rot; trim dead roots and repot in fresh bark.' },
      { symptom: 'Roots brown and mushy', cause: 'Overwatering / medium staying wet', fix: 'Trim rotten roots with clean scissors, repot in coarse orchid bark, and water only when roots go silver.' },
      { symptom: 'Water sitting in the crown', cause: 'Watering from above', fix: 'Wick it out with a paper towel corner — standing crown water causes rot, the #1 phalaenopsis killer.' },
      { symptom: 'Aerial roots growing everywhere', cause: 'Totally normal', fix: 'Don’t cut them — they photosynthesize and drink humidity. Embrace the chaos.' },
    ],
    proTips: [
      'Clear pots aren’t just aesthetic — phalaenopsis roots photosynthesize, and you can see watering needs at a glance.',
      'An east-facing windowsill is the classic sweet spot: bright, gentle morning light.',
    ],
  },
  {
    match: /calathea|goeppertia/i,
    healthyLooksLike: 'Upright wavy-edged leaves with crisp dark markings on top and rich burgundy undersides, moving noticeably up and down over the day. New leaves emerge as tight rolled tubes.',
    wateringTechnique: 'Evenly moist, never swampy — water when the surface just starts to dry. Filtered, distilled, or rainwater only; Calathea is the most tap-water-sensitive plant in most collections.',
    seasonal: 'Craves humidity year-round (50–60%+). Winter heating is its enemy — group it with other plants, run a humidifier, or give it the bathroom. Feed gently spring–summer.',
    problems: [
      { symptom: 'Brown, crispy leaf tips and edges', cause: 'Low humidity and/or tap-water minerals — the classic Calathea complaint', fix: 'Switch fully to filtered/distilled water, raise humidity, and trim crisped tips with scissors, following the natural leaf curve. Existing damage stays; judge success by clean NEW leaves.' },
      { symptom: 'Leaf edges curling into tubes', cause: 'Thirst or dry air', fix: 'Water (with filtered water) and check humidity — curling is the leaf protecting itself from moisture loss.' },
      { symptom: 'Pattern fading', cause: 'Too much light', fix: 'Medium indirect light only; the markings are strongest out of direct sun.' },
      { symptom: 'Webbing under leaves, stippled dots', cause: 'Spider mites — they love the dry air Calathea hates', fix: 'Shower the plant, wipe leaf undersides, treat weekly with insecticidal soap, and raise humidity (mites hate it).' },
    ],
    proTips: [
      'A new leaf every few weeks in season is the health meter that matters — old damaged leaves never repair.',
      'If humidity is a battle you keep losing, a cheap humidity gauge next to the plant turns guessing into knowing.',
    ],
  },
  {
    match: /sansevieria|dracaena trifasciata|snake plant/i,
    healthyLooksLike: 'Rigid, upright sword leaves, firm to the squeeze, with strong yellow margins on ‘Laurentii’. New leaves push straight up from the soil as pointed spears. This plant looking "the same as last month" is success.',
    wateringTechnique: 'The rare plant you should actively neglect: let the soil dry out COMPLETELY, then water deeply. Every 2–4 weeks in summer, as little as every 4–6 weeks in winter. When unsure, wait another week — overwatering is essentially the only way to kill it.',
    seasonal: 'Barely cares. Tolerates low light but grows faster in bright. Feed once or twice per summer at most.',
    problems: [
      { symptom: 'Mushy leaves collapsing at the base', cause: 'Root rot from overwatering — the one real threat', fix: 'Stop watering, pull it from the pot, cut away mushy roots/leaves, and repot in dry cactus mix. Healthy leaf sections can be re-rooted as cuttings.' },
      { symptom: 'Wrinkled, leaning leaves', cause: 'Genuinely underwatered (takes months)', fix: 'A deep soak restores firmness within days.' },
      { symptom: 'Brown soft spots', cause: 'Cold + wet combination', fix: 'Keep above ~10°C/50°F and err dry in winter.' },
      { symptom: 'Leaves splaying outward', cause: 'Reaching in low light, or pot-bound', fix: 'Brighter light keeps it architectural; repot if roots are bulging the pot.' },
    ],
    proTips: [
      'Terracotta pots help here — they wick moisture out and buy forgiveness.',
      'It’s happiest root-bound; sansevierias have been known to crack pots before sulking.',
    ],
  },
];

const CUTTING_GUIDE = {
  healthyLooksLike: 'White, branching roots lengthening in clear water, and firm green leaves. Once roots hit 3–5cm (1–2in) with side branches, it’s ready for soil.',
  wateringTechnique: 'Fully refresh the water every 5–7 days — dump, rinse the container, refill with room-temperature water. Fresh water carries the oxygen developing roots need; stale water breeds rot.',
  seasonal: 'Roots fastest in warm, bright months. Pot it up in spring/summer for the smoothest transition.',
  problems: [
    { symptom: 'Water turning cloudy or smelly', cause: 'Bacterial growth', fix: 'Rinse the roots gently, scrub the container, refill. Refresh more often going forward.' },
    { symptom: 'Cut end turning brown/mushy', cause: 'Stem rot', fix: 'Re-cut above the rot with clean scissors and restart in fresh water.' },
    { symptom: 'No roots after 3–4 weeks', cause: 'Too dark or too cold', fix: 'Move to a brighter, warmer spot (bright indirect light, above 18°C/65°F). Make sure at least one node is underwater — roots grow from nodes, not the cut.' },
  ],
  proTips: [
    'Water roots differ from soil roots — after potting up, keep the soil moister than usual for 2–3 weeks while it adapts.',
    'Change is the milestone here: photograph weekly and the progress is dramatic.',
  ],
};

const GENERIC_GUIDE = {
  healthyLooksLike: 'Steady new growth in season, leaves firm and evenly colored for the species, no sudden dropping or spotting.',
  wateringTechnique: 'When unsure, check before you water: push a finger a few cm into the soil. Damp = wait. Most houseplants die from too much water, not too little.',
  seasonal: 'Almost all houseplants grow spring–summer and rest in winter — water and feed less from late autumn.',
  problems: [
    { symptom: 'Yellowing leaves', cause: 'Most often overwatering', fix: 'Let the soil dry further between waterings and verify drainage.' },
    { symptom: 'Brown crispy tips', cause: 'Dry air or tap-water salts', fix: 'Raise humidity, consider filtered water, trim dead tissue.' },
    { symptom: 'Leggy stretched growth', cause: 'Insufficient light', fix: 'Move closer to a window; rotate regularly.' },
    { symptom: 'Sticky residue, webbing, or dots on leaves', cause: 'Pests', fix: 'Isolate the plant, shower it, treat weekly with insecticidal soap until clear.' },
  ],
  proTips: ['Check leaf undersides whenever you water — pests found early are trivial to beat.'],
};

export function guideFor(plant) {
  if (/water propagation|cutting/i.test(`${plant.potType} ${plant.commonName}`)) return CUTTING_GUIDE;
  const hit = GUIDES.find(g => g.match.test(`${plant.latinName} ${plant.commonName}`));
  return hit || GENERIC_GUIDE;
}

/** True if this plant should get filtered/distilled water rather than tap. */
export function prefersFilteredWater(plant) {
  return /maranta|calathea|goeppertia/i.test(`${plant.latinName} ${plant.commonName}`)
    || /filtered|distilled/i.test(plant.water?.notes || '');
}
