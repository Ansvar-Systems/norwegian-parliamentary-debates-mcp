/**
 * list_sources tool — returns data provenance metadata.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ListSourcesResult {
  jurisdiction: string;
  sources: Array<{
    name: string;
    authority: string;
    url: string;
    retrieval_method: string;
    update_frequency: string;
    last_ingested: string;
    license: string;
    attribution: string;
    coverage: string;
    limitations: string;
  }>;
  data_freshness: {
    automated_checks: boolean;
    check_frequency: string;
    last_verified: string;
  };
}

function readBuildDate(db?: InstanceType<typeof Database>): string {
  if (!db) return 'unknown';
  try {
    const hasTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='db_metadata'"
    ).get();
    if (!hasTable) return 'unknown';

    const row = db.prepare("SELECT value FROM db_metadata WHERE key = 'built_at'").get() as
      | { value: string }
      | undefined;
    if (row?.value && row.value !== 'unknown') {
      return row.value.slice(0, 10);
    }
  } catch {
    // Non-fatal
  }
  return 'unknown';
}

export function listSources(db?: InstanceType<typeof Database>): ListSourcesResult {
  const buildDate = readBuildDate(db);
  const lastIngested = buildDate !== 'unknown' ? buildDate : 'see about tool';

  return {
    jurisdiction: 'Norway (NO)',
    sources: [
      {
        name: 'CLARIN.SI ParlaMint-NO 3.0',
        authority: 'CLARIN ERIC (Slovenian CLARIN centre) / Lars Magne Tungland (National Library of Norway)',
        url: 'https://www.clarin.si/repository/xmlui/handle/11356/1486',
        retrieval_method: 'BULK_DOWNLOAD_ARCHIVE (single tgz, 412MB)',
        update_frequency: 'static (v3.0 released 2023-06-17, no planned updates)',
        last_ingested: lastIngested,
        license: 'CC-BY-4.0 (Creative Commons Attribution 4.0 International)',
        attribution:
          'ParlaMint-NO corpus by CLARIN.SI/Lars Magne Tungland et al.; ' +
          'Norwegian Storting parliamentary debates (CC-BY-4.0, http://hdl.handle.net/11356/1486)',
        coverage:
          'Stortinget plenary debate Hansard 2000–2022; ' +
          'TEI-encoded speeches with speaker name, party, role, date, session, and term metadata. ' +
          '1,500+ session XML files across 23 years.',
        limitations:
          'Plenary sessions only — no committee proceedings, written questions, or interpellations. ' +
          'Ends mid-2022. Speaker party extracted from note text; may be empty for presiding officers.',
      },
    ],
    data_freshness: {
      automated_checks: false,
      check_frequency: 'static corpus — no updates expected',
      last_verified: lastIngested,
    },
  };
}
