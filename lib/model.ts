// Radar-5, the token radar's model: a sealed snapshot of the protocol universe in, a ranked
// board out.
//
// What the board holds: every slug on the snapshot's watchlist (the floor, never a ceiling) plus
// every other pre-token protocol the house's own exclusion rule keeps. A protocol leaves the board
// when its token already trades in another form — a wrapped, staked or bridged product, a
// versioned pool, an exchange — because ranking it would rank a token that already has a price.
// The protocols the board sets aside are not hidden: the dashboard names every one of the 758,
// ranked, already trading, or set aside with its reason.
//
// What a row is worth: a log-log regression fit at run time on the snapshot's own live-token
// protocols, plus a sector offset shrunk toward the global line. The market does not pay a flat
// multiple for a dollar of TVL: the ratio falls as protocols grow, so a single median multiple
// overstates the giants and understates the small. The regression reads that size effect straight
// off the live market instead of assuming it, and the sector term reads what each category's
// traded protocols actually fetch above or below the curve. No protocol name is ever
// special-cased. Growth and age tilts were tested and left out: each loses on leave-one-out, so
// the model keeps only TVL and the shrunk sector term.
//
//   log(mcap) = intercept + slope x log(tvl) + sector offset   (fit on the live protocols, CEX excluded)
//   implied   = max(1, round(exp(intercept + slope x log(tvl) + sector offset)))
//
// The fit is validated in the same run, twice over: leave-one-out over the live protocols, and a
// walk-forward test that fits only on protocols listed before a year boundary and tests on the
// ones listed in that year, so the reported error is an honest out-of-sample read, not the fit
// admiring itself. A flat median multiple is scored the same way, so the table shows what each
// term earns. Two hundred seeded bootstrap refits give every row a P25-P75 band.
//
// What a farm is worth: each row carries the full economics of farming it — a deposit sized by
// formula, the slice of implied value that deposit would earn if 10% of the token goes to
// depositors, the gas and the T-bill the position forgoes, the net, the break-even launch odds
// and a verdict. A farm pays only when the token launches, so the verdict is set by the odds
// the farm needs, not by the size of the slice.

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

/** The model's constants: only the floor on how many live protocols a fit needs, and the
 *  shrinkage that keeps a small category's offset near the global line. */
export interface ModelConstants {
  min_comparables: number;
  sector_shrinkage: number;
}

export const MODEL: ModelConstants = {
  min_comparables: 10,
  sector_shrinkage: 8,
};

/** The version label the dashboard names and the rules quote. */
export const MODEL_VERSION = 'radar-5';

/** How much of a token's implied value the farm assumes goes to depositors, and the T-bill
 *  rate the deposit forgoes while it sits in the position. */
export const AIRDROP_SHARE = 0.1;
export const TBILL_RATE = 0.04;
/** The deposit formula's floor and ceiling, in dollars. */
export const DEPOSIT_MIN = 500;
export const DEPOSIT_MAX = 5000;

/** One out-of-sample result: leave-one-out and walk-forward, side by side. */
export interface OosResult {
  loo_median_log_error: number;
  loo_within_2x: number;
  loo_within_3x: number;
  wf_median_log_error: number;
  wf_within_2x: number;
  wf_within_3x: number;
  wf_test_count: number;
}

/** One walk-forward window: fit on protocols listed before the cutoff, test on the ones listed
 *  in the cutoff year. */
export interface WalkForwardWindow {
  cutoff: string;
  train_count: number;
  test_count: number;
  median_log_error: number;
  within_2x: number;
  within_3x: number;
}

/**
 * The whole calibration: the regression the live market implies, how many live protocols
 * set it, the sector offsets, and the out-of-sample errors that say how far the fit can be
 * trusted — a flat multiple, the size curve alone, and the curve with the sector term.
 */
