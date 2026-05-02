/**
 * get_speech — Retrieve a single Storting speech by id.
 *
 * Source: CLARIN.SI ParlaMint-NO 3.0, CC-BY-4.0
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildSpeechCitation, type CitationMetadata } from '../utils/citation.js';

export interface GetSpeechInput {
  speech_id: string;
}

export interface SpeechDetail {
  speech_id: string;
  speaker_name: string;
  speaker_id: string;
  speaker_party: string | null;
  speaker_role: string;
  date: string;
  session: string;
  body: string;
  _citation: CitationMetadata;
}

interface SpeechRow {
  speech_id: string;
  speaker_name: string;
  speaker_id: string;
  speaker_party: string | null;
  speaker_role: string;
  date: string;
  session: string;
  body: string;
}

export async function getSpeech(
  db: Database,
  input: GetSpeechInput
): Promise<ToolResponse<SpeechDetail | null>> {
  if (!input.speech_id || !input.speech_id.trim()) {
    return {
      results: null,
      _meta: {
        ...generateResponseMetadata(db),
        note: 'speech_id is required',
      },
    };
  }

  const row = db.prepare(`
    SELECT speech_id, speaker_name, speaker_id, speaker_party, speaker_role, date, session, body
    FROM speeches
    WHERE speech_id = ?
  `).get(input.speech_id) as SpeechRow | undefined;

  if (!row) {
    return {
      results: null,
      _meta: {
        ...generateResponseMetadata(db),
        note: `No speech found with id "${input.speech_id}"`,
      },
    };
  }

  return {
    results: {
      speech_id: row.speech_id,
      speaker_name: row.speaker_name,
      speaker_id: row.speaker_id,
      speaker_party: row.speaker_party,
      speaker_role: row.speaker_role,
      date: row.date,
      session: row.session,
      body: row.body,
      _citation: buildSpeechCitation(
        row.speech_id,
        row.speaker_name,
        row.speaker_party,
        row.date,
      ),
    },
    _meta: generateResponseMetadata(db),
  };
}
