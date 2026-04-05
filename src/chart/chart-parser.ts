import * as _ from 'lodash'

import { Difficulty, Instrument } from 'src/interfaces'
import { getEncoding } from 'src/utils'
import {
	EventType, eventTypes, RawChartData,
	MoonTrack, MoonNote, MoonPhrase, MoonInstrument, GameMode, PhraseType,
	getGameMode, moonNoteFlags, phraseTypes,
} from './note-parsing-interfaces'

/* eslint-disable @typescript-eslint/naming-convention */
type TrackName = keyof typeof trackNameMap
const trackNameMap = {
	ExpertSingle: { instrument: 'guitar', difficulty: 'expert' },
	HardSingle: { instrument: 'guitar', difficulty: 'hard' },
	MediumSingle: { instrument: 'guitar', difficulty: 'medium' },
	EasySingle: { instrument: 'guitar', difficulty: 'easy' },

	ExpertDoubleGuitar: { instrument: 'guitarcoop', difficulty: 'expert' },
	HardDoubleGuitar: { instrument: 'guitarcoop', difficulty: 'hard' },
	MediumDoubleGuitar: { instrument: 'guitarcoop', difficulty: 'medium' },
	EasyDoubleGuitar: { instrument: 'guitarcoop', difficulty: 'easy' },

	ExpertDoubleRhythm: { instrument: 'rhythm', difficulty: 'expert' },
	HardDoubleRhythm: { instrument: 'rhythm', difficulty: 'hard' },
	MediumDoubleRhythm: { instrument: 'rhythm', difficulty: 'medium' },
	EasyDoubleRhythm: { instrument: 'rhythm', difficulty: 'easy' },

	ExpertDoubleBass: { instrument: 'bass', difficulty: 'expert' },
	HardDoubleBass: { instrument: 'bass', difficulty: 'hard' },
	MediumDoubleBass: { instrument: 'bass', difficulty: 'medium' },
	EasyDoubleBass: { instrument: 'bass', difficulty: 'easy' },

	ExpertDrums: { instrument: 'drums', difficulty: 'expert' },
	HardDrums: { instrument: 'drums', difficulty: 'hard' },
	MediumDrums: { instrument: 'drums', difficulty: 'medium' },
	EasyDrums: { instrument: 'drums', difficulty: 'easy' },

	ExpertKeyboard: { instrument: 'keys', difficulty: 'expert' },
	HardKeyboard: { instrument: 'keys', difficulty: 'hard' },
	MediumKeyboard: { instrument: 'keys', difficulty: 'medium' },
	EasyKeyboard: { instrument: 'keys', difficulty: 'easy' },

	ExpertGHLGuitar: { instrument: 'guitarghl', difficulty: 'expert' },
	HardGHLGuitar: { instrument: 'guitarghl', difficulty: 'hard' },
	MediumGHLGuitar: { instrument: 'guitarghl', difficulty: 'medium' },
	EasyGHLGuitar: { instrument: 'guitarghl', difficulty: 'easy' },

	ExpertGHLCoop: { instrument: 'guitarcoopghl', difficulty: 'expert' },
	HardGHLCoop: { instrument: 'guitarcoopghl', difficulty: 'hard' },
	MediumGHLCoop: { instrument: 'guitarcoopghl', difficulty: 'medium' },
	EasyGHLCoop: { instrument: 'guitarcoopghl', difficulty: 'easy' },

	ExpertGHLRhythm: { instrument: 'rhythmghl', difficulty: 'expert' },
	HardGHLRhythm: { instrument: 'rhythmghl', difficulty: 'hard' },
	MediumGHLRhythm: { instrument: 'rhythmghl', difficulty: 'medium' },
	EasyGHLRhythm: { instrument: 'rhythmghl', difficulty: 'easy' },

	ExpertGHLBass: { instrument: 'bassghl', difficulty: 'expert' },
	HardGHLBass: { instrument: 'bassghl', difficulty: 'hard' },
	MediumGHLBass: { instrument: 'bassghl', difficulty: 'medium' },
	EasyGHLBass: { instrument: 'bassghl', difficulty: 'easy' },
} as const
/* eslint-enable @typescript-eslint/naming-convention */

const discoFlipDifficultyMap = ['easy', 'medium', 'hard', 'expert'] as const

