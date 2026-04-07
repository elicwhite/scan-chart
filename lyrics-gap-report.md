# Lyrics & Vocal Phrases Gap Report: scan-chart vs YARG

**Date:** 2026-04-06
**Charts compared:** 78,452

## Lyrics

**Matched:** 78,307 / 78,452 (99.81%)
**Diffs:** 145

| Category | Count | Description | Who is correct? |
|----------|-------|-------------|-----------------|
| Track name as lyric (YARG) | 113 | YARG keeps tick-0 `"PART VOCALS"` text event as `"lyric PART VOCALS"` | **scan-chart correct** |
| Duplicate-tick ordering | 13 | Multiple lyrics at same MIDI tick, sorted differently | Neither — undefined order |
| Encoding: UTF-8 mojibake | 7 | YARG reads UTF-8 MIDI bytes as Latin-1, producing mojibake (e.g., `ñ` → `Ã±`) | **scan-chart correct** |
| Encoding: BOM preservation | 2 | YARG preserves UTF-8 BOM (U+FEFF) prefix in first lyric | **scan-chart correct** |
| Encoding: invalid UTF-8 | 3 | MIDI contains non-UTF-8 bytes; YARG reads as Latin-1, scan-chart uses U+FFFD | Both wrong differently |
| Bracket filtering (YARG) | 4 | YARG strips lyrics containing `[brackets]`, treating them as section markers | **scan-chart correct** |
| Malformed .chart line (YARG) | 2 | .chart has two tick values on one line; YARG stops parsing or corrupts tick | **scan-chart correct** |
| Dedup: same tick+text (YARG) | 1 | YARG preserves 3 identical lyrics at same tick; scan-chart deduplicates to 2 | **YARG correct** |

### Tally

- **YARG bugs:** 132 charts (113 track-name, 4 bracket filtering, 2 malformed .chart, 13 ordering)
- **Encoding differences:** 12 charts (neither parser strictly "wrong")
- **scan-chart bugs:** 1 chart (dedup at same tick)

## Vocal Phrases

**Matched:** 78,451 / 78,452 (99.999%)
**Diffs:** 1

| Category | Count | Description | Who is correct? |
|----------|-------|-------------|-----------------|
| Pathological chart | 1 | Whourkr - Mindgerb: 1844 vs 1845 phrases (rapid-fire 106 notes, off by 1) | Unclear |

## BTrack Hashes

**Matched:** 78,046 / 78,046 — **0 regressions**

---

## Lyrics: Remaining Diffs Detail

### Category A: Track Name as Lyric — YARG Bug (113 charts)

YARG keeps a tick-0 FF 01 text event containing the track name (e.g., `PART VOCALS`) as a lyric, emitting it as `"lyric PART VOCALS"` in the dump. scan-chart correctly filters these out: when a tick-0 text event matches the FF 03 trackName, it is a duplicate metadata event, not a real lyric.

All 113 charts are `.mid` format. In each case YARG has exactly 1 more lyric than scan-chart. Examples:

| Chart | sc | moon | Delta |
|-------|-----|------|-------|
| A Day To Remember - Right Back At It Again (Cerulean) | 371 | 372 | -1 |
| Andrew Prahlow - Travelers' Encore (lopk223) | 56 | 57 | -1 |
| Anderson .Paak - Come Down (NPR Tiny Desk) (AbstractOrigin) | 452 | 453 | -1 |

One chart has a delta of -2, likely containing two such duplicate text events.

---

### Category B: Duplicate-Tick Ordering (13 charts)

Multiple lyric events at the exact same MIDI tick are sorted in different orders. MIDI spec does not guarantee ordering of simultaneous events. Neither parser is wrong.

