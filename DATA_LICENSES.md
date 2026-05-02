# Data Licenses

## Sources

### CLARIN.SI ParlaMint-NO — Norwegian parliamentary debates corpus

- **License:** CC BY 4.0 — Creative Commons Attribution 4.0 International
- **License URL:** https://creativecommons.org/licenses/by/4.0/
- **Source artifact:** ParlaMint-NO 3.0 at https://www.clarin.si/repository/xmlui/handle/11356/1486
- **Source-of-source:** Stortinget open data API (https://data.stortinget.no/) + Wikidata speaker metadata
- **Coverage:** Stortinget plenary debate minutes 2000–2022; includes COVID-19 and war subcorpus markers
- **Attribution required:** Yes. Attribution text: "ParlaMint-NO corpus by CLARIN.SI / Lars Magne Tungland et al.; Norwegian Storting parliamentary debates (CC-BY-4.0, http://hdl.handle.net/11356/1486)"
- **Commercial use:** permitted under CC-BY-4.0
- **AI training/development:** permitted under CC-BY-4.0

**Licence determination note:** The CLARIN.SI handle page, the corpus-level TEI header, and each per-session XML file all declare `<licence>http://creativecommons.org/licenses/by/4.0/</licence>`. An earlier National Library documentation PDF (https://www.nb.no/sbfil/parlamint/ParlaMint-NO-eng.pdf) embedded a CC0-1.0 URI. The downloaded artifact is authoritative per the Ansvar source-attribution standard; the operative licence is therefore CC-BY-4.0. The `_citation.license` field in tool responses is set to `"CC-BY-4.0"`.

## Code License

The MCP server software (TypeScript code, Dockerfile, ingestion scripts) is licensed under Apache-2.0. See [LICENSE](LICENSE).

The Apache-2.0 code license applies to the software only. The corpus data carries its own CC-BY-4.0 licence as described above.
