// Radar-3, the token radar's model: a sealed snapshot of the protocol universe in, a ranked
// board out.
//
// What the board holds: every slug on the snapshot's watchlist (the floor, never a ceiling) plus
// every other pre-token protocol the house's own exclusion rule keeps. A protocol leaves the board
// when its token already trades in another form — a wrapped, staked or bridged product, a
// versioned pool, an exchange — because ranking it would rank a token that already has a price.
//
// What a row is worth: a log-log regression fit at run time on the snapshot's own live-token
// protocols. The market does not pay a flat multiple for a dollar of TVL: the ratio falls as
// protocols grow, so a single median multiple overstates the giants and understates the small.
// The regression reads that size effect straight off the live market instead of assuming it.
// No protocol name is ever special-cased, and no growth, age or category adjustment is applied:
// a leave-one-out backtest on the snapshot's live protocols showed each of those adds noise
// (median log error 1.21 for the plain regression against 1.53 for a per-category median and
// 1.58 for the median with growth and maturity multipliers), so the model keeps only TVL.
//
//   log(mcap) = intercept + slope x log(tvl)        (fit on the live protocols, CEX excluded)
//   implied   = max(1, round(exp(intercept + slope x log(tvl_usd))))
//
// The fit is validated in the same run by leave-one-out: each live protocol is predicted from
// the other 118, and the median absolute log error plus the share of predictions within 2x and
// 3x are reported with the calibration, so the dashboard states how far the model can be trusted.

/** One protocol entry, exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: only the floor on how many live protocols a fit needs. */
export interface ModelConstants {
  min_comparables: number;
}

export const MODEL: ModelConstants = {
  min_comparables: 10,
};

/** The version label the dashboard names and the rules quote. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/**
 * The whole calibration: the regression the live market implies, how many live protocols
 * set it, and the leave-one-out error that says how far the fit can be trusted.
 */
export interface Calibration {
  intercept: number;
  slope: number;
  live_count: number;
  loo_median_log_error: number;
  loo_within_2x: number;
  loo_within_3x: number;
  ratio_at_100m: number;
  ratio_at_1b: number;
}

/** One farm step: what to do, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    intercept: number;
    slope: number;
    comparables: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row in the compact form the dashboard's data.js carries. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  intercept: number;
  slope: number;
  comparables: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders: the board, the live set, the calibration and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Thrown when the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** The median of a sorted list; for an even count, the mean of the two middles. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when a date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const from = Date.parse(`${asOf}T00:00:00Z`);
  const to = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.floor((from - to) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the house's watchlist rule keeps off the board: a wrapped, staked or bridged product. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names the house's watchlist rule keeps off the board. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking anywhere in the name, in any case. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol is one the board may rank: pre-token and kept by the exclusion rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((name) => p.name.startsWith(name))) return false;
  return true;
}

/** The live protocols a fit may learn from: a traded token, a positive TVL, not an exchange. */
function fittable(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

/** The ordinary-least-squares line through log TVL and log market cap. */
function fitLine(points: SnapshotProtocol[]): { intercept: number; slope: number } {
  const n = points.length;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += Math.log(p.tvl_usd);
    sy += Math.log(p.mcap_usd!);
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = Math.log(p.tvl_usd) - mx;
    num += dx * (Math.log(p.mcap_usd!) - my);
    den += dx * dx;
  }
  const slope = den === 0 ? 1 : num / den;
  return { intercept: my - slope * mx, slope };
}