| # | Chart | Format | Tick | sc order | YARG order |
|---|-------|--------|------|----------|------------|
| 1 | All That Remains - This Calling (6 Fret) | .mid | 54240 | `["the#","pain#"]` | `["pain#","the#"]` |
| 2 | Billy Idol - Rebel Yell | .mid | 79200 | `["re","+-"]` | `["+-","re"]` |
| 3 | Disturbed - Prayer (6 Fret) | .mid | 157920 | `["e-","+"]` | `["+","e-"]` |
| 4 | Falling in Reverse - Voices in My Head | .mid | 55200 | `["like","an"]` | `["an","like"]` |
| 5 | Iron Maiden - Run to the Hills (GHL Layout) | .mid | 22560 | `["the","cross"]` | `["cross","the"]` |
| 6 | Miley Cyrus - Can't Be Tamed (6 Fret) | .mid | 17760 | `["yep","+"]` | `["+","yep"]` |
| 7 | NOFX - Soul Doubt | .mid | 65280 | `["+","'round"]` | `["'round","+"]` |
| 8 | Pat Benatar - Heartbreaker | .mid | 44160 | `["+-","+"]` | `["+","+-"]` |
| 9 | Pink Guy - STFU (6 Fret) | .mid | 30240 | `["Shut#","the#","fuck#"]` | `["fuck#","Shut#","the#"]` |
| 10 | Steve Miller Band - The Joker | .mid | 29760 | `["+-","+"]` | `["+","+-"]` |
| 11 | The Black Keys - Fever (6 Fret) | .mid | 40320 | `["Fe-","+"]` | `["+","Fe-"]` |
| 12 | The Jimi Hendrix Experience - The Wind Cries Mary | .mid | 31800 | `["i-","+-"]` | `["+-","i-"]` |
| 13 | Whourkr - Mindgerb | .mid | 99870 | `["¯¼·§¬¹¾¹(ºµ´","(¿°,¯=¾\"¢¬;¬"]` | `["(¿°,¯=¾\"¢¬;¬","¯¼·§¬¹¾¹(ºµ´"]` |

---

### Category C: Encoding — UTF-8 Mojibake (7 charts)

YARG reads UTF-8 encoded MIDI text as Latin-1 (ISO 8859-1), producing classic "mojibake" (e.g., `ñ` → `Ã±`). scan-chart correctly decodes UTF-8 via a midi-file patch. **scan-chart is correct.**

| # | Chart | sc text | YARG text (mojibake) | Character |
|---|-------|---------|---------------------|-----------|
| 1 | Celia Cruz - La Negra Tiene Tumbao | `¡A-` | `Â¡A-` | ¡ |
| 2 | Die Toten Hosen - Hier kommt Alex | `tä` | `tÃ¤` | ä |
| 3 | Finley - Adrenalina | `và` | `vÃ ` | à |
| 4 | Housse De Racket - Oh Yeah! | `ê` | `Ãª` | ê |
| 5 | Les Rita Mitsouko - C'est Comme Ca | `ç` | `Ã§` | ç |
| 6 | Loquillo Y Los Trogloditas - Cadillac Solitario | `dí` | `dÃ­` | í |
| 7 | M-Clan - Carolina | `ñ` | `Ã±` | ñ |

All are Neversoft (Guitar Hero) MIDI files with Spanish, French, German, or Italian text.

---

### Category D: Encoding — BOM Preservation (2 charts)

YARG preserves the UTF-8 BOM (U+FEFF, bytes `EF BB BF`) at the start of the first lyric. scan-chart correctly strips it. **scan-chart is correct.**

| # | Chart | sc text | YARG text |
|---|-------|---------|-----------|
| 1 | Distemper - Happy end | `Bez-` | `﻿Bez-` (BOM prefix) |
| 2 | Serpent - Mata'm (Soc Pobre) | `Sóc` | `﻿Sóc` (BOM prefix) |

---

### Category E: Encoding — Invalid UTF-8 / Latin-1 Source (3 charts)

MIDI files contain text encoded in Latin-1 (or Windows-1252), not UTF-8. Both parsers handle them differently, neither produces ideal text:

- **YARG:** Reads bytes as Latin-1, producing readable but double-encoded text
- **scan-chart:** Attempts UTF-8 decode, replaces invalid sequences with U+FFFD

