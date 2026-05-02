/**
 * about — Server metadata, dataset statistics, and provenance.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface AboutContext {
  version: string;
  fingerprint: string;
  dbBuilt: string;
}

function safeCount(db: InstanceType<typeof Database>, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

export function getAbout(db: InstanceType<typeof Database>, context: AboutContext) {
  const stats: Record<string, number> = {
    speeches: safeCount(db, 'SELECT COUNT(*) as count FROM speeches'),
    unique_speakers: safeCount(db, 'SELECT COUNT(DISTINCT speaker_id) as count FROM speeches'),
    unique_parties: safeCount(db, 'SELECT COUNT(DISTINCT speaker_party) as count FROM speeches WHERE speaker_party IS NOT NULL'),
    session_dates: safeCount(db, 'SELECT COUNT(DISTINCT date) as count FROM speeches'),
  };

  return {
    name: 'Norwegian Parliamentary Debates MCP',
    version: context.version,
    jurisdiction: 'NO',
    description:
      'Norwegian Storting plenary debate transcripts from ParlaMint-NO 3.0 (CLARIN.SI, CC-BY-4.0). ' +
      'Covers 2000–2022 Stortinget sessions.',
    stats,
    data_sources: [
      {
        name: 'CLARIN.SI ParlaMint-NO 3.0',
        url: 'https://www.clarin.si/repository/xmlui/handle/11356/1486',
        authority: 'CLARIN ERIC / Lars Magne Tungland (National Library of Norway)',
        license: 'CC-BY-4.0',
        coverage: 'Stortinget plenary debates 2000–2022, TEI encoded',
      },
    ],
    freshness: {
      corpus_release: '2023-06-17',
      database_built: context.dbBuilt,
      fingerprint: context.fingerprint,
    },
    attribution:
      'ParlaMint-NO corpus by CLARIN.SI/Lars Magne Tungland et al.; ' +
      'Norwegian Storting parliamentary debates (CC-BY-4.0, http://hdl.handle.net/11356/1486)',
    disclaimer:
      'Research tool only. Verify against official Stortinget records at stortinget.no.',
    network: {
      name: 'Ansvar MCP Network',
      directory: 'https://ansvar.ai/mcp',
    },
  };
}
