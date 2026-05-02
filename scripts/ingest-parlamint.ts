#!/usr/bin/env tsx
/**
 * Ingest ParlaMint-NO TEI XML files into seed JSON files.
 *
 * Uses the local ParlaMint-NO.tgz archive (data/cache/ParlaMint-NO.tgz).
 * If the archive is absent, prints a wget command to download it.
 *
 * Key insight: fast-xml-parser collects <note> and <u> elements into
 * separate arrays within each <div>. The n-th <note type="speaker"> 
 * corresponds to the n-th <u> element within the same div. Index-based
 * pairing is the correct extraction strategy.
 *
 * Usage:
 *   npm run ingest                        # full corpus
 *   npm run ingest -- --year 2021        # single year
 *   npm run ingest -- --limit 5000       # cap at N speeches
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(__dirname, '../data/cache');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const ARCHIVE_PATH = path.join(CACHE_DIR, 'ParlaMint-NO.tgz');
const CORPUS_URL =
  'https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1486/ParlaMint-NO.tgz?sequence=19&isAllowed=y';

interface SpeechSeed {
  speech_id: string;
  speaker_name: string;
  speaker_id: string;
  speaker_party: string | null;
  speaker_role: string;
  date: string;
  session: string;
  body: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { years: string[]; limit: number } {
  const args = process.argv.slice(2);
  const years: string[] = [];
  let limit = Infinity;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) {
      years.push(args[++i]);
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    }
  }

  return { years, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaker note parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseSpeakerNote(noteText: string): { name: string; party: string | null } {
  const cleaned = noteText.replace(/:\s*$/, '').trim();

  // "Mari Holm Lønseth (H) [09:02:19] (ordfører for saken):" → name="Mari Holm Lønseth", party="H"
  const partyMatch = cleaned.match(/^(.+?)\s*\(([A-ZÆØÅ][a-zA-ZÆØÅæøå]{0,5})\)/);
  if (partyMatch) {
    return { name: partyMatch[1].trim(), party: partyMatch[2] };
  }

  // No party — strip any timestamp suffix
  const nameOnly = cleaned.replace(/\s*\[.*\].*$/, '').trim();
  return { name: nameOnly || cleaned, party: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEI XML parsing
// ─────────────────────────────────────────────────────────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  textNodeName: '#text',
  isArray: (name) => ['u', 'seg', 'note', 'div'].includes(name),
});

function extractUText(u: Record<string, unknown>): string {
  const segs = (u['seg'] as Array<Record<string, unknown>> | undefined) ?? [];
  const parts: string[] = [];

  for (const seg of segs) {
    const t = seg['#text'];
    if (t) parts.push(String(t).trim());
  }

  if (parts.length === 0 && u['#text']) {
    parts.push(String(u['#text']).trim());
  }

  return parts.filter(p => p.length > 0).join(' ');
}

function parseSessionXml(xmlContent: string, filename: string): SpeechSeed[] {
  const dateMatch = filename.match(/ParlaMint-NO_(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : 'unknown';

  let parsed: Record<string, unknown>;
  try {
    parsed = XML_PARSER.parse(xmlContent) as Record<string, unknown>;
  } catch (err) {
    console.error(`  WARN: XML parse error in ${filename}: ${err}`);
    return [];
  }

  // Extract session from teiHeader/fileDesc/titleStmt/meeting[@ana~=parla.session]
  let session = '';
  try {
    const tei = parsed['TEI'] as Record<string, unknown>;
    const header = tei?.['teiHeader'] as Record<string, unknown>;
    const fileDesc = header?.['fileDesc'] as Record<string, unknown>;
    const titleStmt = fileDesc?.['titleStmt'] as Record<string, unknown>;
    const meetings = (titleStmt?.['meeting'] as Array<Record<string, unknown>>) ?? [];
    for (const m of meetings) {
      if (String(m['@_ana'] ?? '').includes('parla.session')) {
        session = String(m['@_n'] ?? '');
        break;
      }
    }
  } catch { /* ignore */ }

  const speeches: SpeechSeed[] = [];

  try {
    const tei = parsed['TEI'] as Record<string, unknown>;
    const text = tei?.['text'] as Record<string, unknown>;
    const body = text?.['body'] as Record<string, unknown>;
    const divs = (body?.['div'] as Array<Record<string, unknown>>) ?? [];

    // Each div contains parallel arrays of notes and u elements.
    // The n-th <note type="speaker"> maps to the n-th <u> in the same div.
    const processDiv = (div: Record<string, unknown>): void => {
      const allNotes = (div['note'] as Array<Record<string, unknown>> | undefined) ?? [];
      const speakerNotes = allNotes.filter(n => n['@_type'] === 'speaker');
      const utterances = (div['u'] as Array<Record<string, unknown>> | undefined) ?? [];

      for (let i = 0; i < utterances.length; i++) {
        const u = utterances[i];
        const who = String(u['@_who'] ?? '').replace(/^#/, '');
        const ana = String(u['@_ana'] ?? '');
        const uId = String(u['@_xml:id'] ?? u['@_id'] ?? '');

        if (!uId) continue;

        const bodyText = extractUText(u);
        if (!bodyText || bodyText.length < 5) continue;

        const role = ana.includes('#chair') ? 'chair' : 'regular';

        // Use the i-th speaker note if available
        let speakerName = who;
        let speakerParty: string | null = null;
        if (i < speakerNotes.length && speakerNotes[i]['#text']) {
          const parsed = parseSpeakerNote(String(speakerNotes[i]['#text']));
          speakerName = parsed.name;
          speakerParty = parsed.party;
        }

        speeches.push({
          speech_id: uId,
          speaker_name: speakerName,
          speaker_id: who,
          speaker_party: speakerParty,
          speaker_role: role,
          date,
          session,
          body: bodyText,
        });
      }

      // Recurse into nested divs
      const nestedDivs = (div['div'] as Array<Record<string, unknown>> | undefined) ?? [];
      for (const nested of nestedDivs) {
        processDiv(nested);
      }
    };

    for (const div of divs) {
      processDiv(div);
    }
  } catch (err) {
    console.error(`  WARN: Body walk error in ${filename}: ${err}`);
  }

  return speeches;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { years, limit } = parseArgs();

  console.log('Norwegian Parliamentary Debates — ParlaMint-NO 3.0 ingestion');
  console.log(`Years filter: ${years.length > 0 ? years.join(', ') : 'all'}`);
  console.log(`Limit: ${isFinite(limit) ? limit : 'none'}`);
  console.log('');

  if (!fs.existsSync(ARCHIVE_PATH)) {
    console.log(`Archive not found at ${ARCHIVE_PATH}; downloading from CLARIN...`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const download = spawnSync(
      'wget',
      ['-q', '--show-progress', '-O', ARCHIVE_PATH, CORPUS_URL],
      { stdio: 'inherit' }
    );
    if (download.status !== 0) {
      // Clean up partial download so a retry doesn't see a corrupt file as cached
      if (fs.existsSync(ARCHIVE_PATH)) fs.unlinkSync(ARCHIVE_PATH);
      console.error(
        `Failed to download archive (wget exit ${download.status}).\n` +
        `Manual download:\n` +
        `  mkdir -p "${CACHE_DIR}"\n` +
        `  wget -O "${ARCHIVE_PATH}" '${CORPUS_URL}'\n`
      );
      process.exit(1);
    }
    console.log(`Downloaded to ${ARCHIVE_PATH}`);
  }

  // Use system tar to list archive contents
  console.log('Listing archive contents...');
  const listResult = spawnSync('tar', ['-tzf', ARCHIVE_PATH], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });

  if (listResult.error) {
    console.error('Failed to list archive:', listResult.error.message);
    process.exit(1);
  }

  let xmlFiles = listResult.stdout
    .split('\n')
    .filter(f => f.endsWith('.xml') && !f.includes('/Schema/'));

  if (years.length > 0) {
    xmlFiles = xmlFiles.filter(f => years.some(y => f.includes(`/${y}/`)));
  }

  xmlFiles.sort();
  console.log(`Found ${xmlFiles.length} session XML files to process.\n`);

  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  let totalSpeeches = 0;
  let filesProcessed = 0;
  let filesSaved = 0;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlamint-'));
  console.log(`Extracting to temp dir: ${tmpDir}`);

  try {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < xmlFiles.length; i += CHUNK_SIZE) {
      if (totalSpeeches >= limit) break;
      const chunk = xmlFiles.slice(i, i + CHUNK_SIZE);
      spawnSync('tar', ['-xzf', ARCHIVE_PATH, '-C', tmpDir, ...chunk], {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
      });
    }

    for (const xmlPath of xmlFiles) {
      if (totalSpeeches >= limit) break;

      const localPath = path.join(tmpDir, xmlPath);
      if (!fs.existsSync(localPath)) continue;

      const filename = path.basename(xmlPath);
      const xmlContent = fs.readFileSync(localPath, 'utf-8');
      const speeches = parseSessionXml(xmlContent, filename);

      if (speeches.length === 0) {
        filesProcessed++;
        continue;
      }

      const remaining = isFinite(limit) ? limit - totalSpeeches : speeches.length;
      const toSave = speeches.slice(0, remaining);

      const seedFilename = filename.replace('.xml', '.json');
      const seedPath = path.join(SEED_DIR, seedFilename);
      fs.writeFileSync(seedPath, JSON.stringify(toSave, null, 2));

      totalSpeeches += toSave.length;
      filesProcessed++;
      filesSaved++;

      if (filesProcessed % 100 === 0) {
        console.log(`  [${filesProcessed}/${xmlFiles.length}] ${totalSpeeches} speeches...`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\nIngestion complete:`);
  console.log(`  XML files processed: ${filesProcessed}`);
  console.log(`  Seed files written:  ${filesSaved}`);
  console.log(`  Speeches total:      ${totalSpeeches}`);
  console.log(`\nNext step: npm run build:db`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
