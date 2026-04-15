/**
 * Build the runtime lexicon from public data sources.
 *
 * Currently supports:
 *   - xinhua idioms dataset (~30k 4-char idioms, MIT licensed)
 *     https://github.com/pwxcoo/chinese-xinhua
 *
 * Usage:
 *   # Auto-download source + build (writes static/data/lexicon.json):
 *   node scripts/build_lexicon.mjs
 *
 *   # Use a pre-downloaded file:
 *   node scripts/build_lexicon.mjs --xinhua=/path/to/idiom.json
 *
 *   # Limit output for testing:
 *   node scripts/build_lexicon.mjs --max=5000
 *
 * Output format matches what src/lib/core/corpus/loader.ts expects when
 * it fetches at runtime:
 *   { version: 2, generated: ISO, count: N, phrases: [{ text, finals, length, quality, tags, source }] }
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'static', 'data', 'lexicon.json');
const XINHUA_URL =
  'https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json';
const XINHUA_CACHE = path.join(REPO_ROOT, 'scripts', '.cache', 'xinhua-idiom.json');

// ─── CLI parsing ───────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const eq = a.indexOf('=');
      return eq === -1 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
    })
);

const XINHUA_LOCAL = flags.xinhua ?? null;
const MAX_ENTRIES = flags.max ? parseInt(String(flags.max), 10) : Infinity;
const SKIP_DOWNLOAD = !!flags['no-download'];

// ─── Fetch helpers ─────────────────────────────────────────────────────

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fsp.mkdir(path.dirname(destPath), { recursive: true }).then(() => {
      const file = fs.createWriteStream(destPath);
      https
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Simple redirect follow.
            file.close();
            fs.unlinkSync(destPath);
            downloadToFile(res.headers.location, destPath).then(resolve, reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(resolve));
        })
        .on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
    }, reject);
  });
}

async function loadXinhuaIdioms() {
  let source;
  if (XINHUA_LOCAL) {
    console.error(`[xinhua] loading from ${XINHUA_LOCAL}`);
    source = XINHUA_LOCAL;
  } else if (fs.existsSync(XINHUA_CACHE)) {
    console.error(`[xinhua] using cached ${XINHUA_CACHE}`);
    source = XINHUA_CACHE;
  } else if (SKIP_DOWNLOAD) {
    throw new Error(
      'No xinhua source available. Pass --xinhua=/path/to/idiom.json or drop --no-download.'
    );
  } else {
    console.error(`[xinhua] downloading ${XINHUA_URL}`);
    await downloadToFile(XINHUA_URL, XINHUA_CACHE);
    console.error(`[xinhua] cached to ${XINHUA_CACHE}`);
    source = XINHUA_CACHE;
  }
  const raw = await fsp.readFile(source, 'utf-8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('xinhua JSON is not an array');
  return arr;
}

// ─── Pinyin → canonical final mapping ──────────────────────────────────
//
// Minimal self-contained implementation that mirrors the runtime
// normalizer (src/lib/core/pinyin/normalizer.ts). Inlined here to avoid
// importing TypeScript source from Node without a build step.

const TONE_MAP = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'ü', ǘ: 'ü', ǚ: 'ü', ǜ: 'ü'
};
const INITIAL_RE = /^(zh|ch|sh|b|p|m|f|d|t|n|l|g|k|h|j|q|x|r|z|c|s)/;

// Initials after which a written "i" is really the apical vowel [ɨ].
// We encode that case as the distinct final "-i" to keep it separate
// from regular i after j/q/x. Must match the runtime decomposer.
const APICAL_I_INITIALS = new Set(['zh', 'ch', 'sh', 'r', 'z', 'c', 's']);

function stripTone(s) {
  let out = '';
  for (const ch of s) out += TONE_MAP[ch] ?? ch;
  return out;
}

/**
 * Canonicalize a pinyin syllable and strip the initial to produce the
 * final (韵母) — matches the runtime pipeline's behavior for the 36
 * standard Mandarin finals.
 */
function extractFinal(rawPinyin) {
  if (!rawPinyin) return '';
  let s = stripTone(String(rawPinyin).trim().toLowerCase().replace(/v/g, 'ü'));
  // Handle erhua: trailing -r (but not standalone "er"). We just drop
  // the r and treat the rest as the syllable's final.
  if (s.length > 1 && s.endsWith('r') && s !== 'er') s = s.slice(0, -1);

  // y/w null-initial conventions
  if (s.startsWith('y')) {
    if (s === 'yi') s = 'i';
    else if (s === 'yin') s = 'in';
    else if (s === 'ying') s = 'ing';
    else if (s === 'yu') s = 'ü';
    else if (s.startsWith('yu')) s = 'ü' + s.slice(2);
    else s = 'i' + s.slice(1);
  } else if (s.startsWith('w')) {
    if (s === 'wu') s = 'u';
    else s = 'u' + s.slice(1);
  }

  // jqx + u → jqx + ü
  if (/^[jqx]u/.test(s)) s = s[0] + 'ü' + s.slice(2);

  // Extract initial
  const m = s.match(INITIAL_RE);
  if (m) {
    const init = m[0];
    let rest = s.slice(init.length);
    // Truncated finals -iu/-ui/-un → -iou/-uei/-uen (after initial only)
    if (rest === 'iu') rest = 'iou';
    else if (rest === 'ui') rest = 'uei';
    else if (rest === 'un') rest = 'uen';
    // Apical-i mark: shi/zhi/ri/zi/ci/si rhyme in 支 not 齐.
    else if (rest === 'i' && APICAL_I_INITIALS.has(init)) rest = '-i';
    return rest;
  }
  return s;
}

