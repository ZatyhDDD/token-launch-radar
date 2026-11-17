# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ZatyhDDD/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ZatyhDDD/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 198 pre-token DeFi protocols by implied token value, with a farm plan for each one. The value model is radar-2: the base multiple is not a constant but the market's own price for a dollar of TVL, read off the snapshot's live-token protocols (the median market-cap/TVL of the live protocols in the same category, else the median over all live protocols), adjusted by seven-day growth and by how long a protocol has run with no token. The dashboard is a dark, static page: a sortable and filterable board, a detail view for each protocol with the model's own inputs and its farm plan, the calibration table, and a sandbox that re-runs the model live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
