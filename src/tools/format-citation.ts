/**
 * format_citation — Format a parliamentary debate citation.
 *
 * Accepts either a speech_id (ParlaMint-NO TEI xml:id format) or
 * a free-text description and normalizes it to a standard citation.
 */

import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface FormatCitationInput {
  citation: string;
  format?: 'full' | 'short' | 'pinpoint';
}

export interface FormatCitationResult {
  input: string;
  formatted: string;
  type: string;
  valid: boolean;
  attribution?: string;
  error?: string;
}

const SPEECH_ID_PATTERN = /^ParlaMint-NO_(\d{4}-\d{2}-\d{2})\.(u[a-f0-9]+)$/;

export async function formatCitationTool(
  input: FormatCitationInput
): Promise<ToolResponse<FormatCitationResult>> {
  const meta = generateResponseMetadata();

  if (!input.citation || input.citation.trim().length === 0) {
    return {
      results: { input: '', formatted: '', type: 'unknown', valid: false, error: 'Empty citation' },
      _meta: meta,
    };
  }

  const trimmed = input.citation.trim();
  const match = SPEECH_ID_PATTERN.exec(trimmed);

  if (match) {
    const [, date, uId] = match;
    const format = input.format ?? 'full';

    let formatted: string;
    if (format === 'short') {
      formatted = `ParlaMint-NO ${date}`;
    } else if (format === 'pinpoint') {
      formatted = `ParlaMint-NO ${date} (${uId})`;
    } else {
      formatted =
        `Stortinget plenary debate ${date}, speech ${uId} — ` +
        `ParlaMint-NO 3.0 (CLARIN.SI, CC-BY-4.0)`;
    }

    return {
      results: {
        input: trimmed,
        formatted,
        type: 'parliamentary_speech',
        valid: true,
        attribution:
          'ParlaMint-NO corpus by CLARIN.SI/Lars Magne Tungland et al.; ' +
          'Norwegian Storting parliamentary debates (CC-BY-4.0, ' +
          'http://hdl.handle.net/11356/1486)',
      },
      _meta: meta,
    };
  }

  return {
    results: {
      input: trimmed,
      formatted: trimmed,
      type: 'free_text',
      valid: false,
      error:
        'Not a recognized ParlaMint-NO speech id. ' +
        'Expected format: ParlaMint-NO_YYYY-MM-DD.u<hex>. ' +
        'Use search_parliamentary_debates to find speech ids.',
    },
    _meta: meta,
  };
}