// All canonical finals (keep in sync with decomposer.ts VALID_FINALS)
const VALID_FINALS = new Set([
  'a','o','e','i','-i','u','ü','er',
  'ai','ei','ao','ou',
  'an','en','ang','eng','ong',
  'ia','ie','iao','iou','ian','in','iang','ing','iong',
  'ua','uo','uai','uei','uan','uen','uang','ueng',
  'üe','üan','ün'
]);

// ─── Quality scoring ──────────────────────────────────────────────────
//
// Every xinhua entry is a 成语, so tags don't help distinguish.
// Signals we use instead:
//   + presence and length of explanation  (common idioms have thorough entries)
//   + presence of a modern example        (idioms still in active use)
//   + derivation from well-known sources  (canonical vs obscure)
//   − archaic / pejorative characters     (low appeal in modern rap)
//   − length deviation from 4 characters  (idioms beyond 4 are rarer)

// Characters that flag archaic or obscure register. Filter aggressively:
// even one of these in a 4-char phrase usually signals 生造-feel.
const ARCHAIC_CHARS = /[鄙贱陋妓妾奴孽蛮夷虏俎胄嫔樽觞圭彘牝牡虺蠡鹢鸱髫髭髦髻]/;

// Characters commonly only seen in archaic idioms (light penalty)
const LIGHT_ARCHAIC = /[酋囹圄鞋匏彝觥蠖衢邙薨崩亡]/;

// Well-known classical sources that tend to produce familiar idioms.
const KNOWN_SOURCES = [
  '论语', '孟子', '庄子', '老子', '韩非子', '史记', '左传',
  '战国策', '三国志', '世说新语', '红楼梦', '水浒', '三国演义',
  '西游记', '金瓶梅', '儒林外史', '聊斋', '唐诗', '宋词',
  '毛泽东', '鲁迅', '毛主席', '现代汉语'
];

function scoreIdiom(entry) {
  let score = 0.6;
  const text = entry.word || '';
  const n = text.length;

  // Length preference: 4-char gets full; 3/5 partial; 6+ heavily penalized
  // since very long idioms tend to be unfamiliar / archaic.
  if (n === 4) score += 0.15;
  else if (n === 3) score += 0.05;
  else if (n === 5) score += 0.02;
  else if (n === 6) score -= 0.05;
  else score -= 0.15;

  // Explanation quality: a substantive entry suggests the idiom is
  // frequent enough to warrant a full write-up.
  const explanation = entry.explanation || '';
  if (explanation.length > 30) score += 0.08;
  else if (explanation.length > 10) score += 0.04;
  else score -= 0.1;

  // Active usage signal: the xinhua dataset only includes an example
  // field when the idiom has been attested in a modern text.
  const example = entry.example || '';
  if (example.length > 10) score += 0.1;

  // Derivation traceable to a well-known classical work → more likely
  // to be a familiar idiom.
  const derivation = entry.derivation || '';
  if (KNOWN_SOURCES.some((src) => derivation.includes(src))) {
    score += 0.05;
  }

  // Archaic / pejorative characters → strong downweight.
  if (ARCHAIC_CHARS.test(text)) score -= 0.25;
  else if (LIGHT_ARCHAIC.test(text)) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

// ─── Build pipeline ───────────────────────────────────────────────────

function isChineseChar(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
}

function chineseCharCount(s) {
  let n = 0;
  for (const ch of s) if (isChineseChar(ch)) n++;
  return n;
}

function processXinhuaEntry(entry) {
  const text = (entry.word || '').trim();
  if (!text) return null;
  if (chineseCharCount(text) < 2) return null;
  if (text.length > 15) return null;

  // Use pinyin-pro with the text (more consistent with runtime) rather
  // than the dataset's own `pinyin` field — handles 多音字 context the
  // same way the live engine does.
  const py = pinyin(text, {
    type: 'array',
    toneType: 'symbol',
    multiple: false
  });
  const finals = py.map(extractFinal);
  if (finals.some((f) => !f || !VALID_FINALS.has(f))) return null;

  const quality = scoreIdiom(entry);

  return {
    text,
    finals,
    length: finals.length,
    quality: Math.round(quality * 10000) / 10000,
    tags: ['idiom', 'xinhua'],
    source: 'xinhua-idiom'
  };
}

async function main() {
  const raw = await loadXinhuaIdioms();
  console.error(`[xinhua] ${raw.length} raw idioms`);

  const seen = new Set();
  const records = [];
  let drops = { parse: 0, dup: 0 };

  for (const entry of raw) {
    const rec = processXinhuaEntry(entry);
    if (!rec) {
      drops.parse++;
      continue;
    }
    if (seen.has(rec.text)) {
      drops.dup++;
      continue;
    }
    seen.add(rec.text);
    records.push(rec);
    if (records.length >= MAX_ENTRIES) break;
  }

  console.error(
    `[build] kept ${records.length}, dropped ${drops.parse} (parse) + ${drops.dup} (dup)`
  );

  // Sort by quality desc, then text, for stable diffs across runs.
  records.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    return a.text.localeCompare(b.text, 'zh-Hans');
  });

  const doc = {
    version: 2,
    generated: new Date().toISOString(),
    count: records.length,
    phrases: records
  };

  await fsp.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fsp.writeFile(OUTPUT_PATH, JSON.stringify(doc), 'utf-8');

  const sizeKb = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
  console.error(`[pack] wrote ${records.length} entries (${sizeKb} kB) → ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
