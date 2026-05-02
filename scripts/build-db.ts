#!/usr/bin/env tsx
/**
 * Database builder for Norwegian Parliamentary Debates MCP.
 *
 * Builds the SQLite database from seed JSON files in data/seed/.
 * Run: npm run build:db
 *
 * Schema: one row per speech (TEI <u> element).
 * FTS5 table indexes the speech body for full-text search.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const DB_PATH = path.resolve(__dirname, '../data/database.db');

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

const SCHEMA = `
CREATE TABLE speeches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  speech_id TEXT NOT NULL UNIQUE,
  speaker_name TEXT NOT NULL,
  speaker_id TEXT NOT NULL,
  speaker_party TEXT,
  speaker_role TEXT NOT NULL DEFAULT 'regular',
  date TEXT NOT NULL,
  session TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  ingested_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_speeches_date ON speeches(date);
CREATE INDEX idx_speeches_speaker_id ON speeches(speaker_id);
CREATE INDEX idx_speeches_speaker_party ON speeches(speaker_party);

CREATE VIRTUAL TABLE speeches_fts USING fts5(
  body,
  content='speeches',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER speeches_ai AFTER INSERT ON speeches BEGIN
  INSERT INTO speeches_fts(rowid, body)
  VALUES (new.id, new.body);
END;

CREATE TRIGGER speeches_ad AFTER DELETE ON speeches BEGIN
  INSERT INTO speeches_fts(speeches_fts, rowid, body)
  VALUES ('delete', old.id, old.body);
END;

CREATE TRIGGER speeches_au AFTER UPDATE ON speeches BEGIN
  INSERT INTO speeches_fts(speeches_fts, rowid, body)
  VALUES ('delete', old.id, old.body);
  INSERT INTO speeches_fts(rowid, body)
  VALUES (new.id, new.body);
END;

CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function buildDatabase(): void {
  console.log('Building Norwegian Parliamentary Debates database...\n');

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(SCHEMA);

  const insertSpeech = db.prepare(`
    INSERT OR IGNORE INTO speeches
      (speech_id, speaker_name, speaker_id, speaker_party, speaker_role, date, session, body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory at ${SEED_DIR} — creating empty database.`);
    writeMeta(db);
    db.close();
    return;
  }

  const seedFiles = fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.'));

  if (seedFiles.length === 0) {
    console.log('No seed files found. Database created with empty schema.');
    writeMeta(db);
    db.close();
    return;
  }

  let totalInserted = 0;
  let totalSkipped = 0;

  const loadBatch = db.transaction((speeches: SpeechSeed[]) => {
    for (const s of speeches) {
      const result = insertSpeech.run(
        s.speech_id,
        s.speaker_name,
        s.speaker_id,
        s.speaker_party ?? null,
        s.speaker_role,
        s.date,
        s.session,
        s.body,
      );
      if (result.changes > 0) {
        totalInserted++;
      } else {
        totalSkipped++;
      }
    }
  });

  for (const file of seedFiles) {
    const filePath = path.join(SEED_DIR, file);
    console.log(`  Loading ${file}...`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const speeches = JSON.parse(content) as SpeechSeed[];

    loadBatch(speeches);
    console.log(`    ${speeches.length} speeches from ${file}`);
  }

  writeMeta(db);

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.exec('ANALYZE');
  db.close();

  const size = fs.statSync(DB_PATH).size;
  console.log(
    `\nBuild complete: ${totalInserted} speeches inserted, ${totalSkipped} duplicates skipped`
  );
  console.log(`Output: ${DB_PATH} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

function writeMeta(db: Database.Database): void {
  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  const writeMeta = db.transaction(() => {
    insertMeta.run('tier', 'free');
    insertMeta.run('schema_version', '1');
    insertMeta.run('built_at', new Date().toISOString());
    insertMeta.run('builder', 'build-db.ts');
    insertMeta.run('corpus', 'ParlaMint-NO 3.0');
    insertMeta.run('corpus_url', 'http://hdl.handle.net/11356/1486');
    insertMeta.run('corpus_license', 'CC-BY-4.0');
  });
  writeMeta();
}

buildDatabase();
