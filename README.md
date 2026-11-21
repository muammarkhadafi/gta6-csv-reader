[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/muammarkhadafi/gta6-csv-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/muammarkhadafi/gta6-csv-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-fast

A faster drop-in for make.fun's own csv-reader 1.0.0, for the bounty
"Read broken CSV files faster, 21 November 2026"
(`csv-reader-speed-01-run-20261121`, $100, 10 paid places).

Built for the make.fun bounty: https://make.fun/bounty/csv-reader-speed-01-run-20261121

`run(input)` in `solve.js` returns exactly the same `{columns, rows, errors}`
as csv-reader 1.0.0 for every input, including its broken-row policy
(unclosed quotes, stray CRs, quote junk, short and long rows), but reads the
text with native `indexOf`/`slice` scans instead of one character at a time,
so long fields are sliced, not built up a character at a time.

`main.ts` is the driver: it reads every case from `/input/cases.json`,
answers each with `run`, and writes `/output/answers.json`.
