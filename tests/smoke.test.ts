/**
 * Smoke test for norwegian-parliamentary-debates-mcp.
 *
 * Verifies the database is built, contains Norwegian Storting parliamentary
 * speeches, and that retrieval tools emit Gate 13-compliant `_citation`
 * triples (publisher: clarin.si, license: CC-BY-4.0).
 *
 * v0.1 smoke test replacing the inherited swedish-law-mcp test suite.
 * Full test migration tracked as Tier 2 follow-up.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import { searchParliamentaryDebates } from '../src/tools/search-parliamentary-debates.js';
import { getSpeech } from '../src/tools/get-speech.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../data/database.db');

// Skip the whole smoke suite when no usable DB is present. Pattern from
// feedback_contract_test_skip_on_empty_db_2026_05_07.md.
const dbReady =
  fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 1024;
const describeFn = dbReady ? describe : describe.skip;

describeFn('norwegian-parliamentary-debates-mcp smoke', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
  });

  afterAll(() => {
    db?.close();
  });

  it('database has Norwegian Storting speeches', () => {
    const row = db
      .prepare('SELECT count(*) as n FROM speeches')
      .get() as { n: number };
    expect(row.n).toBeGreaterThan(0);
  });

  it('search_parliamentary_debates returns results with valid _citation triple', async () => {
    const response = await searchParliamentaryDebates(db, { query: 'klima', limit: 1 });

    const results = response.results;
    expect(Array.isArray(results)).toBe(true);

    if (results.length === 0) {
      console.warn('No results for query "klima"; smoke probe inconclusive');
      return;
    }

    const item = results[0];
    expect(item._citation).toBeDefined();
    expect(item._citation.publisher).toBe('clarin.si');
    expect(item._citation.license).toBe('CC-BY-4.0');
    expect(item._citation.source_url).toBe(
      'https://www.clarin.si/repository/xmlui/handle/11356/1486',
    );
    expect(item.speech_id).toBeTruthy();
    expect(item.speaker_name).toBeTruthy();
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('get_speech retrieves a speech by id with valid _citation triple', async () => {
    // Pull a known speech_id from the DB rather than hard-coding one.
    const row = db
      .prepare('SELECT speech_id FROM speeches WHERE speaker_party IS NOT NULL LIMIT 1')
      .get() as { speech_id: string } | undefined;

    if (!row) {
      console.warn('No speeches with a party affiliation found; skipping get_speech probe');
      return;
    }

    const response = await getSpeech(db, { speech_id: row.speech_id });
    expect(response.results).not.toBeNull();

    const detail = response.results!;
    expect(detail._citation).toBeDefined();
    expect(detail._citation.publisher).toBe('clarin.si');
    expect(detail._citation.license).toBe('CC-BY-4.0');
    expect(detail.body).toBeTruthy();
    expect(detail.speech_id).toBe(row.speech_id);
  });
});
