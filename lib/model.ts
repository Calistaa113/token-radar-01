// Token Radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks the protocols that can still launch a token of their own. A protocol is
// launchable when the snapshot records no token for it (no market cap, no CoinGecko id, no
// symbol) and it is not a wrapped, staked or bridged product of a token that already trades:
// its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
// or CEX, and its name carries no bridge or wrapper word, no whole word wrapped, staked or
// staking, it does not begin with an exchange's name, and it does not end in a version marker.
// That is the watchlist's own rule, applied to the whole board instead of only the floor: WBTC
// is Bitcoin on Ethereum and Binance staked ETH is ETH in Binance's staking product, and neither
// is a launch waiting to happen, so a board that ranks them first is not a radar. The watchlist
// is the floor: all 40 of its slugs are launchable by that rule, and the board adds every other
// launchable protocol below the floor, by implied value — and the few above the floor the list
// leaves out, which the rules say are no worse a subject.
//
// Implied value follows only from the snapshot's own figures, the same function for every row:
//
//   growthPct = clamp(change_7d, -50, 100)          (null growth counts as 0)
//   growthMult = 1 + 0.6 x growthPct / 100          (0.70 .. 1.60)
//   maturity  = 0.55 + 0.45 x min(age_days, 1095) / 1095   (0.55 .. 1.00)
//   youth     = age_days < 90 ? 0.70 + 0.30 x age_days / 90 : 1
//               (a protocol listed days ago with a sudden TVL spike is discounted;
//                an unlisted age uses 365 days and no youth discount)
//   implied   = max(1, round(tvl_usd x 0.22 x growthMult x maturity x youth))
//
// TVL is the size of the business a token would price. Seven-day growth is momentum: a
// protocol gaining TVL is worth more than one the same size losing it, but the clamp keeps one
// wild week from deciding the board. Age is how long the protocol has run with no token: the
// longer it has run, the more established the business behind a launch, so maturity rises with
// age and saturates at three years. No protocol name is ever special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  youth_floor: number;
  youth_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 22e-2,
  growth_weight: 6e-1,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 55e-2,
  maturity_range: 45e-2,
  maturity_days: 1095,
  youth_floor: 7e-1,
  youth_days: 90,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = "radar-2";

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS: number = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    youth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page regenerates the farm plan from it. */
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
  growth_multiplier: number;
  maturity_multiplier: number;
  youth_multiplier: number;
  watchlist: boolean;
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

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86400000;