// ---------------------------------------------------------------------------
// .chart N value → MoonNote rawNote mapping (plan 0029)
// ---------------------------------------------------------------------------

/** .chart N value → rawNote for 5-fret guitar/bass/rhythm/keys/coop. */
function chartNToGuitarRawNote(n: number): { rawNote: number } | { flag: number } | null {
	switch (n) {
		case 0: return { rawNote: 1 }  // Green
		case 1: return { rawNote: 2 }  // Red
		case 2: return { rawNote: 3 }  // Yellow
		case 3: return { rawNote: 4 }  // Blue
		case 4: return { rawNote: 5 }  // Orange
		case 5: return { flag: moonNoteFlags.forced }
		case 6: return { flag: moonNoteFlags.tap }
		case 7: return { rawNote: 0 }  // Open
		default: return null
	}
}

/** .chart N value → rawNote for drums. */
function chartNToDrumRawNote(n: number): { rawNote: number; defaultFlags?: number } | { flag: number; pad?: number } | null {
	switch (n) {
		case 0: return { rawNote: 0 }   // Kick
		case 1: return { rawNote: 1 }   // Red
		case 2: return { rawNote: 2 }   // Yellow
		case 3: return { rawNote: 3 }   // Blue
		case 4: return { rawNote: 4 }   // Orange (5-lane) / Green (4-lane)
		case 5: return { rawNote: 5 }   // Green (5-lane only)
		case 32: return { rawNote: 0, defaultFlags: moonNoteFlags.doubleKick }  // DoubleKick — creates kick note with flag
		case 33: return null  // Kick accent — YARG/MoonSong doesn't support kick accent/ghost
		case 34: return { flag: moonNoteFlags.proDrumsAccent, pad: 1 }  // Red accent
		case 35: return { flag: moonNoteFlags.proDrumsAccent, pad: 2 }  // Yellow accent
		case 36: return { flag: moonNoteFlags.proDrumsAccent, pad: 3 }  // Blue accent
		case 37: return { flag: moonNoteFlags.proDrumsAccent, pad: 4 }  // Orange accent
		case 38: return { flag: moonNoteFlags.proDrumsAccent, pad: 5 }  // Green accent
		case 39: return null  // Kick ghost — YARG/MoonSong doesn't support kick accent/ghost
		case 40: return { flag: moonNoteFlags.proDrumsGhost, pad: 1 }   // Red ghost
		case 41: return { flag: moonNoteFlags.proDrumsGhost, pad: 2 }   // Yellow ghost
		case 42: return { flag: moonNoteFlags.proDrumsGhost, pad: 3 }   // Blue ghost
		case 43: return { flag: moonNoteFlags.proDrumsGhost, pad: 4 }   // Orange ghost
		case 44: return { flag: moonNoteFlags.proDrumsGhost, pad: 5 }   // Green ghost
		// Cymbal markers: In MoonSong, yellow/blue/green default to cymbal.
		// Cymbal marker in .chart = proDrumsCymbal flag. Tom marker (absence) = no flag.
		// We'll set cymbal flags during post-processing.
		case 66: return { flag: moonNoteFlags.proDrumsCymbal, pad: 2 }  // Yellow cymbal
		case 67: return { flag: moonNoteFlags.proDrumsCymbal, pad: 3 }  // Blue cymbal
		case 68: return { flag: moonNoteFlags.proDrumsCymbal, pad: 4 }  // Green cymbal
		default: return null
	}
}

/** .chart N value → rawNote for GHL (6-fret). */
function chartNToGhlRawNote(n: number): { rawNote: number } | { flag: number } | null {
	switch (n) {
		case 0: return { rawNote: 4 }  // White1
		case 1: return { rawNote: 5 }  // White2
		case 2: return { rawNote: 6 }  // White3
		case 3: return { rawNote: 1 }  // Black1
		case 4: return { rawNote: 2 }  // Black2
		case 5: return { flag: moonNoteFlags.forced }
		case 6: return { flag: moonNoteFlags.tap }
		case 7: return { rawNote: 0 }  // Open
		case 8: return { rawNote: 3 }  // Black3
		default: return null
	}
}