export interface Calibration {
  intercept: number;
  slope: number;
  live_count: number;
  sector_offsets: Record<string, number>;
  sector_categories: number;
  loo_median_log_error: number;
  loo_within_2x: number;
  loo_within_3x: number;
  ratio_at_100m: number;
  ratio_at_1b: number;
  oos_flat: OosResult;
  oos_curve: OosResult;
  oos_sector: OosResult;
  wf_windows: WalkForwardWindow[];
}

/** The verdict a farm earns from the odds it needs: FARM pays at low launch odds, MARGINAL
 *  needs a likely launch, SKIP needs odds no launch can offer. */
export type Verdict = 'FARM' | 'MARGINAL' | 'SKIP';

/** A protocol's farm economics, all in dollars except the odds and the hours. */
export interface FarmEconomics {
  deposit_usd: number;
  slice_usd: number;
  gas_usd: number;
  tbill_usd: number;
  net_usd: number;
  break_even: number;
  per_hour_usd: number;
  hours: number;
  verdict: Verdict;
}

/** One step as a single string: its action, then its cost and time, inside 20..600 characters. */
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
    sector_offset: number;
    curve_value_usd: number;
    implied_lo_usd: number;
    implied_hi_usd: number;
  };
  farm: FarmEconomics;
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
  sector_offset: number;
  curve_value_usd: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  deposit_usd: number;
  slice_usd: number;
  gas_usd: number;
  tbill_usd: number;
  net_usd: number;
  break_even: number;
  per_hour_usd: number;
  hours: number;
  verdict: Verdict;
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

/** A protocol the board sets aside, with the reason it is not ranked. */
export interface ExcludedProtocol {
  slug: string;
  name: string;
  category: string | null;
  reason: string;
}

/** The ledger that accounts for every protocol in the snapshot. */
export interface Ledger {
  total: number;
  ranked: number;
  live: number;
  cex: number;
  excluded: number;
}

/** Everything the dashboard renders: the board, the live set, the set-aside set, the
 *  calibration and the model. */
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
  ledger: Ledger;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedProtocol[];
  cex: LiveRow[];
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

/** Why a pre-token protocol is set aside instead of ranked, or null when it is rankable. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `${p.category} product: its token already trades in another form`;
  if (VERSIONED.test(p.name)) return 'versioned listing: a pool of another protocol';
  if (WRAPPED_OR_STAKED.test(p.name)) return 'wrapped or staked product: its token already trades in another form';
  if (EXCHANGE_NAMES.some((name) => p.name.startsWith(name))) return 'exchange: its token already trades';
  return null;
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

/** A category's offset from the global line: its median residual, shrunk toward zero by the
 *  pseudo-count, so a category with one or two traded protocols barely moves its own rows. */
function sectorOffsets(points: SnapshotProtocol[], line: { intercept: number; slope: number }, shrink: number): Record<string, number> {
  const residuals = new Map<string, number[]>();
  for (const p of points) {
    if (p.category === null) continue;
    const list = residuals.get(p.category) ?? [];
    list.push(Math.log(p.mcap_usd!) - (line.intercept + line.slope * Math.log(p.tvl_usd)));
    residuals.set(p.category, list);
  }
  const out: Record<string, number> = {};
  for (const [category, values] of residuals) {
    values.sort((a, b) => a - b);
    out[category] = (values.length * median(values)) / (values.length + shrink);
  }
  return out;
}

/** The value the size curve alone gives a protocol, before its sector offset. */
function curveValue(p: SnapshotProtocol, line: { intercept: number; slope: number }): number {
  return Math.exp(line.intercept + line.slope * Math.log(p.tvl_usd));
}

