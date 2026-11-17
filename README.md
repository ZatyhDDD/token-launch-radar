# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ZatyhDDD/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ZatyhDDD/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 198 pre-token DeFi protocols by implied token value, with a farm plan for each one. The value model is radar-3: a log-log regression fit at run time on the snapshot's own live-token protocols, so the market's price for a dollar of TVL falls as protocols grow instead of staying a flat multiple. The fit is validated in the same run by leave-one-out: each live protocol is predicted from the other 118, and the median absolute log error (1.21) plus the share of predictions within 2x (33%) and 3x (44%) are reported with the calibration. Growth, age and category were tested and left out, because each added noise in the backtest. The dashboard is a dark, static page: a sortable and filterable board, a detail view for each protocol with the model's own inputs and its farm plan, the regression and its backtest, and a sandbox that re-runs the model live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