/** .chart S value → PhraseType. */
function chartSToPhraseType(value: string): PhraseType | null {
	switch (value) {
		case '0': return phraseTypes.versusPlayer1
		case '1': return phraseTypes.versusPlayer2
		case '2': return phraseTypes.starpower
		case '64': return phraseTypes.proDrumsActivation
		case '65': return phraseTypes.tremoloLane
		case '66': return phraseTypes.trillLane
		default: return null
	}
}

/**
 * Build MoonTrack from raw .chart track events.
 * Merges modifier N values (force, tap, cymbal, accent, ghost) into flags on notes.
 */
function buildMoonTrack(
	lines: string[],
	instrument: MoonInstrument,
	difficulty: Difficulty,
	gameMode: GameMode,
): MoonTrack {
	const notes: MoonNote[] = []
	const phrases: MoonPhrase[] = []
	const textEvents: { tick: number; text: string }[] = []

	// First pass: collect raw notes and modifiers
	interface RawEntry { tick: number; nValue: number; length: number }
	const rawNotes: RawEntry[] = []
	const rawModifiers: RawEntry[] = []
	// Pending solo start tick
	let soloStartTick: number | null = null

	const isGhl = gameMode === 'ghlguitar'
	const isDrums = gameMode === 'drums'
	const getNMapping = isDrums ? chartNToDrumRawNote : (isGhl ? chartNToGhlRawNote : chartNToGuitarRawNote)

	for (const line of lines) {
		const match = /^(\d+) = ([A-Z]+) ([\w\s[\]".-]+?)( \d+)?$/.exec(line)
		if (!match) continue
		const tick = Number(match[1])
		const typeCode = match[2]
		const value = match[3].replace(/"/g, '')
		const length = Number(match[4]) || 0

		switch (typeCode) {
			case 'N': {
				const n = Number(value)
				const mapping = getNMapping(n)
				if (mapping === null) break
				if ('rawNote' in mapping) {
					rawNotes.push({ tick, nValue: n, length })
				} else {
					rawModifiers.push({ tick, nValue: n, length })
				}
				break
			}
			case 'S': {
				const pt = chartSToPhraseType(value)
				if (pt !== null) {
					phrases.push({ tick, length, type: pt })
				}
				break
			}
			case 'E': {
				if (value === 'solo') {
					// First solo_start wins; subsequent ones before soloend are ignored (YARG behavior)
					if (soloStartTick === null) soloStartTick = tick
				} else if (value === 'soloend') {
					if (soloStartTick !== null) {
						// .chart solos have inclusive ends — add 1 to length to match MoonSong
						phrases.push({ tick: soloStartTick, length: tick + 1 - soloStartTick, type: phraseTypes.solo })
						soloStartTick = null
					}
				} else {
					// Per-track text events (disco flip, etc.)
					textEvents.push({ tick, text: value })
				}
				break
			}
		}
	}

	// Convert rawNotes to MoonNotes
	for (const rn of rawNotes) {
		const mapping = getNMapping(rn.nValue)
		if (mapping === null || !('rawNote' in mapping)) continue
		const m = mapping as { rawNote: number; defaultFlags?: number }
		notes.push({ tick: rn.tick, rawNote: m.rawNote, length: rn.length, flags: m.defaultFlags ?? 0 })
	}

	// Sort notes by tick then rawNote
	notes.sort((a, b) => a.tick - b.tick || a.rawNote - b.rawNote)

	// Dedup notes by tick+rawNote
	{
		const seen = new Set<string>()
		const deduped: MoonNote[] = []
		for (const n of notes) {
			const key = `${n.tick}:${n.rawNote}`
			if (!seen.has(key)) {
				seen.add(key)
				deduped.push(n)
			}
		}
		notes.length = 0
		notes.push(...deduped)
	}

	// Apply modifiers as flags
	// Build tick → notes index for fast lookup
	const notesByTick = new Map<number, MoonNote[]>()
	for (const n of notes) {
		let arr = notesByTick.get(n.tick)
		if (!arr) { arr = []; notesByTick.set(n.tick, arr) }
		arr.push(n)
	}

	for (const mod of rawModifiers) {
		const mapping = getNMapping(mod.nValue)
		if (mapping === null || !('flag' in mapping)) continue

		const notesAtTick = notesByTick.get(mod.tick)
		if (!notesAtTick) continue

		if ('pad' in mapping && mapping.pad !== undefined) {
			// Drum per-pad modifiers: apply flag only to matching rawNote
			for (const n of notesAtTick) {
				if (n.rawNote === mapping.pad) {
					n.flags |= mapping.flag
				}
			}
		} else {
			// Guitar/GHL: apply to all notes at this tick
			for (const n of notesAtTick) {
				n.flags |= mapping.flag
			}
		}
	}

	// For drums: apply default cymbal flag to yellow(2)/blue(3)/green(4+5)
	// In MoonSong, these pads default to cymbal. Cymbal markers in .chart ADD the flag.
	// But the .chart cymbal markers (N 66-68) are the cymbal indicators.
	// Without a cymbal marker, the note is a tom (no cymbal flag).
	// WITH a cymbal marker, the note has ProDrums_Cymbal flag.
	// This matches MoonSong behavior where tom markers REMOVE cymbal.
	// So .chart cymbal marker = MoonSong default (cymbal), no marker = tom marker present.
	// Wait — re-reading the plan: "MoonSong stores yellow/blue/green with ProDrums_Cymbal by DEFAULT.
	// Tom markers CLEAR the flag." And ".chart has cymbalMarker events that SET the flag."
	// So in .chart: no cymbal marker → tom (no flag). With cymbal marker → cymbal (flag set).
	// In MoonSong: default → cymbal (flag set). With tom marker → no flag.
	// The .chart parser should set cymbal flag by default on yellow/blue/green/orange pads,
	// and cymbal markers in .chart should be ignored (they're redundant with default),
	// BUT actually .chart uses yellowCymbalMarker to indicate cymbal. Without it, it's a tom.
	// So we need: if cymbal marker present → keep default cymbal. If not → no cymbal.
	// Actually, let's match MoonSong: set cymbal on all yellow/blue/green by default.
	// .chart tom markers (absence of cymbal marker) are NOT how .chart works.
	// In .chart: N 66/67/68 are cymbal markers. If present, note is cymbal. If absent, tom.
	// In MIDI: 110/111/112 are tom markers. If present, note is tom. Default is cymbal.
	// So for .chart → MoonSong: N 66 at tick → yellow has cymbal. No N 66 → yellow is tom.
	// We already applied proDrumsCymbal flag from N 66/67/68 above. That's correct.
	// No additional default cymbal needed for .chart.

	// Sort phrases
	phrases.sort((a, b) => a.tick - b.tick || a.type - b.type)

	return { instrument, difficulty, gameMode, notes, phrases, textEvents, animations: [] }
}

// Map .chart track names to MoonInstrument (same instruments, just type-safe)
function trackInstrumentToMoon(instrument: Instrument): MoonInstrument {
	return instrument as MoonInstrument
}

/**
 * Parses `buffer` as a chart in the .chart format. Returns all the note data in `RawChartData`, but any
 * chart format rules that apply to both .chart and .mid have not been applied. This is a partial result
 * that can be produced by both the .chart and .mid formats so that the remaining chart rules can be parsed
 * without code duplication.
 *
 * Throws an exception if `buffer` could not be parsed as a chart in the .chart format.
 *
 * Note: these features of .chart are ignored (for now)
 * Versus phrase markers
 * Tempo anchors
 * GH1 hand animation markers
 * Audio file paths in metadata
 */
export function parseNotesFromChart(data: Uint8Array): RawChartData {
	const encoding = getEncoding(data)
	const decoder = new TextDecoder(encoding)
	const chartText = decoder.decode(data)

	// Detect encoding details for roundtrip fidelity
	const hasBom = data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF
	const lineEnding: '\r\n' | '\n' = chartText.includes('\r\n') ? '\r\n' : '\n'
	const hasTrailingNewline = chartText.endsWith('\n')

	const { sections: fileSections, rawSections } = getFileSections(chartText)
	if (_.values(fileSections).length === 0) {
		throw 'Invalid .chart file: no sections were found.'
	}

	const metadata = _.chain(fileSections['Song'])
		.map(line => /^(.+?) = "?(.*?)"?$/.exec(line))
		.compact()
		.map(([, key, value]) => [key, value])
		.fromPairs()
		.value()

	// Capture raw [Song] key-value pairs for roundtrip fidelity
	const chartSongSection: Array<{ key: string; value: string }> | undefined =
		fileSections['Song']
			? _.chain(fileSections['Song'])
					.map(line => /^(.+?) = (.*)$/.exec(line))
					.compact()
					.map(([, key, value]) => ({ key: key.trim(), value: value.trim() }))
					.value()
			: undefined
	// Raw [Song] lines with original indentation for byte-level writer fidelity
	const chartSongLines = rawSections['Song'] ?? undefined

	// Capture raw section lines (with original indentation) for roundtrip fidelity
	const chartEventsSection = rawSections['Events'] ?? undefined
	const chartSyncTrackSection = rawSections['SyncTrack'] ?? undefined

	// Capture raw track section lines for roundtrip fidelity (in file order)
	const chartTrackSections: Record<string, string[]> = {}
	for (const sectionName of _.keys(fileSections)) {
		if (sectionName in trackNameMap) {
			chartTrackSections[sectionName] = rawSections[sectionName]
		}
	}

	// Collect unknown sections for roundtrip fidelity
	const knownSections = new Set([..._.keys(trackNameMap), 'Song', 'SyncTrack', 'Events'])
	const unknownChartSections: Array<{ name: string; lines: string[] }> = []
	for (const sectionName of _.keys(fileSections)) {
		if (!knownSections.has(sectionName)) {
			unknownChartSections.push({ name: sectionName, lines: rawSections[sectionName] })
		}
	}

	const resolution = Number(metadata['Resolution'])
	if (!resolution) {
		throw 'Invalid .chart file: resolution not found.'
	}

	const codaEvents = _.chain(fileSections['Events'])
		.map(line => /^(\d+) = E "\s*\[?coda\]?\s*"$/.exec(line))
		.compact()
		.map(([, stringTick]) => ({ tick: Number(stringTick) }))
		.value()
	const firstCodaTick = codaEvents[0] ? codaEvents[0].tick : null

	return {
		chartTicksPerBeat: resolution,
		hasBom,
		lineEnding,
		hasTrailingNewline,
		rawChartText: (hasBom ? '\uFEFF' : '') + chartText,
		metadata: {
			name: metadata['Name'] || undefined,
			artist: metadata['Artist'] || undefined,
			album: metadata['Album'] || undefined,
			genre: metadata['Genre'] || undefined,
			year: metadata['Year']?.slice(2) || undefined, // Thank you GHTCP, very cool
			charter: metadata['Charter'] || undefined,
			diff_guitar: Number(metadata['Difficulty']) || undefined,
			// "Offset" and "PreviewStart" are in units of seconds
			delay: Number(metadata['Offset']) ? Number(metadata['Offset']) * 1000 : undefined,
			preview_start_time: Number(metadata['PreviewStart']) ? Number(metadata['PreviewStart']) * 1000 : undefined,
		},
		hasLyrics: !!fileSections['Events']?.find(line => line.includes('"lyric ')),
		hasVocals: false, // Vocals are unsupported in .chart
		lyrics: _.chain(fileSections['Events'])
			.map(line => /^(\d+) = E "lyric (.+?)"$/.exec(line))
			.compact()
			.map(([, stringTick, lyricText]) => ({
				tick: Number(stringTick),
				length: 0, // Chart lyric events typically don't have length
				text: lyricText,
			}))
			.value(),
		vocalPhrases: getChartVocalPhrases(fileSections['Events'] ?? []),
		tempos: _.chain(fileSections['SyncTrack'])
			.map(line => /^(\d+) = B (\d+)$/.exec(line))
			.compact()
			.map(([, stringTick, stringMillibeatsPerMinute]) => ({
				tick: Number(stringTick),
				beatsPerMinute: Number(stringMillibeatsPerMinute) / 1000,
			}))
			.tap(tempos => {
				const zeroTempo = tempos.find(tempo => tempo.beatsPerMinute === 0)
				if (zeroTempo) {
					throw `Invalid .chart file: Tempo at tick ${zeroTempo.tick} was zero.`
				}
				if (!tempos[0] || tempos[0].tick !== 0) {
					tempos.unshift({ tick: 0, beatsPerMinute: 120 })
				}
			})
			.value(),
		timeSignatures: _.chain(fileSections['SyncTrack'])
			.map(line => /^(\d+) = TS (\d+)(?: (\d+))?$/.exec(line))
			.compact()
			.map(([, stringTick, stringNumerator, stringDenominatorExp]) => ({
				tick: Number(stringTick),
				numerator: Number(stringNumerator),
				denominator: stringDenominatorExp ? Math.pow(2, Number(stringDenominatorExp)) : 4,
			}))
			.tap(timeSignatures => {
				const zeroTimeSignatureN = timeSignatures.find(timeSignature => timeSignature.numerator === 0)
				const zeroTimeSignatureD = timeSignatures.find(timeSignature => timeSignature.denominator === 0)
				if (zeroTimeSignatureN) {
					throw `Invalid .mid file: Time signature numerator at tick ${zeroTimeSignatureN.tick} was zero.`
				}
				if (zeroTimeSignatureD) {
					throw `Invalid .mid file: Time signature denominator at tick ${zeroTimeSignatureD.tick} was zero.`
				}
				if (!timeSignatures[0] || timeSignatures[0].tick !== 0) {
					timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4 })
				}
			})
			.value(),
		sections: _.chain(fileSections['Events'])
			.map(line => /^(\d+) = E "\[?(?:section|prc)[ _](.*?)\]?"$/.exec(line))
			.compact()
			.map(([, stringTick, stringName]) => ({
				tick: Number(stringTick),
				name: (hadBracket ? stringName.replace(/\]$/, '') : stringName).trim(),
			}))
			.value(),
		endEvents: _.chain(fileSections['Events'])
			.map(line => /^(\d+) = E "\[?end\]?"$/.exec(line))
			.compact()
			.map(([, stringTick]) => ({
				tick: Number(stringTick),
			}))
			.value(),
		// ── MoonSong-aligned fields (plan 0029) ──
		tracks: _.chain(fileSections)
			.pick(_.keys(trackNameMap))
			.toPairs()
			.map(([trackName, lines]) => {
				const { instrument, difficulty } = trackNameMap[trackName as TrackName]
				const moonInst = trackInstrumentToMoon(instrument)
				const gm = getGameMode(moonInst)
				return buildMoonTrack(lines, moonInst, difficulty, gm)
			})
			.filter(t => t.notes.length > 0)
			.value(),
		globalEvents: _.chain(fileSections['Events'])
			.map(line => /^(\d+) = E "(.+)"$/.exec(line))
			.compact()
			.filter(([, , text]) => {
				const t = text.trim()
				// Exclude events already parsed into sections, end events, lyrics, vocal phrases
				if (/^\[?(?:section|prc)[ _]/.test(t)) return false
				if (/^\[?end\]?$/.test(t)) return false
				if (/^lyric /.test(t)) return false
				if (t === 'phrase_start' || t === 'phrase_end') return false
				return true
			})
			.map(([, stringTick, text]) => ({
				tick: Number(stringTick),
				text: text.trim(),
			}))
			.value(),
		trackData: _.chain(fileSections)
			.pick(_.keys(trackNameMap))
			.toPairs()
			.map(([trackName, lines]) => {
				const { instrument, difficulty } = trackNameMap[trackName as TrackName]
				const trackEvents = _.chain(lines)
					.map(line => /^(\d+) = ([A-Z]+) ([\w\s[\]".-]+?)( \d+)?$/.exec(line))
					.compact()
					.map(([, tickString, typeCode, value, lengthString]) => {
						const type = getEventType(typeCode, value, instrument, difficulty)
						return type !== null ? { tick: Number(tickString), type, length: Number(lengthString) || 0 } : null
					})
					.compact()
					.orderBy('tick') // Most parsers reject charts that aren't already sorted, but it's easier to just sort it here
					.thru(events => mergeSoloEvents(events))
					.value()
				const result: RawChartData['trackData'][number] = {
					instrument,
					difficulty,
					starPowerSections: [],
					rejectedStarPowerSections: [],
					soloSections: [],
					flexLanes: [],
					drumFreestyleSections: [],
					trackEvents: [],
				}

				for (const event of trackEvents) {
					if (event.type === eventTypes.starPower) {
						result.starPowerSections.push(event)
					} else if (event.type === eventTypes.rejectedStarPower) {
						result.rejectedStarPowerSections.push(event)
					} else if (event.type === eventTypes.soloSection) {
						result.soloSections.push(event)
					} else if (event.type === eventTypes.flexLaneSingle || event.type === eventTypes.flexLaneDouble) {
						result.flexLanes.push({
							tick: event.tick,
							length: event.length,
							isDouble: event.type === eventTypes.flexLaneDouble,
						})
					} else if (event.type === eventTypes.freestyleSection) {
						result.drumFreestyleSections.push({
							tick: event.tick,
							length: event.length,
							isCoda: firstCodaTick === null ? false : event.tick >= firstCodaTick,
						})
					} else {
						result.trackEvents.push(event)
					}
				}

				return result
			})
			.value(),
		chartSongSection: chartSongSection && chartSongSection.length > 0 ? chartSongSection : undefined,
		chartSongLines: chartSongLines && chartSongLines.length > 0 ? chartSongLines : undefined,
		chartEventsSection: chartEventsSection && chartEventsSection.length > 0 ? chartEventsSection : undefined,
		chartSyncTrackSection: chartSyncTrackSection && chartSyncTrackSection.length > 0 ? chartSyncTrackSection : undefined,
		chartTrackSections: Object.keys(chartTrackSections).length > 0 ? chartTrackSections : undefined,
		unknownChartSections: unknownChartSections.length > 0 ? unknownChartSections : undefined,
	}
}

function getFileSections(chartText: string) {
	const sections: { [sectionName: string]: string[] } = {}
	// Raw sections preserve original whitespace for byte-level roundtrip fidelity
	const rawSections: { [sectionName: string]: string[] } = {}
	let skipLine = false
	let readStartIndex = 0
	let readingSection = false
	let thisSection: string | null = null
	for (let i = 0; i < chartText.length; i++) {
		if (readingSection) {
			if (chartText[i] === ']') {
				readingSection = false
				thisSection = chartText.slice(readStartIndex, i)
			}
			if (chartText[i] === '\n') {
				throw `Invalid .chart file: unexpected new line when parsing section at index ${i}`
			}
			continue // Keep reading section until it ends
		}

		if (chartText[i] === '=') {
			skipLine = true
		} // Skip all user-entered values
		if (chartText[i] === '\n') {
			skipLine = false
		}
		if (skipLine) {
			continue
		} // Keep skipping until '\n' is found

		if (chartText[i] === '{') {
			skipLine = true
			readStartIndex = i + 1
		} else if (chartText[i] === '}') {
			if (!thisSection) {
				throw `Invalid .chart file: end of section reached before a section name was found at index ${i}`
			}
			const rawLines = chartText
				.slice(readStartIndex, i)
				.split('\n')
				.map(line => line.replace(/\r$/, ''))
				.filter(line => line.trim().length)
			rawSections[thisSection] = rawLines
			// Trimmed version for structured parsing
			sections[thisSection] = rawLines.map(line => line.trim())
		} else if (chartText[i] === '[') {
			readStartIndex = i + 1
			readingSection = true
		}
	}

	return { sections, rawSections }
}

function getEventType(typeCode: string, value: string, instrument: Instrument, difficulty: Difficulty): EventType | null {
	switch (typeCode) {
		case 'E': {
			switch (value) {
				case 'solo':
					return eventTypes.soloSectionStart
				case 'soloend':
					return eventTypes.soloSectionEnd
				default: {
					const match = value.match(/^\s*\[?mix[ _]([0-3])[ _]drums([0-5])(d|dnoflip|easy|easynokick|)\]?\s*$/)
					if (match) {
						const diff = discoFlipDifficultyMap[Number(match[1])]
						const flag = match[3] as 'd' | 'dnoflip' | 'easy' | 'easynokick' | ''
						if ((flag === '' || flag === 'd' || flag === 'dnoflip') && difficulty === diff) {
							return (
								flag === '' ? eventTypes.discoFlipOff
								: flag === 'd' ? eventTypes.discoFlipOn
								: eventTypes.discoNoFlipOn
							)
						}
					}
					return null
				}
			}
		}
		case 'S': {
			switch (value) {
				case '2':
					return eventTypes.starPower
				case '64':
					return eventTypes.freestyleSection
				case '65':
					return eventTypes.flexLaneSingle
				case '66':
					return eventTypes.flexLaneDouble
				default:
					return null
			}
		}
		case 'N': {
			switch (instrument) {
				case 'drums': {
					switch (value) {
						case '0':
							return eventTypes.kick
						case '1':
							return eventTypes.redDrum
						case '2':
							return eventTypes.yellowDrum
						case '3':
							return eventTypes.blueDrum
						case '4':
							return eventTypes.fiveOrangeFourGreenDrum
						case '5':
							return eventTypes.fiveGreenDrum
						case '32':
							return eventTypes.kick2x
						case '34':
							return eventTypes.redAccent
						case '35':
							return eventTypes.yellowAccent
						case '36':
							return eventTypes.blueAccent
						case '37':
							return eventTypes.fiveOrangeFourGreenAccent
						case '38':
							return eventTypes.fiveGreenAccent
						case '40':
							return eventTypes.redGhost
						case '41':
							return eventTypes.yellowGhost
						case '42':
							return eventTypes.blueGhost
						case '43':
							return eventTypes.fiveOrangeFourGreenGhost
						case '44':
							return eventTypes.fiveGreenGhost
						case '66':
							return eventTypes.yellowCymbalMarker
						case '67':
							return eventTypes.blueCymbalMarker
						case '68':
							return eventTypes.greenCymbalMarker
						default:
							return null
					}
				}
				case 'guitarghl':
				case 'guitarcoopghl':
				case 'rhythmghl':
				case 'bassghl': {
					switch (value) {
						case '0':
							return eventTypes.white1
						case '1':
							return eventTypes.white2
						case '2':
							return eventTypes.white3
						case '3':
							return eventTypes.black1
						case '4':
							return eventTypes.black2
						case '5':
							return eventTypes.forceUnnatural
						case '6':
							return eventTypes.forceTap
						case '7':
							return eventTypes.open
						case '8':
							return eventTypes.black3
						default:
							return null
					}
				}
				default: {
					switch (value) {
						case '0':
							return eventTypes.green
						case '1':
							return eventTypes.red
						case '2':
							return eventTypes.yellow
						case '3':
							return eventTypes.blue
						case '4':
							return eventTypes.orange
						case '5':
							return eventTypes.forceUnnatural
						case '6':
							return eventTypes.forceTap
						case '7':
							return eventTypes.open
						default:
							return null
					}
				}
			}
		}
		default:
			return null
	}
}

/**
 * Merge `solo` and `soloend` events into `EventType.soloSection`.
 *
 * Note: .chart specs say that notes in the last tick of the solo section are included, unlike most phrases.
 * This is normalized here by increasing the length by 1.
 */
function mergeSoloEvents(events: { tick: number; type: EventType; length: number }[]) {
	const soloSectionStartEvents: { tick: number; type: EventType; length: number }[] = []

	for (const event of events) {
		if (event.type === eventTypes.soloSectionStart) {
			soloSectionStartEvents.push(event)
		} else if (event.type === eventTypes.soloSectionEnd) {
			const lastSoloSectionStartEvent = soloSectionStartEvents.pop()
			if (lastSoloSectionStartEvent) {
				lastSoloSectionStartEvent.type = eventTypes.soloSection
				lastSoloSectionStartEvent.length = event.tick - lastSoloSectionStartEvent.tick + 1
			}
		}
	}

	_.remove(events, event => event.type === eventTypes.soloSectionStart || event.type === eventTypes.soloSectionEnd)

	return events
}

/**
 * Extracts vocal phrase boundaries from phrase_start/phrase_end events in the [Events] section.
 */
function getChartVocalPhrases(eventLines: string[]): { tick: number; length: number }[] {
	const phraseStartRegex = /^(\d+) = E "phrase_start"$/
	const phraseEndRegex = /^(\d+) = E "phrase_end"$/

	const starts: number[] = []
	const ends: number[] = []

	for (const line of eventLines) {
		const startMatch = phraseStartRegex.exec(line)
		if (startMatch) {
			starts.push(Number(startMatch[1]))
			continue
		}
		const endMatch = phraseEndRegex.exec(line)
		if (endMatch) {
			ends.push(Number(endMatch[1]))
		}
	}

	// Pair each phrase_start with the next phrase_end
	const phrases: { tick: number; length: number }[] = []
	let endIdx = 0
	for (const start of starts) {
		while (endIdx < ends.length && ends[endIdx] <= start) {
			endIdx++
		}
		if (endIdx < ends.length) {
			phrases.push({ tick: start, length: ends[endIdx] - start })
			endIdx++
		}
	}

	return phrases
}
