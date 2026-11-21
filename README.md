# token-radar-01

A token launch radar: pre-token protocols ranked by implied value, with farm plans and a static dashboard.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Build the best token launch radar: a program that reads a sealed snapshot of protocols, ranks pre-token ones by implied value, and hands in a dashboard with a board, detail views and farm plans.

## Build

```
node main.ts --input /input/snapshot.json --output /output
```

Or locally:
```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

## What it does

- Reads the sealed DefiLlama protocol snapshot
- Scores every pre-token protocol with an implied-value model (TVL × base × growth × maturity)
- Covers every watchlist protocol, adds early ones below the floor
- Writes a ranked board (board.json), dashboard data (data.js), dashboard files, screenshots and dossier.json
- No network, no framework, standard library only

## License

MIT.