/** The value the full model gives a protocol: the curve, shifted by its sector's offset. */
function modelValue(p: SnapshotProtocol, line: { intercept: number; slope: number }, offsets: Record<string, number>): number {
  const offset = p.category !== null ? (offsets[p.category] ?? 0) : 0;
  return curveValue(p, line) * Math.exp(offset);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The absolute log errors of predicting each point in `test` from a model fit on `train`. */
function predictErrors(
  train: SnapshotProtocol[],
  test: SnapshotProtocol[],
  predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number,
): number[] {
  return test.map((p) => Math.abs(Math.log(predict(train, p)) - Math.log(p.mcap_usd!)));
}

/** One out-of-sample result from a list of absolute log errors. */
function oosFromErrors(errors: number[]): { median: number; within2x: number; within3x: number } {
  if (errors.length === 0) return { median: 0, within2x: 0, within3x: 0 };
  const sorted = [...errors].sort((a, b) => a - b);
  return {
    median: round4(median(sorted)),
    within2x: round4(sorted.filter((e) => e <= Math.log(2)).length / sorted.length),
    within3x: round4(sorted.filter((e) => e <= Math.log(3)).length / sorted.length),
  };
}

/** The three predictors the out-of-sample table compares: a flat median multiple, the size
 *  curve alone, and the curve with its shrunk sector term. Each is fit only on the training
 *  protocols it is given, so the test protocols are never allowed to teach it. */
function flatPredict(train: SnapshotProtocol[], p: SnapshotProtocol): number {
  const ratios = train.map((q) => Math.log(q.mcap_usd!) - Math.log(q.tvl_usd)).sort((a, b) => a - b);
  return Math.exp(Math.log(p.tvl_usd) + median(ratios));
}
function curvePredict(train: SnapshotProtocol[], p: SnapshotProtocol): number {
  return curveValue(p, fitLine(train));
}
function sectorPredict(train: SnapshotProtocol[], p: SnapshotProtocol): number {
  const line = fitLine(train);
  return modelValue(p, line, sectorOffsets(train, line, MODEL.sector_shrinkage));
}

/**
 * The regression the live market implies, fit at run time, with its leave-one-out error and
 * its walk-forward error. The walk-forward test fits only on protocols listed before a year
 * boundary and tests on the ones listed in that year, so a term that only fits the past
 * cannot hide: it has to predict the future.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = fittable(snapshot);
  if (live.length < model.min_comparables) {
    throw new SnapshotError(`snapshot.json has ${live.length} live protocols to fit from: radar needs ${model.min_comparables}`);
  }
  const line = fitLine(live);
  const offsets = sectorOffsets(live, line, model.sector_shrinkage);

  const looOf = (predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number): number[] => {
    const errors: number[] = [];
    for (let i = 0; i < live.length; i++) {
      const rest = live.slice(0, i).concat(live.slice(i + 1));
      errors.push(Math.abs(Math.log(predict(rest, live[i]!)) - Math.log(live[i]!.mcap_usd!)));
    }
    return errors;
  };
  const dated = live.filter((p) => p.listed_at !== null).sort((x, y) => (x.listed_at! < y.listed_at! ? -1 : x.listed_at! > y.listed_at! ? 1 : 0));
  const wfOf = (predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number): { errors: number[]; windows: WalkForwardWindow[] } => {
    const errors: number[] = [];
    const windows: WalkForwardWindow[] = [];
    for (const cutoff of ['2023-01-01', '2024-01-01', '2025-01-01']) {
      const nextYear = `${Number(cutoff.slice(0, 4)) + 1}-01-01`;
      const train = dated.filter((p) => p.listed_at! < cutoff);
      const test = dated.filter((p) => p.listed_at! >= cutoff && p.listed_at! < nextYear);
      if (train.length < model.min_comparables || test.length === 0) continue;
      const errs = predictErrors(train, test, predict);
      const summary = oosFromErrors(errs);
      windows.push({
        cutoff,
        train_count: train.length,
        test_count: test.length,
        median_log_error: summary.median,
        within_2x: summary.within2x,
        within_3x: summary.within3x,
      });
      errors.push(...errs);
    }
    return { errors, windows };
  };
  const oos = (predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number): OosResult => {
    const loo = oosFromErrors(looOf(predict));
    const wf = wfOf(predict);
    const wfSummary = oosFromErrors(wf.errors);
    return {
      loo_median_log_error: loo.median,
      loo_within_2x: loo.within2x,
      loo_within_3x: loo.within3x,
      wf_median_log_error: wfSummary.median,
      wf_within_2x: wfSummary.within2x,
      wf_within_3x: wfSummary.within3x,
      wf_test_count: wf.errors.length,
    };
  };

  const oosFlat = oos(flatPredict);
  const oosCurve = oos(curvePredict);
  const oosSector = oos(sectorPredict);
  const sectorWindows = wfOf(sectorPredict).windows;
  const ratioAt = (tvl: number): number => round4(Math.exp(line.intercept + line.slope * Math.log(tvl)) / tvl);
  return {
    intercept: round4(line.intercept),
    slope: round4(line.slope),
    live_count: live.length,
    sector_offsets: Object.fromEntries(Object.entries(offsets).map(([k, v]) => [k, round4(v)])),
    sector_categories: Object.keys(offsets).length,
    loo_median_log_error: oosSector.loo_median_log_error,
    loo_within_2x: oosSector.loo_within_2x,
    loo_within_3x: oosSector.loo_within_3x,
    ratio_at_100m: ratioAt(100_000_000),
    ratio_at_1b: ratioAt(1_000_000_000),
    oos_flat: oosFlat,
    oos_curve: oosCurve,
    oos_sector: oosSector,
    wf_windows: sectorWindows,
  };
}

/** A small deterministic generator, so the bootstrap refits give the same band every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every board protocol's P25-P75 band over seeded bootstrap refits: each refit resamples the
 * live protocols with replacement, refits the curve and the sector offsets, and re-scores the
 * board, so the band says how far the fit itself can move a row's value.
 */
export function bootstrapBand(
  snapshot: Snapshot,
  calibration: Calibration,
  protocols: SnapshotProtocol[],
  refits = 200,
): Map<string, { lo: number; hi: number }> {
  const live = fittable(snapshot);
  const rand = mulberry32(20261119);
  const samples = new Map<string, number[]>();
  for (const p of protocols) samples.set(p.slug, []);
  for (let r = 0; r < refits; r++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < live.length; i++) sample.push(live[Math.floor(rand() * live.length)]!);
    const refit = fitLine(sample);
    const refitOffsets = sectorOffsets(sample, refit, MODEL.sector_shrinkage);
    for (const p of protocols) {
      samples.get(p.slug)!.push(modelValue(p, refit, refitOffsets));
    }
  }
  const band = new Map<string, { lo: number; hi: number }>();
  for (const p of protocols) {
    const values = samples.get(p.slug)!.sort((a, b) => a - b);
    band.set(p.slug, {
      lo: Math.max(1, Math.round(values[Math.floor(0.25 * (values.length - 1))]!)),
      hi: Math.max(1, Math.round(values[Math.floor(0.75 * (values.length - 1))]!)),
    });
  }
  return band;
}