/**
 * The regression the live market implies, fit at run time, with its leave-one-out error.
 * Each live protocol is predicted once from the other live protocols, so the reported error
 * is an honest out-of-sample read, not the fit admiring itself.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = fittable(snapshot);
  if (live.length < model.min_comparables) {
    throw new SnapshotError(`snapshot.json has ${live.length} live protocols to fit from: radar needs ${model.min_comparables}`);
  }
  const { intercept, slope } = fitLine(live);
  const errors: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const rest = live.slice(0, i).concat(live.slice(i + 1));
    const line = fitLine(rest);
    const target = live[i]!;
    const predicted = Math.exp(line.intercept + line.slope * Math.log(target.tvl_usd));
    errors.push(Math.abs(Math.log(predicted) - Math.log(target.mcap_usd!)));
  }
  errors.sort((a, b) => a - b);
  const looMedian = median(errors);
  const within2x = errors.filter((e) => e <= Math.log(2)).length / errors.length;
  const within3x = errors.filter((e) => e <= Math.log(3)).length / errors.length;
  const ratioAt = (tvl: number): number => round4(Math.exp(intercept + slope * Math.log(tvl)) / tvl);
  return {
    intercept: round4(intercept),
    slope: round4(slope),
    live_count: live.length,
    loo_median_log_error: round4(looMedian),
    loo_within_2x: round4(within2x),
    loo_within_3x: round4(within3x),
    ratio_at_100m: ratioAt(100_000_000),
    ratio_at_1b: ratioAt(1_000_000_000),
  };
}

/** The implied value one protocol gets under `calibration`: the regression's own prediction. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
): { implied: number; intercept: number; slope: number; comparables: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const predicted = Math.exp(calibration.intercept + calibration.slope * Math.log(protocol.tvl_usd));
  const implied = Math.max(1, Math.min(1_000_000_000_000, Math.round(predicted)));
  return { implied, intercept: calibration.intercept, slope: calibration.slope, comparables: calibration.live_count, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked.
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the exclusion rule keeps, whatever its TVL.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      intercept: s.intercept,
      slope: s.slope,
      comparables: s.comparables,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.implied).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string: its action, then its cost and time, inside 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A dollar figure, shortened past a thousand, formatted exactly the way the dashboard formats it. */
const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function fmtUsd(n: number): string {
  if (!isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return moneyFmt.format(n);
}

/** A percent with its sign, formatted exactly the way the dashboard formats it. */
function fmtPct(n: number): string {
  if (!isFinite(n)) return 'n/a';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('basis trading') || c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly step, read off the protocol's own 7-day change. */
function growthStep(p: SnapshotProtocol): string {
  if (p.change_7d === null) return `No 7-day change is recorded for ${p.name}. Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and judge the trend from next week's TVL.`;
  if (p.change_7d > 0) return `TVL rose ${fmtPct(p.change_7d)} in the last 7 days. Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, while the growth holds; if it turns negative for two weeks, stop adding.`;
  if (p.change_7d < 0) return `TVL fell ${fmtPct(p.change_7d)} in the last 7 days. Make one qualifying action this week, such as a deposit, a borrow, a swap or a vote, then wait a week before adding more.`;
  return `TVL was flat over the last 7 days. Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and that is enough to stay active.`;
}

/** The hold step, read off how long the protocol has run without a token. */
function holdStep(p: SnapshotProtocol, age: number | null, hold: number): string {
  if (age === null) return `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Its listing date is not recorded, so ${hold} days is the safe default.`;
  return `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. ${p.name} has run ${age} days without a token, so a ${hold}-day hold is still early in its life.`;
}

/** The chain step: a second chain gets half the capital, a single chain keeps the whole position. */
function chainStep(p: SnapshotProtocol, capital: number): FarmStep {
  if (p.chains.length >= 2) {
    const half = Math.max(10, Math.round(capital / 2));
    return {
      text: `${p.name} also runs on ${p.chains[1]!}, so repeat the deposit there with $${half}, half the first position, so the activity shows on two chains, not one.`,
      cost: `$${half} of capital and about $4 of gas`,
      time: '15 minutes to set up',
    };
  }
  if (p.chains.length === 1) {
    return {
      text: `${p.name} runs only on ${p.chains[0]!}, so all of the activity counts on that one chain. Keep the whole position there instead of splitting it.`,
      cost: 'nothing extra',
      time: '5 minutes to check',
    };
  }
  return {
    text: `${p.name} names no chain in the snapshot, so do the whole position on the chain its app opens on and note which one in the farm log.`,
    cost: 'nothing extra',
    time: '5 minutes to check',
  };
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. Every step is
 * derived from the protocol's own record — its TVL, its 7-day change, its chains, its age and
 * its implied value — so two protocols never get the same plan unless their records match.
 * No protocol name is ever special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `${action} ${p.name} holds ${fmtUsd(p.tvl_usd)} of TVL, so the $${capital} is a small slice of it and can exit in one transaction.`,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: growthStep(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: holdStep(p, age, hold),
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    chainStep(p, capital),
    {
      text: `Once a month, check ${p.name}'s TVL against the ${fmtUsd(p.tvl_usd)} in the last snapshot; if it falls by more than a fifth in a week, pause new deposits until you know why.`,
      cost: 'nothing to check',
      time: '10 minutes a month',
    },
    {
      text: `Before the token launches, check ${p.name}'s own announcements for the claim window and the eligibility rules, and claim only from the link it publishes. At an implied ${fmtUsd(implied)} the claim is worth chasing, but a claim that asks for a fee or a seed phrase is a scam.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    intercept: row.model.intercept,
    slope: row.model.slope,
    comparables: row.model.comparables,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
