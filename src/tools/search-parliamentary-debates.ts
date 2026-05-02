/**
 * search_parliamentary_debates — Full-text search across Norwegian Storting plenary speeches.
 *
 * Source: CLARIN.SI ParlaMint-NO 3.0, CC-BY-4.0
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildSpeechCitation, type CitationMetadata } from '../utils/citation.js';

export interface SearchDebatesInput {
  query: string;
  speaker?: string;
  party?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export interface DebateSearchResult {
  speech_id: string;
  speaker_name: string;
  speaker_party: string | null;
  speaker_role: string;
  date: string;
  session: string;
  snippet: string;
  relevance: number;
  _citation: CitationMetadata;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function searchParliamentaryDebates(
  db: Database,
  input: SearchDebatesInput
): Promise<ToolResponse<DebateSearchResult[]>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: [],
      _meta: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const fetchLimit = limit * 3; // extra for party/date post-filtering
  const queryVariants = buildFtsQueryVariants(input.query);

  interface SpeechRow {
    speech_id: string;
    speaker_name: string;
    speaker_party: string | null;
    speaker_role: string;
    date: string;
    session: string;
    snippet: string;
    relevance: number;
  }

  const runQuery = (ftsQuery: string): DebateSearchResult[] => {
    const params: (string | number)[] = [ftsQuery];
    let sql = `
      SELECT
        s.speech_id,
        s.speaker_name,
        s.speaker_party,
        s.speaker_role,
        s.date,
        s.session,
        snippet(speeches_fts, 0, '>>>', '<<<', '...', 32) as snippet,
        bm25(speeches_fts) as relevance
      FROM speeches_fts
      JOIN speeches s ON s.id = speeches_fts.rowid
      WHERE speeches_fts MATCH ?
    `;

    if (input.speaker) {
      sql += ` AND s.speaker_name LIKE ?`;
      params.push(`%${input.speaker}%`);
    }

    if (input.party) {
      // Party abbreviations in the corpus: A (not Ap), FrP, H, Sp, SV, V, KrF, MDG, R, etc.
      // Exact case-insensitive match. Note: Arbeiderpartiet is stored as "A", not "Ap".
      sql += ` AND s.speaker_party = ? COLLATE NOCASE`;
      params.push(input.party.trim());
    }

    if (input.date_from) {
      sql += ` AND s.date >= ?`;
      params.push(input.date_from);
    }

    if (input.date_to) {
      sql += ` AND s.date <= ?`;
      params.push(input.date_to);
    }

    sql += ` ORDER BY relevance LIMIT ?`;
    params.push(fetchLimit);

    const rows = db.prepare(sql).all(...params) as SpeechRow[];
    return rows.slice(0, limit).map(row => ({
      speech_id: row.speech_id,
      speaker_name: row.speaker_name,
      speaker_party: row.speaker_party,
      speaker_role: row.speaker_role,
      date: row.date,
      session: row.session,
      snippet: row.snippet,
      relevance: row.relevance,
      _citation: buildSpeechCitation(
        row.speech_id,
        row.speaker_name,
        row.speaker_party,
        row.date,
      ),
    }));
  };

  const primaryResults = runQuery(queryVariants.primary);
  if (primaryResults.length > 0) {
    return {
      results: primaryResults,
      _meta: generateResponseMetadata(db),
    };
  }

  if (queryVariants.fallback) {
    const fallbackResults = runQuery(queryVariants.fallback);
    if (fallbackResults.length > 0) {
      return {
        results: fallbackResults,
        _meta: {
          ...generateResponseMetadata(db),
          query_strategy: 'broadened',
        },
      };
    }
  }

  return {
    results: [],
    _meta: generateResponseMetadata(db),
  };
}