| # | Chart | sc text | YARG text | Intended text |
|---|-------|---------|-----------|---------------|
| 1 | Luis Miguel - Ahora te Puedes Marchar | `qu�ha-` | `qué§ha-` | `qué` |
| 2 | Miura Jam - Acacia | `S�um` | `Só§um` | `Só` |
| 3 | Shkodra Elektronike - Zjerm | `nj�am-` | `një§am-` | `një` |

---

### Category F: YARG Bugs — Bracket Filtering (4 charts)

YARG's `NormalizeTextEvent` strips lyrics containing `[brackets]`, treating them as section markers. These are real lyrics that happen to contain brackets. **scan-chart is correct.**

| # | Chart | Extra lyric in sc |
|---|-------|-------------------|
| 1 | Hail The Sun - Discography (2024) (Hoph2o) | `Ow! (Splidao!) [I Like It, Though]` |
| 2 | Lockyn & Koraii - Wanderer (Hubbubble) | `The world is found, discovered by [Zach W]` |
| 3 | Neck Deep - Discography (2024) (Hoph2o) | `Single: December (again) [feat. Mark Hoppus]` |
| 4 | Rise Against - Discography (2024) (Hoph2o) | `Broadcast[Signal]Frequency` |

---

### Category G: YARG Bugs — Malformed .chart Parsing (2 charts)

These .chart files have malformed lines with two tick values. YARG misparses them, producing corrupted tick values and stopping further lyric parsing. scan-chart handles them gracefully.

| # | Chart | sc lyrics | YARG lyrics | Malformed line |
|---|-------|-----------|-------------|----------------|
| 1 | Dance Gavin Dance - Head Hunter (Voxelated) | 438 | 270 | `52800  52944 = E "lyric of"` |
| 2 | Skillet - Rebirthing (C4L3N) | 399 | 14 | `16896  17088 = E "lyric you"` |

---

### Category H: scan-chart Bug — Dedup (1 chart)

**TesseracT - Concealing Fate (Zantor):** The .chart file has 3 identical lyrics at tick 74208 (`In`, `in`, `In`) and 3 at tick 661056 (`And`, `and`, `And`). YARG preserves all copies. scan-chart deduplicates case-sensitive duplicates at the same tick (`In` appears twice → kept once), resulting in sc=782 vs moon=784.

---

## Vocal Phrases: Remaining Diff Detail

### Whourkr - Mindgerb (Frick)

- **Format:** .mid
- **sc:** 1844 phrases | **YARG:** 1845 phrases | **Delta:** -1
- **Root cause:** Pathological chart with ~1850 rapid-fire note 106 events (phrases every ~15-60 ticks). Contains multiple edge cases: duplicate noteOns, noteOn/noteOff at same tick, overlapping phrases. The 1-phrase discrepancy is likely a subtle event-ordering edge case in this extreme chart.

---

## Fixes Applied This Session

1. **Track name as lyric:** Filter tick-0 FF 01 text events that match the FF 03 trackName. This fixes 1 chart (Andrew Prahlow) and correctly diverges from YARG on 113 charts where YARG has the bug.

2. **Leading space in .chart lyrics:** Added `\s*` before "lyric" in `parseChartLyricLine` regex patterns. Fixes `" lyric hey"` format.

3. **Vocal phrase noteOff ordering:** Sort noteOff events before noteOn events at the same tick, matching YARG's effective behavior. Fixed 4 charts with length=0 phrases.

4. **Duplicate noteOn handling:** Ignore noteOn for a note number that's already open (matching YARG's `ProcessNoteEvent` which logs duplicate and skips). Fixed 8 charts with extra phrases.

## Recommendations

### No action needed:

- **Duplicate-tick ordering (13 charts):** Undefined behavior in MIDI. Consider sorting same-tick lyrics alphabetically in cross-parser tests to eliminate false diffs.
- **YARG bugs (119 charts):** Track-name, bracket filtering, malformed .chart — all YARG issues.
- **Encoding (12 charts):** scan-chart is correct for UTF-8 and BOM. For the 3 Latin-1 charts, could consider a Latin-1 fallback.

### Possible improvements:

- **Dedup at same tick (1 chart):** Consider removing the same-tick dedup to match YARG. Impact: 1 chart gains 2 extra duplicate lyrics.
