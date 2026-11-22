// Token Radar radar-2 — a Node 22 entry, standard library only.
//
// What this program does, in order:
//  1. Reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14).
//  2. Scores every pre-token protocol with the radar-2 model in lib/model.ts.
//     That model blends TVL, seven-day growth, age with no token, the
//     protocol's category, and how many chains it runs on. No name is special.
//  3. Writes the ranked board to board.json (226 rows: 40 watchlist + 186 early).
//  4. Writes data.js for the static dashboard, copies dashboard/ and
//     screenshots/ through, and finishes with dossier.json for the judge.
//  5. Prints a one-line summary so a human can see the top of the board.
//
// The dashboard itself never touches the network: index.html, app.css and
// app.js read only the data.js this program writes beside them.
//
// To run it outside the grader, point MAKEFUN_OUTPUT_DIR at a folder:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** Caps from the scorer: text shapes the dossier, the rest refuse outright. */
const TEXT_CAP_BYTES = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read --name <value> from argv, or fall back. */
function flagValue(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputArg = flagValue('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  fail(`the model wrote a board the gate refuses: ${problem}`, 1);
}

/** A short human summary of the board: total value and the top three. */
function summarizeBoard(): string {
  const total = board.reduce((sum, row) => sum + row.implied_value_usd, 0);
  const topThree = board.slice(0, 3).map((row) => `${row.name} ${row.implied_value_usd}`).join(', ');
  return `total implied $${total.toLocaleString('en-US')}; top: ${topThree}`;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a directory's plain files into `to`, skipping dot-names. */
function copyPlainFiles(fromDir: string, toDir: string): string[] {
  if (!existsSync(fromDir)) return [];
  mkdirSync(toDir, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(fromDir)) {
    if (name.startsWith('.')) continue;
    const src = join(fromDir, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(toDir, name));
    names.push(name);
  }
  return names;
}

copyPlainFiles(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shotNames = copyPlainFiles(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotNames.length < 3) {
  fail(`screenshots/ holds ${shotNames.length} image${shotNames.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`, 1);
}
for (const shot of shotNames) {
  if (!SHOT_NAME.test(shot)) {
    fail(`screenshots/${shot}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
  }
}

// Dossier last: the scorer rebuilds it from this output and compares bytes.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: TEXT_CAP_BYTES, screenshots: SHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: ${summarizeBoard()}\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shotNames.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
