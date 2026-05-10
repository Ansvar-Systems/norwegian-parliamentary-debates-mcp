/**
 * Tool registry for Norwegian Parliamentary Debates MCP Server.
 * Single source of truth for tool definitions and dispatch.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import {
  searchParliamentaryDebates,
  SearchDebatesInput,
} from './search-parliamentary-debates.js';
import { getSpeech, GetSpeechInput } from './get-speech.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { getAbout, type AboutContext } from './about.js';
import { listSources } from './list-sources.js';
import { checkDataFreshness } from './check-data-freshness.js';

export type { AboutContext } from './about.js';

const LIST_SOURCES_TOOL: Tool = {
  name: 'list_sources',
  description:
    'List all data sources used by this MCP server with provenance metadata. ' +
    'Returns source authority, license, coverage, and known limitations. ' +
    'Use this to understand where the data comes from and how current it is.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, and provenance. ' +
    'Call this to verify data coverage, corpus version, and attribution before citing results.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const CHECK_DATA_FRESHNESS_TOOL: Tool = {
  name: 'check_data_freshness',
  description:
    'Returns the corpus build timestamp and per-source last_verified dates with staleness_days against a 30-day threshold (ParlaMint-NO is a static archival corpus, but verification cadence is monthly). ' +
    'Use this to verify whether the data backing this MCP is current before relying on it for compliance work. ' +
    'For full source provenance, use list_sources; for server statistics, use about.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_parliamentary_debates',
    description:
      'Search Norwegian Storting plenary debates by keyword. ' +
      'FTS5 full-text search with BM25 ranking across speech bodies. ' +
      'Supports optional filters: speaker name, party, date range. ' +
      'Returns speech excerpts with full _citation triple (publisher: clarin.si, license: CC-BY-4.0). ' +
      'Source: ParlaMint-NO 3.0 (CLARIN.SI), Stortinget debates 2000–2022.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          description: 'Search query in Norwegian or English. Supports FTS5 syntax.',
        },
        speaker: {
          type: 'string',
          description: 'Filter by speaker name (partial match, case-insensitive).',
        },
        party: {
          type: 'string',
          description:
            'Filter by party abbreviation — exact values in corpus: ' +
            '"A" (Arbeiderpartiet), "H", "FrP", "Sp", "SV", "V", "KrF", "MDG", "R". ' +
            'Case-insensitive. Note: Arbeiderpartiet is stored as "A", not "Ap".',
        },
        date_from: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Start date filter (YYYY-MM-DD, inclusive).',
        },
        date_to: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'End date filter (YYYY-MM-DD, inclusive).',
        },
        limit: {
          type: 'number',
          default: 10,
          minimum: 1,
          maximum: 50,
          description: 'Maximum results to return.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_speech',
    description:
      'Retrieve the full text of a single Storting speech by its ParlaMint-NO id. ' +
      'Returns the complete body, speaker metadata, and _citation triple. ' +
      'Use search_parliamentary_debates first to find speech ids.',
    inputSchema: {
      type: 'object',
      properties: {
        speech_id: {
          type: 'string',
          description:
            'ParlaMint-NO TEI xml:id for the speech ' +
            '(e.g. "ParlaMint-NO_2020-04-17.ud450e122"). ' +
            'Obtain from search_parliamentary_debates results.',
        },
      },
      required: ['speech_id'],
    },
  },
  {
    name: 'format_citation',
    description:
      'Format a ParlaMint-NO speech citation in standard form. ' +
      'Validates the speech id and returns a formatted citation string with CC-BY-4.0 attribution.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          minLength: 1,
          description:
            'Speech id to format (e.g. "ParlaMint-NO_2020-04-17.ud450e122").',
        },
        format: {
          type: 'string',
          enum: ['full', 'short', 'pinpoint'],
          default: 'full',
          description:
            'Output format: full (with corpus attribution), ' +
            'short (date only), pinpoint (date + speech id).',
        },
      },
      required: ['citation'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context
    ? [...TOOLS, LIST_SOURCES_TOOL, CHECK_DATA_FRESHNESS_TOOL, ABOUT_TOOL]
    : [...TOOLS, LIST_SOURCES_TOOL, CHECK_DATA_FRESHNESS_TOOL];
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_parliamentary_debates':
          result = await searchParliamentaryDebates(
            db,
            args as unknown as SearchDebatesInput,
          );
          break;

        case 'get_speech':
          result = await getSpeech(db, args as unknown as GetSpeechInput);
          break;

        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;

        case 'list_sources':
          result = listSources(db);
          break;
        case 'check_data_freshness':
          result = checkDataFreshness(db, { thresholdDays: 30 });
          break;

        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
          break;

        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
        isError: true,
      };
    }
  });
}
