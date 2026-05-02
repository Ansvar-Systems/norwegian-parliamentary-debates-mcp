/**
 * Citation metadata for the parliamentary debates MCP.
 *
 * Source: CLARIN.SI ParlaMint-NO 3.0, CC-BY-4.0
 * Handle: http://hdl.handle.net/11356/1486
 *
 * Each speech is identified by its TEI xml:id (e.g. ParlaMint-NO_2020-04-17.ud450e122).
 * source_url points to the corpus landing page; source_url_pinpoint carries the speech id.
 * This matches source_url_pattern_granularity = "landing-page" in the fleet manifest.
 *
 * See: docs/superpowers/specs/2026-05-02-source-attribution-airtight-design.md
 */

export interface CitationMetadata {
  source_url: string;
  source_url_pinpoint: string;
  publisher: string;
  license: string;
  canonical_ref: string;
  display_text: string;
  attribution_text: string;
  lookup: {
    tool: string;
    args: Record<string, string>;
  };
}

const CORPUS_LANDING_PAGE = 'https://www.clarin.si/repository/xmlui/handle/11356/1486';
const PUBLISHER = 'clarin.si';
const LICENSE = 'CC-BY-4.0';
const ATTRIBUTION_TEXT =
  'ParlaMint-NO corpus by CLARIN.SI/Lars Magne Tungland et al.; ' +
  'Norwegian Storting parliamentary debates (CC-BY-4.0, http://hdl.handle.net/11356/1486)';

/**
 * Build citation metadata for a single Storting speech.
 *
 * @param speechId    DB speech id, also the TEI xml:id (e.g. "ParlaMint-NO_2020-04-17.ud450e122")
 * @param speakerName Full speaker name (e.g. "Mari Holm Lønseth")
 * @param speakerParty Party abbreviation (e.g. "H"), or null if unknown
 * @param date        ISO date of the debate (e.g. "2020-04-17")
 */
export function buildSpeechCitation(
  speechId: string,
  speakerName: string,
  speakerParty: string | null,
  date: string,
): CitationMetadata {
  const partyLabel = speakerParty ? ` (${speakerParty})` : '';
  const displayText = `${speakerName}${partyLabel} — Stortinget ${date}`;

  return {
    source_url: CORPUS_LANDING_PAGE,
    source_url_pinpoint: speechId,
    publisher: PUBLISHER,
    license: LICENSE,
    canonical_ref: speechId,
    display_text: displayText,
    attribution_text: ATTRIBUTION_TEXT,
    lookup: {
      tool: 'get_speech',
      args: { speech_id: speechId },
    },
  };
}