/** A finite number, else `fallback`. */
function finite(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const t0 = Date.parse(`${asOf}T00:00:00Z`);
  const t1 = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.max(0, Math.floor((t0 - t1) / DAY_MS));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; youthMult: number; age: number | null } {
  const ageVal = ageDays(asOf, protocol.listed_at);
  const raw = finite(protocol.change_7d, 0);
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
  const gMult = 1 + (pct / 100) * model.growth_weight;
  const ageUsed = ageVal ?? model.unknown_age_days;
  const mMult = model.maturity_floor + (Math.min(Math.max(ageUsed, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const yMult = ageVal === null || ageVal >= model.youth_days ? 1 : model.youth_floor + (1 - model.youth_floor) * (ageVal / model.youth_days);
  const baseVal = protocol.tvl_usd * model.base_multiple;
  const value = Math.max(1, Math.round(baseVal * gMult * mMult * yMult));
  return { implied: value, growthPct: pct, growthMult: gMult, maturityMult: mMult, youthMult: yMult, age: ageVal };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = new RegExp('\\s(V\\d+(\\.\\d+)?|v\\d+(\\.\\d+)?|\\d+\\.\\d+)$');
/** A wrapped, staked or staking product: the token it wraps already trades. */
const WRAPPED = new RegExp('\\b(wrapped|staked|staking)\\b', 'i');
/** Exchanges whose named products are the exchange's own, not a launch. */
const EXCHANGES = ['Bitget', 'Binance', 'Bitfinex', 'Bybit', 'Coinbase', 'Gemini', 'Kraken', 'OKX'];
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['CEX', 'Restaked BTC', 'Liquid Restaking', 'Liquid Staking', 'Canonical Bridge', 'Bridge']);

/** A category that names a bridge or a wrapper in its own words, whatever its exact label. */
function isProductCategory(category: string | null): boolean {
  if (category === null) return false;
  if (PRODUCT_CATEGORIES.has(category)) return true;
  const lower = category.toLowerCase();
  return lower.includes('bridge') || lower.includes('wrapper');
}

/** Whether a protocol records no token at all. */
export function isPreToken(proto: SnapshotProtocol): boolean {
  return proto.mcap_usd === null && proto.gecko_id === null && proto.symbol === null;
}

/**
 * Whether a protocol can still launch a token of its own: pre-token, and not a wrapped, staked
 * or bridged product of a token that already trades. This is the watchlist's own rule, applied
 * to the whole board; every watchlist slug passes it.
 */
export function isLaunchable(proto: SnapshotProtocol): boolean {
  if (!isPreToken(proto)) return false;
  if (isProductCategory(proto.category)) return false;
  if (VERSIONED.test(proto.name)) return false;
  if (WRAPPED.test(proto.name)) return false;
  if (EXCHANGES.some((e) => proto.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(list: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(list.map((proto) => [proto.slug, proto]));
}

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const lookup = bySlug(snapshot.protocols);
  const picked = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const proto = lookup.get(slug);
    if (proto !== undefined) picked.set(slug, proto);
  }
  // The early radar: every other launchable protocol below the floor, by implied value once
  // scored — a protocol below the floor is no worse a subject than one on it.
  for (const proto of snapshot.protocols) {
    if (!picked.has(proto.slug) && isLaunchable(proto)) picked.set(proto.slug, proto);
  }

  const ranked = [...picked.values()].map((proto) => {
    const { implied, growthPct, growthMult, maturityMult, youthMult, age } = impliedValue(proto, snapshot.as_of, model);
    return { proto, implied, growthPct, growthMult, maturityMult, youthMult, age };
  });
  ranked.sort((a, b) => b.implied - a.implied || (a.proto.slug < b.proto.slug ? -1 : a.proto.slug > b.proto.slug ? 1 : 0));
  return ranked.map((entry, i) => ({
    rank: i + 1,
    slug: entry.proto.slug,
    name: entry.proto.name,
    category: entry.proto.category,
    chains: entry.proto.chains,
    tvl_usd: entry.proto.tvl_usd,
    change_7d: entry.proto.change_7d,
    mcap_usd: entry.proto.mcap_usd,
    listed_at: entry.proto.listed_at,
    gecko_id: entry.proto.gecko_id,
    symbol: entry.proto.symbol,
    token_status: 'pre-token',
    age_days: entry.age,
    implied_value_usd: entry.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: entry.growthPct,
      growth_multiplier: round4(entry.growthMult),
      maturity_multiplier: round4(entry.maturityMult),
      youth_multiplier: round4(entry.youthMult),
      age_days: entry.age,
    },
    farm_steps: farmSteps(entry.proto, entry.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let out = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (out.length > 600) out = `${out.slice(0, 596)}...`;
  if (out.length < 20) out = `${out} Hold the position and check the protocol's own page.`;
  return out;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(proto: SnapshotProtocol): string {
  return proto.chains.length > 0 ? proto.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(proto: SnapshotProtocol): number {
  if (proto.tvl_usd >= 5e9) return 250;
  if (proto.tvl_usd >= 1e9) return 150;
  if (proto.tvl_usd >= 1e8) return 100;
  return 50;
}

/** What one transaction costs on the protocol's first chain, in whole dollars. */
function gasFor(proto: SnapshotProtocol): number {
  const ch = (proto.chains[0] ?? '').toLowerCase();
  if (ch.includes('ethereum')) return 6;
  if (ch.includes('bitcoin')) return 3;
  if (ch.includes('solana') || ch.includes('sui') || ch.includes('aptos') || ch.includes('near')) return 1;
  if (ch === '') return 2;
  return 1; // most other chains in the snapshot are L2s or low-fee chains
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(d: number | null): number {
  if (d === null) return 30;
  if (d < 180) return 60;
  if (d < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(proto: SnapshotProtocol, cap: number, ch: string): string {
  const cat = (proto.category ?? '').toLowerCase();
  const nm = proto.name;
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) return `Supply $${cap} of USDC to ${nm} on ${ch} and keep the position open.`;
  if (cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm')) return `Provide $${cap} of liquidity to ${nm}'s main pool on ${ch} and keep the position open.`;
  if (cat.includes('bridge')) return `Bridge $${cap} of USDC to ${ch} through ${nm} and use the bridged funds in its app.`;
  if (cat.includes('staking') || cat.includes('restak')) return `Stake $${cap} of the chain's staking asset through ${nm} and keep the receipt.`;
  if (cat.includes('perpetual') || cat.includes('derivative')) return `Deposit $${cap} of USDC as margin on ${nm} and open one small hedge.`;
  if (cat.includes('prediction')) return `Fund $${cap} and place one market position on ${nm}.`;
  if (cat.includes('curator') || cat.includes('allocator')) return `Deposit $${cap} into a ${nm} vault on ${ch} and keep the shares.`;
  if (cat.includes('stable')) return `Mint or deposit $${cap} of the stable asset through ${nm} on ${ch}.`;
  if (cat.includes('rwa')) return `Mint $${cap} of the protocol's yield asset on ${ch} and hold it.`;
  if (cat.includes('insurance')) return `Buy $${cap} of cover from ${nm} on ${ch} and keep the policy.`;
  return `Deposit $${cap} of USDC into ${nm} on ${ch} and keep the position open.`;
}

/** A second qualifying action, different from the core one, so the farm is not one click. */
function secondActionFor(proto: SnapshotProtocol, cap: number): string {
  const cat = (proto.category ?? '').toLowerCase();
  const nm = proto.name;
  const bit = Math.max(10, Math.round(cap / 5));
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) return `Borrow $${bit} against the supply on ${nm} and repay it the same week.`;
  if (cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm')) return `Swap $${bit} through ${nm}'s main pool once, in either direction.`;
  if (cat.includes('bridge')) return `Bridge $${bit} back through ${nm} so the round trip is on record.`;
  if (cat.includes('staking') || cat.includes('restak')) return `Claim or restake the staking rewards ${nm} pays, even if the amount is small.`;
  if (cat.includes('perpetual') || cat.includes('derivative')) return `Close the hedge on ${nm} and open a fresh one half the size.`;
  if (cat.includes('prediction')) return `Settle one market position on ${nm} and open another on a different market.`;
  if (cat.includes('curator') || cat.includes('allocator')) return `Move $${bit} between two ${nm} vaults instead of adding new funds.`;
  if (cat.includes('rwa')) return `Redeem $${bit} of the yield asset and mint it back the same week.`;
  return `Do one more on-chain action on ${nm}, such as a swap, a vote or a claim, in a different week from the first.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a hand-written
 * list of names. Gas is priced off the protocol's first chain, capital off its TVL, the hold off
 * its age.
 */
export function farmSteps(proto: SnapshotProtocol, age: number | null): FarmStep[] {
  const ch = chainOf(proto);
  const cap = capitalFor(proto);
  const g = gasFor(proto);
  const days = holdDaysFor(age);
  const act = actionFor(proto, cap, ch);
  const next = secondActionFor(proto, cap);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `under $${g + 2} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: act,
      cost: `$${cap} of capital and about $${g} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: next,
      cost: `about $${g} of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${g} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${days} days so the activity is counted in more than one snapshot.`,
      cost: `the $${cap} stays in the position`,
      time: `${days} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
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
    .filter((proto) => !isPreToken(proto) && proto.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((proto) => ({
      slug: proto.slug,
      name: proto.name,
      category: proto.category,
      chains: proto.chains,
      tvl_usd: proto.tvl_usd,
      mcap_usd: proto.mcap_usd,
      change_7d: proto.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, wl: Set<string>): RadarRow {
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
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    youth_multiplier: row.model.youth_multiplier,
    watchlist: wl.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const ranked = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = ranked.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: ranked.length,
    early_size: early,
    live_size: live.length,
    rows: ranked.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board: ranked, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = doc as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((item, idx) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new SnapshotError(`snapshot.json's protocol ${idx} is not an object`);
    const rec = item as Record<string, unknown>;
    if (typeof rec.slug !== 'string' || typeof rec.name !== 'string' || typeof rec.tvl_usd !== 'number' || !Number.isFinite(rec.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${idx} lacks a slug, a name or a TVL`);
    }
    return {
      slug: rec.slug,
      name: rec.name,
      category: typeof rec.category === 'string' ? rec.category : null,
      chains: Array.isArray(rec.chains) ? rec.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: rec.tvl_usd,
      change_7d: typeof rec.change_7d === 'number' && Number.isFinite(rec.change_7d) ? rec.change_7d : null,
      mcap_usd: typeof rec.mcap_usd === 'number' && Number.isFinite(rec.mcap_usd) ? rec.mcap_usd : null,
      listed_at: typeof rec.listed_at === 'string' ? rec.listed_at : null,
      gecko_id: typeof rec.gecko_id === 'string' ? rec.gecko_id : null,
      symbol: typeof rec.symbol === 'string' ? rec.symbol : null,
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
  const seen = new Set(board.map((row) => row.slug));
  const absent = snapshot.watchlist.filter((s) => !seen.has(s));
  if (absent.length > 0) return `the board misses ${absent.length} watchlist slug${absent.length === 1 ? '' : 's'}: ${absent.slice(0, 5).join(', ')}`;
  const order = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let i = 0; i < order.length; i++) if (order[i] !== i + 1) return `rank ${i + 1} is ${order[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    const steps = row.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${row.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${row.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has implied value ${row.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  const json = JSON.stringify(radar).replace(/<\/script/gi, '<\\/script');
  return `window.RADAR=${json};\n`;
}
