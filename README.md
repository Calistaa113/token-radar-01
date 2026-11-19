# Token Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/calistaa113/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/Calistaa113/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for the [make.fun bounty](https://make.fun/bounty/token-radar-01): it ranks the
protocols that can still launch a token of their own by an implied value derived from the sealed
DefiLlama snapshot, and gives each one a concrete farm plan.

## The model (radar-2)

```
implied = round(tvl_usd x 0.22
  x (1 + clamp(change_7d, -50, 100) / 100 x 0.6)
  x (0.55 + min(age_days, 1095) / 1095 x 0.45)
  x youth(age_days))
```

- **TVL** is the size of the business a token would price.
- **Seven-day growth** is momentum, clamped so one wild week cannot decide the board.
- **Age** is how long the protocol has run with no token; maturity rises with age and saturates
  at three years. A protocol listed under 90 days ago is discounted toward 0.70, so a sudden
  TVL spike does not top the board.
- **Launchable only:** the board ranks protocols that record no token and are not a wrapped,
  staked or bridged product of a token that already trades (the watchlist's own rule, applied
  to the whole board). WBTC is Bitcoin on Ethereum, not a launch waiting to happen.

The board covers all 40 watchlist slugs plus 158 launchable protocols below the $50M floor —
198 rows. Live-token protocols are set aside in their own view with their market caps, never
mixed into the ranking.

## The dashboard

`dashboard/` is a static page with no network: a ranked board, a detail view per protocol
(implied-value breakdown plus a 7-step farm plan with costs and times), search, category and
chain filters, a watchlist-only toggle, and sortable columns.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` reads `/input/snapshot.json` by default, writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` to `/output` (or `$MAKEFUN_OUTPUT_DIR`).
Node 22 or later, standard library only.

## License

MIT — see [LICENSE](LICENSE).