/** The implied value one protocol gets under `calibration`: the curve, shifted by its sector. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
): { implied: number; curve: number; sectorOffset: number; sectorMult: number; intercept: number; slope: number; comparables: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const line = { intercept: calibration.intercept, slope: calibration.slope };
  const curve = curveValue(protocol, line);
  const offset = protocol.category !== null ? (calibration.sector_offsets[protocol.category] ?? 0) : 0;
  const implied = Math.max(1, Math.min(1_000_000_000_000, Math.round(curve * Math.exp(offset))));
  return { implied, curve: Math.max(1, Math.round(curve)), sectorOffset: offset, sectorMult: Math.exp(offset), intercept: calibration.intercept, slope: calibration.slope, comparables: calibration.live_count, age };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A dollar figure with cents when it is small, whole dollars when it is not. */
const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function fmtDollars(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1000) return `${sign}${moneyFmt.format(a)}`;
  return `${sign}$${a.toFixed(2)}`;
}

/** A dollar figure, shortened past a thousand, formatted exactly the way the dashboard formats it. */
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

/** The gas one transaction costs on a chain: Ethereum is dear, Solana is nearly free, the
 *  layer-2s and the rest sit between them. */
function gasTx(chain: string | null): number {
  const c = (chain ?? '').toLowerCase();
  if (c.includes('ethereum')) return 3.0;
  if (c.includes('solana')) return 0.05;
  return 0.15;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** How much capital one farm position needs: a slice of the protocol's TVL, big enough that
 *  the slice covers the gas three times over, between $500 and $5,000. */
function depositFor(p: SnapshotProtocol, implied: number, gas: number): number {
  const slicePerDollar = (AIRDROP_SHARE * implied) / p.tvl_usd;
  const needed = slicePerDollar > 0 ? (3 * gas) / slicePerDollar : DEPOSIT_MAX;
  return Math.round(Math.min(DEPOSIT_MAX, Math.max(DEPOSIT_MIN, p.tvl_usd / 10000, needed)));
}

/** The overrides the dashboard's what-if controls pass: a fixed deposit, a different share of
 *  the token for depositors, or a different T-bill rate. The board itself always uses the
 *  formula values. */
export interface FarmOptions {
  deposit?: number;
  share?: number;
  tbill?: number;
}

/**
 * The whole farm economics of one protocol. The deposit is the formula's, unless the caller
 * overrides it; the slice is the share of the implied value that deposit would earn if the
 * token launches; the costs are the gas and the T-bill the deposit forgoes while it sits in
 * the position. The deposit itself is not a cost: it comes back when the position unwinds.
 * The verdict is set by the launch odds the farm needs to pay, not by the size of the slice.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, implied: number, opts: FarmOptions = {}): FarmEconomics {
  const hold = holdDaysFor(age);
  const multi = p.chains.length >= 2;
  const weeks = Math.ceil(hold / 7);
  const first = gasTx(p.chains.length > 0 ? p.chains[0]! : null);
  const second = multi ? gasTx(p.chains[1]!) : 0;
  const gas = first + first + first * weeks + second;
  const deposit = opts.deposit ?? depositFor(p, implied, gas);
  const share = opts.share ?? AIRDROP_SHARE;
  const tbillRate = opts.tbill ?? TBILL_RATE;
  const slice = (share * implied * deposit) / p.tvl_usd;
  const tbill = (deposit * tbillRate * hold) / 365;
  const costs = gas + tbill;
  const net = slice - costs;
  const breakEven = slice > 0 ? Math.min(99, costs / slice) : 99;
  let verdict: Verdict = breakEven <= 0.1 ? 'FARM' : breakEven <= 0.25 ? 'MARGINAL' : 'SKIP';
  if (verdict === 'FARM' && p.change_7d !== null && p.change_7d < -30) verdict = 'MARGINAL';
  const hours = (5 + 15 + 10 * weeks + (multi ? 15 : 5) + 10 + 10 + 5) / 60;
  return {
    deposit_usd: deposit,
    slice_usd: round2(slice),
    gas_usd: round2(gas),
    tbill_usd: round2(tbill),
    net_usd: round2(net),
    break_even: round4(breakEven),
    per_hour_usd: round2(net / hours),
    hours: round2(hours),
    verdict,
  };
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
      cost: `$${half} of capital and about $${gasTx(p.chains[1]!).toFixed(2)} of gas`,
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

/** The netting step: the deposit, the slice, the costs and the verdict, in one place. */
function netStep(p: SnapshotProtocol, econ: FarmEconomics): FarmStep {
  const multi = p.chains.length >= 2;
  const half = multi ? Math.max(10, Math.round(econ.deposit_usd / 2)) : 0;
  const costs = econ.gas_usd + econ.tbill_usd;
  const pays =
    econ.break_even <= 1
      ? `pays if the token launches with at least ${(econ.break_even * 100).toFixed(1)}% probability`
      : `never pays: even if the token launches for certain, the slice of ${fmtDollars(econ.slice_usd)} is below the ${fmtDollars(costs)} it costs to farm`;
  const text =
    `Add it up: a ${fmtDollars(econ.deposit_usd)} deposit${multi ? ` plus ${fmtDollars(half)} on ${p.chains[1]!}` : ''} earns a slice of ${fmtDollars(econ.slice_usd)} if the token launches and a tenth of its implied value goes to depositors. ` +
    `Gas comes to ${fmtDollars(econ.gas_usd)} and the deposit left in place forgoes ${fmtDollars(econ.tbill_usd)} at a 4% T-bill rate, so the net is ${fmtDollars(econ.net_usd)} and the farm ${pays}. Verdict: ${econ.verdict}.`;
  return {
    text,
    cost: `about ${fmtDollars(costs)} all in`,
    time: `${econ.hours.toFixed(1)} hours of active work`,
  };
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a time. Every step is
 * derived from the protocol's own record — its TVL, its 7-day change, its chains, its age, its
 * implied value and its farm economics — so two protocols never get the same plan unless their
 * records match. No protocol name is ever special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number, econ: FarmEconomics): FarmStep[] {
  const chain = chainOf(p);
  const capital = econ.deposit_usd;
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const first = gasTx(p.chains.length > 0 ? p.chains[0]! : null);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about $${first.toFixed(2)} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: `${action} ${p.name} holds ${fmtUsd(p.tvl_usd)} of TVL, so the $${capital} is a small slice of it and can exit in one transaction.`,
      cost: `$${capital} of capital and about $${first.toFixed(2)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: growthStep(p),
      cost: `about $${first.toFixed(2)} of gas a week`,
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
    netStep(p, econ),
  ];
}

/** One step as a single string: its action, then its cost and time, inside 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, calibration: Calibration | null = null): BoardRow[] {
  const cal = calibration ?? calibrate(snapshot, model);
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

  const protocols = [...chosen.values()];
  const band = bootstrapBand(snapshot, cal, protocols);
  const scored = protocols.map((p) => {
    const v = impliedValue(p, snapshot.as_of, cal);
    const econ = farmEconomics(p, v.age, v.implied);
    const b = band.get(p.slug)!;
    return { p, ...v, econ, band: b };
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
      sector_offset: round4(s.sectorOffset),
      curve_value_usd: s.curve,
      implied_lo_usd: s.band.lo,
      implied_hi_usd: s.band.hi,
    },
    farm: s.econ,
    farm_steps: farmSteps(s.p, s.age, s.implied, s.econ).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view: every one
 *  of them, not a top slice, so the page accounts for the whole snapshot. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
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

/** The protocols the board sets aside, with the reason each one is not ranked. */
export function excludedRows(snapshot: Snapshot): ExcludedProtocol[] {
  return snapshot.protocols
    .filter((p) => exclusionReason(p) !== null)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, reason: exclusionReason(p)! }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The exchange protocols, set aside with the live set: their token already trades. */
export function cexRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category === 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
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
    sector_offset: row.model.sector_offset,
    curve_value_usd: row.model.curve_value_usd,
    implied_lo_usd: row.model.implied_lo_usd,
    implied_hi_usd: row.model.implied_hi_usd,
    deposit_usd: row.farm.deposit_usd,
    slice_usd: row.farm.slice_usd,
    gas_usd: row.farm.gas_usd,
    tbill_usd: row.farm.tbill_usd,
    net_usd: row.farm.net_usd,
    break_even: row.farm.break_even,
    per_hour_usd: row.farm.per_hour_usd,
    hours: row.farm.hours,
    verdict: row.farm.verdict,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, model, calibration);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot);
  const cex = cexRows(snapshot);
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
    ledger: {
      total: snapshot.protocols.length,
      ranked: board.length,
      live: live.length,
      cex: cex.length,
      excluded: excluded.length,
    },
    rows: board.map(radarRow),
    live,
    excluded,
    cex,
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
