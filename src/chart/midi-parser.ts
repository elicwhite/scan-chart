import * as _ from 'lodash'
import { MidiData, MidiEvent, MidiSetTempoEvent, MidiTextEvent, MidiTimeSignatureEvent, parseMidi } from 'midi-file'

import { difficulties, Difficulty, getInstrumentType, Instrument, InstrumentType, instrumentTypes } from 'src/interfaces'
import {
	EventType, eventTypes, IniChartModifiers, RawChartData,
	MoonTrack, MoonNote, MoonPhrase, MoonInstrument, GameMode,
	getGameMode, moonNoteFlags, phraseTypes, PhraseType,
} from './note-parsing-interfaces'

type TrackName = (typeof trackNames)[number]
type InstrumentTrackName = Exclude<TrackName, 'PART VOCALS' | 'EVENTS'>
const trackNames = [
	'T1 GEMS',
	'PART GUITAR',
	'PART GUITAR COOP',
	'PART RHYTHM',
	'PART BASS',
	'PART DRUMS',
	'PART KEYS',
	'PART GUITAR GHL',
	'PART GUITAR COOP GHL',
	'PART RHYTHM GHL',
	'PART BASS GHL',
	'PART VOCALS',
	'EVENTS',
] as const
/* eslint-disable @typescript-eslint/naming-convention */
const instrumentNameMap: { [key in InstrumentTrackName]: Instrument } = {
	'T1 GEMS': 'guitar',
	'PART GUITAR': 'guitar',
	'PART GUITAR COOP': 'guitarcoop',
	'PART RHYTHM': 'rhythm',
	'PART BASS': 'bass',
	'PART DRUMS': 'drums',
	'PART KEYS': 'keys',
	'PART GUITAR GHL': 'guitarghl',
	'PART GUITAR COOP GHL': 'guitarcoopghl',
	'PART RHYTHM GHL': 'rhythmghl',
	'PART BASS GHL': 'bassghl',
} as const
/* eslint-enable @typescript-eslint/naming-convention */

const sysExDifficultyMap = ['easy', 'medium', 'hard', 'expert'] as const
const discoFlipDifficultyMap = ['easy', 'medium', 'hard', 'expert'] as const
const fiveFretDiffStarts = { easy: 59, medium: 71, hard: 83, expert: 95 }
const sixFretDiffStarts = { easy: 58, medium: 70, hard: 82, expert: 94 }
const drumsDiffStarts = { easy: 60, medium: 72, hard: 84, expert: 96 }

// ---------------------------------------------------------------------------
// MoonSong-aligned MIDI mappings (plan 0029)
// ---------------------------------------------------------------------------

/** Extended track names including instruments MoonSong supports but scan-chart didn't. */
type MoonTrackName = keyof typeof moonTrackNameMap
/* eslint-disable @typescript-eslint/naming-convention */
const moonTrackNameMap: Record<string, { instrument: MoonInstrument; difficulty?: Difficulty }> = {
	'T1 GEMS': { instrument: 'guitar' },
	'PART GUITAR': { instrument: 'guitar' },
	'PART GUITAR COOP': { instrument: 'guitarcoop' },
	'PART RHYTHM': { instrument: 'rhythm' },
	'PART BASS': { instrument: 'bass' },
	'PART DRUMS': { instrument: 'drums' },
	'PART KEYS': { instrument: 'keys' },
	'PART GUITAR GHL': { instrument: 'guitarghl' },
	'PART GUITAR COOP GHL': { instrument: 'guitarcoopghl' },
	'PART RHYTHM GHL': { instrument: 'rhythmghl' },
	'PART BASS GHL': { instrument: 'bassghl' },
	'PART REAL_GUITAR': { instrument: 'proguitar17' },
	'PART REAL_GUITAR_22': { instrument: 'proguitar22' },
	'PART REAL_BASS': { instrument: 'probass17' },
	'PART REAL_BASS_22': { instrument: 'probass22' },
	'PART REAL_KEYS_X': { instrument: 'prokeys', difficulty: 'expert' },
	'PART REAL_KEYS_H': { instrument: 'prokeys', difficulty: 'hard' },
	'PART REAL_KEYS_M': { instrument: 'prokeys', difficulty: 'medium' },
	'PART REAL_KEYS_E': { instrument: 'prokeys', difficulty: 'easy' },
	'PART VOCALS': { instrument: 'vocals' },
	'HARM1': { instrument: 'harmony1' },
	'HARM2': { instrument: 'harmony2' },
	'HARM3': { instrument: 'harmony3' },
	'PART ELITE_DRUMS': { instrument: 'elitedrums' },
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Convert existing trackData (old model) to MoonTrack[] (new MoonSong-aligned model).
 * This leverages the existing parsing logic which already handles all the complex
 * modifier splitting, SysEx, velocity → accent/ghost, etc.
 */
function trackDataToMoonTracks(
	trackData: RawChartData['trackData'],
	midiTracks: { trackName: string; trackEvents: MidiEvent[] }[],
): MoonTrack[] {
	const results: MoonTrack[] = []

	for (const td of trackData) {
		const moonInst = td.instrument as MoonInstrument
		const gm = getGameMode(moonInst)
		const isDrums = gm === 'drums'
		const isGhl = gm === 'ghlguitar'

		// Map eventType → rawNote
		const rawNoteMap: Partial<Record<EventType, number>> = isDrums ? {
			[eventTypes.kick]: 0,
			[eventTypes.redDrum]: 1,
			[eventTypes.yellowDrum]: 2,
			[eventTypes.blueDrum]: 3,
			[eventTypes.fiveOrangeFourGreenDrum]: 4,
			[eventTypes.fiveGreenDrum]: 5,
		} : isGhl ? {
			[eventTypes.open]: 0,
			[eventTypes.black1]: 1,
			[eventTypes.black2]: 2,
			[eventTypes.black3]: 3,
			[eventTypes.white1]: 4,
			[eventTypes.white2]: 5,
			[eventTypes.white3]: 6,
		} : {
			[eventTypes.open]: 0,
			[eventTypes.green]: 1,
			[eventTypes.red]: 2,
			[eventTypes.yellow]: 3,
			[eventTypes.blue]: 4,
			[eventTypes.orange]: 5,
		}

		// Modifier eventTypes that become flags (not separate notes)
		const modifierTypes: Set<EventType> = new Set([
			eventTypes.forceOpen, eventTypes.forceTap, eventTypes.forceStrum,
			eventTypes.forceHopo, eventTypes.forceUnnatural,
			eventTypes.yellowTomMarker, eventTypes.blueTomMarker, eventTypes.greenTomMarker,
			eventTypes.yellowCymbalMarker, eventTypes.blueCymbalMarker, eventTypes.greenCymbalMarker,
			eventTypes.redAccent, eventTypes.yellowAccent, eventTypes.blueAccent,
			eventTypes.fiveOrangeFourGreenAccent, eventTypes.fiveGreenAccent, eventTypes.kickAccent,
			eventTypes.redGhost, eventTypes.yellowGhost, eventTypes.blueGhost,
			eventTypes.fiveOrangeFourGreenGhost, eventTypes.fiveGreenGhost, eventTypes.kickGhost,
			eventTypes.forceFlam, eventTypes.kick2x,
			eventTypes.discoFlipOff, eventTypes.discoFlipOn, eventTypes.discoNoFlipOn,
			eventTypes.enableChartDynamics,
		])

		// Extract base notes
		const notes: MoonNote[] = []
		for (const ev of td.trackEvents) {
			const rn = rawNoteMap[ev.type]
			if (rn !== undefined) {
				notes.push({ tick: ev.tick, rawNote: rn, length: ev.length, flags: 0 })
			}
			// kick2x creates a kick note (rawNote=0) with doubleKick flag
			if (ev.type === eventTypes.kick2x) {
				notes.push({ tick: ev.tick, rawNote: 0, length: ev.length, flags: moonNoteFlags.doubleKick })
			}
		}

		// Build tick → notes index
		const notesByTick = new Map<number, MoonNote[]>()
		for (const n of notes) {
			let arr = notesByTick.get(n.tick)
			if (!arr) { arr = []; notesByTick.set(n.tick, arr) }
			arr.push(n)
		}

		// Apply modifier events as flags
		for (const ev of td.trackEvents) {
			if (!modifierTypes.has(ev.type)) continue
			const notesAtTick = notesByTick.get(ev.tick)
			if (!notesAtTick) continue

			switch (ev.type) {
				// Guitar/GHL modifiers — apply to all notes at tick
				case eventTypes.forceOpen:
					for (const n of notesAtTick) n.rawNote = 0
					break
				case eventTypes.forceTap:
					for (const n of notesAtTick) n.flags |= moonNoteFlags.tap
					break
				case eventTypes.forceStrum:
					for (const n of notesAtTick) {
						n.flags |= moonNoteFlags.forcedStrum
						n.flags &= ~moonNoteFlags.forcedHopo
					}
					break
				case eventTypes.forceHopo:
					for (const n of notesAtTick) {
						n.flags |= moonNoteFlags.forcedHopo
						n.flags &= ~moonNoteFlags.forcedStrum
					}
					break
				case eventTypes.forceUnnatural:
					// .chart "force" → MoonNote Forced flag
					for (const n of notesAtTick) n.flags |= moonNoteFlags.forced
					break

				// kick2x: handled by note creation logic (standalone kick2x creates note;
				// when regular kick coexists, kick2x is dropped to match MoonSong dedup)
				case eventTypes.kick2x:
					break
				case eventTypes.kickAccent:
					// YARG/MoonSong doesn't support kick accent (pad 0 excluded from velocity processing)
					break
				case eventTypes.redAccent:
					for (const n of notesAtTick) { if (n.rawNote === 1) n.flags |= moonNoteFlags.proDrumsAccent }
					break
				case eventTypes.yellowAccent:
					for (const n of notesAtTick) { if (n.rawNote === 2) n.flags |= moonNoteFlags.proDrumsAccent }
					break
				case eventTypes.blueAccent:
					for (const n of notesAtTick) { if (n.rawNote === 3) n.flags |= moonNoteFlags.proDrumsAccent }
					break
				case eventTypes.fiveOrangeFourGreenAccent:
					for (const n of notesAtTick) { if (n.rawNote === 4) n.flags |= moonNoteFlags.proDrumsAccent }
					break
				case eventTypes.fiveGreenAccent:
					for (const n of notesAtTick) { if (n.rawNote === 5) n.flags |= moonNoteFlags.proDrumsAccent }
					break
				case eventTypes.kickGhost:
					// YARG/MoonSong doesn't support kick ghost (pad 0 excluded from velocity processing)
					break
				case eventTypes.redGhost:
					for (const n of notesAtTick) { if (n.rawNote === 1) n.flags |= moonNoteFlags.proDrumsGhost }
					break
				case eventTypes.yellowGhost:
					for (const n of notesAtTick) { if (n.rawNote === 2) n.flags |= moonNoteFlags.proDrumsGhost }
					break
				case eventTypes.blueGhost:
					for (const n of notesAtTick) { if (n.rawNote === 3) n.flags |= moonNoteFlags.proDrumsGhost }
					break
				case eventTypes.fiveOrangeFourGreenGhost:
					for (const n of notesAtTick) { if (n.rawNote === 4) n.flags |= moonNoteFlags.proDrumsGhost }
					break
				case eventTypes.fiveGreenGhost:
					for (const n of notesAtTick) { if (n.rawNote === 5) n.flags |= moonNoteFlags.proDrumsGhost }
					break

				// Cymbal markers (.chart) — set cymbal flag on specific pad
				case eventTypes.yellowCymbalMarker:
					for (const n of notesAtTick) { if (n.rawNote === 2) n.flags |= moonNoteFlags.proDrumsCymbal }
					break
				case eventTypes.blueCymbalMarker:
					for (const n of notesAtTick) { if (n.rawNote === 3) n.flags |= moonNoteFlags.proDrumsCymbal }
					break
				case eventTypes.greenCymbalMarker:
					for (const n of notesAtTick) { if (n.rawNote === 4) n.flags |= moonNoteFlags.proDrumsCymbal }
					break

				// Tom markers (.mid) — in MoonSong, cymbal is default; tom marker CLEARS it
				// The old parser already split tom marker sustains into per-note events.
				// Since we set cymbal by default below, presence of tom marker should clear it.
				case eventTypes.yellowTomMarker:
					for (const n of notesAtTick) { if (n.rawNote === 2) n.flags &= ~moonNoteFlags.proDrumsCymbal }
					break
				case eventTypes.blueTomMarker:
					for (const n of notesAtTick) { if (n.rawNote === 3) n.flags &= ~moonNoteFlags.proDrumsCymbal }
					break
				case eventTypes.greenTomMarker:
					// MIDI 112 → Orange (rawNote 4) only, NOT Green (rawNote 5)
					for (const n of notesAtTick) { if (n.rawNote === 4) n.flags &= ~moonNoteFlags.proDrumsCymbal }
					break
			}
		}

		// For MIDI drums: set default cymbal on yellow(2)/blue(3)/orange(4)
		// Then tom markers (already applied above) clear it.
		// Note: This must happen BEFORE tom markers are applied. Since we just applied tom
		// markers above which clear the flag, we need to set the default first then re-clear.
		// Let's restructure: set default, then re-apply tom markers.
		if (isDrums) {
			for (const n of notes) {
				if (n.rawNote === 2 || n.rawNote === 3 || n.rawNote === 4) {
					n.flags |= moonNoteFlags.proDrumsCymbal
				}
			}
			// Re-apply tom markers to clear cymbal
			for (const ev of td.trackEvents) {
				if (ev.type === eventTypes.yellowTomMarker || ev.type === eventTypes.blueTomMarker || ev.type === eventTypes.greenTomMarker) {
					const notesAtTick = notesByTick.get(ev.tick)
					if (!notesAtTick) continue
					if (ev.type === eventTypes.yellowTomMarker) {
						for (const n of notesAtTick) { if (n.rawNote === 2) n.flags &= ~moonNoteFlags.proDrumsCymbal }
					} else if (ev.type === eventTypes.blueTomMarker) {
						for (const n of notesAtTick) { if (n.rawNote === 3) n.flags &= ~moonNoteFlags.proDrumsCymbal }
					} else if (ev.type === eventTypes.greenTomMarker) {
						for (const n of notesAtTick) { if (n.rawNote === 4) n.flags &= ~moonNoteFlags.proDrumsCymbal }
					}
				}
			}
		}

		// Build phrases from the old separate arrays + additional MIDI phrases
		const phrases: MoonPhrase[] = []
		for (const sp of td.starPowerSections) {
			phrases.push({ tick: sp.tick, length: sp.length, type: phraseTypes.starpower })
		}
		for (const solo of td.soloSections) {
			phrases.push({ tick: solo.tick, length: solo.length, type: phraseTypes.solo })
		}
		for (const fl of td.flexLanes) {
			phrases.push({ tick: fl.tick, length: fl.length, type: fl.isDouble ? phraseTypes.trillLane : phraseTypes.tremoloLane })
		}
		for (const fs of td.drumFreestyleSections) {
			phrases.push({ tick: fs.tick, length: fs.length, type: phraseTypes.proDrumsActivation })
		}

		// Collect additional phrases from MIDI that the old model doesn't capture:
		// - Drum fills 121-124 (old parser only tracks 120)
		// - Versus phrases (notes 105-106)
		{
			const phraseTrackNames = _.keys(_.pickBy(instrumentNameMap, v => v === td.instrument))
			const midiTrack = midiTracks.find(t => phraseTrackNames.includes(t.trackName))
			if (midiTrack) {
				// MIDI phrase notes to PhraseType
				const midiPhraseMappings: Record<number, PhraseType> = {
					105: phraseTypes.versusPlayer1,
					106: phraseTypes.versusPlayer2,
				}
				if (isDrums) {
					// Notes 121-124 are additional drum fill lanes
					midiPhraseMappings[121] = phraseTypes.proDrumsActivation
					midiPhraseMappings[122] = phraseTypes.proDrumsActivation
					midiPhraseMappings[123] = phraseTypes.proDrumsActivation
					midiPhraseMappings[124] = phraseTypes.proDrumsActivation
				}

				const pendingPhrases: Map<number, number> = new Map() // noteNumber → startTick
				for (const ev of midiTrack.trackEvents) {
					if (ev.type !== 'noteOn' && ev.type !== 'noteOff') continue
					const noteNum = (ev as any).noteNumber as number
					const pt = midiPhraseMappings[noteNum]
					if (pt === undefined) continue

					const isNoteOn = ev.type === 'noteOn' && (ev as any).velocity > 0
					if (isNoteOn) {
						pendingPhrases.set(noteNum, ev.deltaTime)
					} else {
						const startTick = pendingPhrases.get(noteNum)
						if (startTick !== undefined) {
							phrases.push({ tick: startTick, length: ev.deltaTime - startTick, type: pt })
							pendingPhrases.delete(noteNum)
						}
					}
				}
			}
		}

		phrases.sort((a, b) => a.tick - b.tick || a.type - b.type)
		// Dedup phrases by tick+length+type
		{
			const seen = new Set<string>()
			const deduped: MoonPhrase[] = []
			for (const p of phrases) {
				const key = `${p.tick}:${p.length}:${p.type}`
				if (!seen.has(key)) { seen.add(key); deduped.push(p) }
			}
			phrases.length = 0
			phrases.push(...deduped)
		}

		// Collect per-track text events from MIDI
		const textEvents: { tick: number; text: string }[] = []
		// Find the matching MIDI track — instrument may map to multiple track names (e.g. 'T1 GEMS' and 'PART GUITAR')
		const trackNamesForInstrument = _.keys(_.pickBy(instrumentNameMap, v => v === td.instrument))
		{
			const midiTrack = midiTracks.find(t => trackNamesForInstrument.includes(t.trackName))
			if (midiTrack) {
				// MoonSong includes all BaseTextEvent types except trackName and copyrightNotice
				const textEventTypes = new Set(['text', 'lyrics', 'instrumentName', 'marker', 'cuePoint'])
				for (const ev of midiTrack.trackEvents) {
					if (textEventTypes.has(ev.type)) {
						const text = ((ev as MidiTextEvent).text ?? '').trim()
						if (!text) continue
						// Only filter control events for the relevant instrument
						if (isDrums && (text === 'ENABLE_CHART_DYNAMICS' || text === '[ENABLE_CHART_DYNAMICS]')) continue
						if (!isDrums && (text === 'ENHANCED_OPENS' || text === '[ENHANCED_OPENS]')) continue
						textEvents.push({ tick: ev.deltaTime, text })
					}
				}
			}
		}

		// SysEx tap clears hopo/strum (runs first via sysexProcessList in YARG).
		// Note 104 tap keeps hopo/strum (runs after via forcingProcessList), but this is rare.
		// We clear hopo/strum since SysEx tap is the dominant source.
		for (const n of notes) {
			if (n.flags & moonNoteFlags.tap) {
				n.flags &= ~(moonNoteFlags.forcedHopo | moonNoteFlags.forcedStrum | moonNoteFlags.forced)
			}
		}

		// Dedup text events by tick+text (MoonSong deduplicates via InsertionEquals)
		{
			const seen = new Set<string>()
			const deduped: { tick: number; text: string }[] = []
			for (const te of textEvents) {
				const key = `${te.tick}:${te.text}`
				if (!seen.has(key)) { seen.add(key); deduped.push(te) }
			}
			textEvents.length = 0
			textEvents.push(...deduped)
		}

		// Sort notes and dedup at same tick+rawNote.
		// For same tick+rawNote, sort by flags descending so kick2x (doubleKick=128) comes before
		// regular kick (flags=0), matching MoonSong's insertion order (lower MIDI note first).
		notes.sort((a, b) => a.tick - b.tick || a.rawNote - b.rawNote || b.flags - a.flags)
		// Dedup notes at same tick+rawNote — MoonSong keeps the first insertion, discards duplicates
		{
			const merged: MoonNote[] = []
			for (const n of notes) {
				const prev = merged[merged.length - 1]
				if (prev && prev.tick === n.tick && prev.rawNote === n.rawNote) {
					// Discard duplicate (MoonSong's InsertionEquals drops the second one)
					continue
				}
				merged.push(n)
			}
			notes.length = 0
			notes.push(...merged)
		}

		results.push({
			instrument: moonInst,
			difficulty: td.difficulty,
			gameMode: gm,
			notes,
			phrases,
			textEvents,
			animations: [],
		})
	}

	return results
}

interface TrackEventEnd {
	tick: number
	type: EventType
	// Necessary because .mid stores some additional modifiers and information using velocity
	velocity: number
	channel: number
	// Necessary because .mid stores track events as separate start and end events
	isStart: boolean
}

// Necessary because .mid stores some additional modifiers and information using velocity
type MidiTrackEvent = RawChartData['trackData'][number]['trackEvents'][number] & { velocity: number; channel: number }

/**
 * Parses `buffer` as a chart in the .mid format. Returns all the note data in `RawChartData`, but any
 * chart format rules that apply to both .chart and .mid have not been applied. This is a partial result
 * that can be produced by both the .chart and .mid formats so that the remaining chart rules can be parsed
 * without code duplication.
 *
 * Throws an exception if `buffer` could not be parsed as a chart in the .mid format.
 *
 * Note: these features of .mid are ignored (for now)
 * Versus phrase markers
 * Trill lanes
 * Tremolo lanes
 * [PART DRUMS_2X] (RBN)
 * Real Drums (Phase Shift)
 */
export function parseNotesFromMidi(data: Uint8Array, iniChartModifiers: IniChartModifiers): RawChartData {
	const midiFile = parseMidi(data)
	if (midiFile.header.format !== 1) {
		throw `Invavlid .mid file: unsupported header format "${midiFile.header.format}"`
	}

	if (!midiFile.header.ticksPerBeat) {
		throw 'Invalid .mid file: resolution in ticks per SMPTE frame is not supported'
	}

	if (midiFile.tracks.length === 0) {
		throw 'Invalid .mid file: no tracks detected'
	}

	// Preserve raw tempo track (track 0) before absolute time conversion
	const midiTempoTrack = midiFile.tracks[0]?.map(e => ({ ...e }))

	// Capture original track ordering and raw instrument track data before conversion.
	// Use the LAST trackName event at deltaTime 0, matching getTracks() behavior
	// (some tracks have multiple trackName events with different names).
	const midiTrackOrder: string[] = []
	const midiInstrumentTracks: Record<string, MidiEvent[]> = {}
	for (const track of midiFile.tracks) {
		let name = ''
		for (const event of track) {
			if (event.deltaTime !== 0) break
			if (event.type === 'trackName') name = (event as any).text
		}
		// Use index-based key for unnamed or duplicate tracks to avoid collisions.
		const idx = midiTrackOrder.length
		const trackKey = (name && !(name in midiInstrumentTracks)) ? name : `${name || '__unnamed'}__${idx}`
		midiTrackOrder.push(trackKey)
		// Save raw delta-time events for all non-tempo tracks.
		if (idx > 0) {
			// Already in delta-time format (before convertToAbsoluteTime).
			// Strip `running` (parser artifact) and fix corrupted negative deltas
			// by converting to absolute time, sorting, and converting back.
			let absTick = 0
			const absEvents = track.map(e => {
				absTick += e.deltaTime
				const { running: _, ...rest } = e as MidiEvent & { running?: boolean }
				return { ...rest, _absTick: absTick }
			})
			absEvents.sort((a, b) => a._absTick - b._absTick)
			let prevTick = 0
			midiInstrumentTracks[trackKey] = absEvents.map(e => {
				const delta = Math.max(0, e._absTick - prevTick)
				prevTick = e._absTick
				const { _absTick, ...rest } = e as any
				return { ...rest, deltaTime: delta }
			})
		}
	}

	// Sets event.deltaTime to the number of ticks since the start of the track
	convertToAbsoluteTime(midiFile)

	const tracks = getTracks(midiFile)

	const vocalsTrack = tracks.find(t => t.trackName === 'PART VOCALS')
	const codaEvents =
		tracks
			.find(t => t.trackName === 'EVENTS')
			?.trackEvents.filter(e => e.type === 'text' && (e.text.trim() === 'coda' || e.text.trim() === '[coda]')) ?? []
	const firstCodaTick = codaEvents[0] ? codaEvents[0].deltaTime : null

	// Compute trackData before return so we can derive tracks[] from it
	const computedTrackData = _.chain(tracks)
		.filter(t => _.keys(instrumentNameMap).includes(t.trackName))
		.uniqBy('trackName')
		.map(t => {
			const instrument = instrumentNameMap[t.trackName as InstrumentTrackName]
			const instrumentType = getInstrumentType(instrument)
			const preSplit = _.chain(t.trackEvents)
				.thru(trackEvents => getTrackEventEnds(trackEvents, instrumentType))
				.thru(eventEnds => distributeInstrumentEvents(eventEnds))
				.thru(eventEnds => getTrackEvents(eventEnds))
				.value()

			const modSustainTypes: EventType[] =
				instrumentType === instrumentTypes.drums ?
					[eventTypes.forceFlam, eventTypes.yellowTomMarker, eventTypes.blueTomMarker, eventTypes.greenTomMarker]
				:	[eventTypes.forceOpen, eventTypes.forceTap, eventTypes.forceStrum, eventTypes.forceHopo]
			const modSustainsByDiff: { [key in Difficulty]?: { tick: number; length: number; type: EventType }[] } = {}
			for (const d of difficulties) {
				modSustainsByDiff[d] = preSplit[d]
					.filter(e => modSustainTypes.includes(e.type))
					.map(e => ({ tick: e.tick, length: e.length, type: e.type }))
			}

			const trackDifficulties = _.chain(preSplit)
				.thru(events => splitMidiModifierSustains(events, instrumentType))
				.thru(events => fixLegacyGhStarPower(events, instrumentType, iniChartModifiers))
				.thru(events => fixFlexLaneLds(events))
				.value()

			return difficulties.map(difficulty => {
				const result: RawChartData['trackData'][number] = {
					instrument,
					difficulty,
					starPowerSections: [],
					rejectedStarPowerSections: [],
					soloSections: [],
					flexLanes: [],
					drumFreestyleSections: [],
					modifierSustains: modSustainsByDiff[difficulty] ?? [],
					trackEvents: [],
				}

				for (const event of trackDifficulties[difficulty]) {
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
		})
		.flatMap()
		.filter(track => track.trackEvents.length > 0)
		.map(track => {
			track.trackEvents = dedupByTickType(track.trackEvents)
			track.trackEvents = removeOrphanedAccentGhost(track.trackEvents)
			track.starPowerSections = dedupByTickLen(track.starPowerSections)
			track.soloSections = dedupByTickLen(track.soloSections)
			track.drumFreestyleSections = dedupByTickLen(track.drumFreestyleSections)
			track.flexLanes = dedupByTickLen(track.flexLanes)
			return track
		})
		.value()

	return {
		chartTicksPerBeat: midiFile.header.ticksPerBeat,
		metadata: {}, // .mid does not have a mechanism for storing song metadata
		hasLyrics: !!vocalsTrack?.trackEvents.find(e => e.type === 'lyrics' || e.type === 'text'),
		hasVocals: !!vocalsTrack?.trackEvents.find(e => e.type === 'noteOn' && e.noteNumber <= 84 && e.noteNumber >= 36),
		lyrics: _.chain(vocalsTrack?.trackEvents)
			.filter((e): e is MidiTextEvent => e.type === 'lyrics' || (e.type === 'text' && e.text.trim() !== ''))
			.map(e => ({
				tick: e.deltaTime,
				length: 0, // MIDI lyric events typically don't have length, they're instantaneous
				text: e.text.trim(),
			}))
			.value(),
		vocalPhrases: getVocalPhrases(vocalsTrack?.trackEvents ?? []),
		tempos: _.chain(midiFile.tracks[0])
			.filter((e): e is MidiSetTempoEvent => e.type === 'setTempo')
			.map(e => ({
				tick: e.deltaTime,
				// Note that this operation is float64 division, and is impacted by floating point precision errors
				beatsPerMinute: 60000000 / e.microsecondsPerBeat,
			}))
			// Dedup by tick — last value at a given tick wins (matches MoonSong behavior)
			.thru(tempos => {
				const byTick = new Map<number, typeof tempos[0]>()
				for (const t of tempos) byTick.set(t.tick, t)
				return [...byTick.values()]
			})
			.tap(tempos => {
				const zeroTempo = tempos.find(tempo => tempo.beatsPerMinute === 0)
				if (zeroTempo) {
					throw `Invalid .mid file: Tempo at tick ${zeroTempo.tick} was zero.`
				}
				if (!tempos[0] || tempos[0].tick !== 0) {
					tempos.unshift({ tick: 0, beatsPerMinute: 120 })
				}
			})
			.value(),
		timeSignatures: _.chain(midiFile.tracks[0])
			.filter((e): e is MidiTimeSignatureEvent => e.type === 'timeSignature')
			.map(e => ({
				tick: e.deltaTime,
				numerator: e.numerator,
				denominator: e.denominator,
				metronome: e.metronome,
				thirtyseconds: e.thirtyseconds,
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
					timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 })
				}
			})
			.value(),
		sections: _.chain(tracks)
			.find(t => t.trackName === 'EVENTS')
			.get('trackEvents')
			// MoonSong reads sections from all text event types (text, lyrics, marker, cuePoint)
			.filter((e): e is MidiTextEvent => e.type === 'text' || e.type === 'lyrics' || e.type === 'marker' || e.type === 'cuePoint')
			.map(e => {
				// Normalize: strip brackets (matching YARG's NormalizeTextEvent)
				let text = e.text.trim()
				const bracketStart = text.indexOf('[')
				const bracketEnd = text.indexOf(']')
				if (bracketStart >= 0 && bracketEnd > bracketStart) {
					text = text.slice(bracketStart + 1, bracketEnd)
				}
				// Parse section/prc prefix (YARG strips prefix then TrimStart('_').Trim())
				// "section " requires space/underscore, "prc" does not (prcVerse_1a is valid)
				const match = /^(?:section[ _]|prc[ _]?)(.*)$/.exec(text)
				if (!match) return null
				return { tick: e.deltaTime, name: match[1].replace(/^_/, '').trim() }
			})
			.compact()
			.value(),
		endEvents: _.chain(tracks)
			.find(t => t.trackName === 'EVENTS')
			.get('trackEvents')
			.filter((e): e is MidiTextEvent =>
				(e.type === 'text' || e.type === 'lyrics' || e.type === 'marker' || e.type === 'cuePoint') &&
				/^\[?end\]?$/.test((e as MidiTextEvent).text))
			.map(e => ({
				tick: e.deltaTime,
			}))
			.value(),
		trackData: computedTrackData,
		// ── MoonSong-aligned fields (plan 0029) ──
		tracks: trackDataToMoonTracks(computedTrackData, tracks),
		globalEvents: _.chain(tracks)
			.find(t => t.trackName === 'EVENTS')
			.get('trackEvents')
			.filter((e): e is MidiTextEvent => {
				if (e.type !== 'text' && e.type !== 'lyrics' && e.type !== 'marker' && e.type !== 'cuePoint') return false
				const text = (e as MidiTextEvent).text.trim()
				if (/^\[?(?:section[ _]|prc[ _]?)/.test(text)) return false
				if (/^\[?end\]?$/.test(text)) return false
				if (/^\[?coda\]?$/.test(text)) return false
				return true
			})
			.map(e => ({ tick: e.deltaTime, text: e.text.trim() }))
			.value(),
		midiTrackOrder,
		midiTempoTrack,
		midiInstrumentTracks: Object.keys(midiInstrumentTracks).length > 0 ? midiInstrumentTracks : undefined,
		unknownMidiTracks:
			unknownTracks.length > 0
				? unknownTracks.map(t => ({
						name: t.name,
						events: convertToDeltaTime(t.events),
					}))
				: undefined,
	}
}

function convertToAbsoluteTime(midiData: MidiData) {
	for (const track of midiData.tracks) {
		let currentTick = 0
		for (const event of track) {
			currentTick += event.deltaTime
			event.deltaTime = currentTick
		}
	}
}

function getTracks(midiData: MidiData) {
	const tracks: { trackName: TrackName; trackEvents: MidiEvent[] }[] = []

	for (const track of midiData.tracks) {
		let trackName: string | null = null
		for (const event of track) {
			if (event.deltaTime !== 0) {
				break
			}
			if (event.type === 'trackName' && trackNames.includes(event.text as TrackName)) {
				trackName = event.text
			}
		}

		if (trackName !== null) {
			tracks.push({
				trackName: trackName as TrackName,
				trackEvents: track,
			})
		}
	}

	return tracks
}

/** Gets the starting and ending notes for all midi events defined for the .mid chart spec. */
function getTrackEventEnds(events: MidiEvent[], instrumentType: InstrumentType) {
	let enhancedOpens = false
	const trackEventEnds: { [difficulty in Difficulty | 'all']: TrackEventEnd[] } = {
		all: [],
		expert: [],
		hard: [],
		medium: [],
		easy: [],
	}

	for (const event of events) {
		// SysEx event (tap modifier or open)
		if ((event.type === 'sysEx' || event.type === 'endSysEx') && event.data.length > 6) {
			if (event.data[0] === 0x50 && event.data[1] === 0x53 && event.data[2] === 0x00 && event.data[3] === 0x00) {
				// Phase Shift SysEx event
				const type =
					event.data[5] === 0x01 ? eventTypes.forceOpen
					: event.data[5] === 0x04 ? eventTypes.forceTap
					: null

				if (type !== null) {
					trackEventEnds[event.data[4] === 0xff ? 'all' : discoFlipDifficultyMap[event.data[4]]].push({
						tick: event.deltaTime,
						type,
						channel: 1,
						// Use velocity 0 as sentinel for SysEx-sourced events, so splitMidiModifierSustains
						// can distinguish SysEx forceTap (inclusive end) from MIDI note 104 (exclusive end).
						velocity: 0,
						isStart: event.data[6] === 0x01,
					})
				}
			}
		} else if (event.type === 'noteOn' || event.type === 'noteOff') {
			const difficulty =
				event.noteNumber <= 66 ? 'easy'
				: event.noteNumber <= 78 ? 'medium'
				: event.noteNumber <= 90 ? 'hard'
				: event.noteNumber <= 102 ? 'expert'
				: 'all'
			if (difficulty === 'all') {
				// Instrument-wide event (solo marker, star power, etc...) (applies to all difficulties)
				const type = getInstrumentEventType(event.noteNumber)
				if (type !== null) {
					trackEventEnds[difficulty].push({
						tick: event.deltaTime,
						type,
						velocity: event.velocity,
						channel: event.channel,
						isStart: event.type === 'noteOn',
					})
				}
			} else {
				const type =
					(instrumentType === instrumentTypes.sixFret ? get6FretNoteType(event.noteNumber, difficulty)
					: instrumentType === instrumentTypes.drums ? getDrumsNoteType(event.noteNumber, difficulty)
					: get5FretNoteType(event.noteNumber, difficulty, enhancedOpens)) ?? null
				if (type !== null) {
					trackEventEnds[difficulty].push({
						tick: event.deltaTime,
						type,
						velocity: event.velocity,
						channel: event.channel,
						isStart: event.type === 'noteOn',
					})
				}
			}
		} else if (event.type === 'text') {
			if (instrumentType === instrumentTypes.drums) {
				const discoFlipMatch = event.text.match(/^\s*\[?mix[ _]([0-3])[ _]drums([0-5])(d|dnoflip|easy|easynokick|)\]?\s*$/)
				if (discoFlipMatch) {
					const difficulty = sysExDifficultyMap[Number(discoFlipMatch[1])]
					const flag = discoFlipMatch[3] as 'd' | 'dnoflip' | 'easy' | 'easynokick' | ''
					const eventType =
						flag === '' ? eventTypes.discoFlipOff
						: flag === 'd' ? eventTypes.discoFlipOn
						: flag === 'dnoflip' ? eventTypes.discoNoFlipOn
						: null
					if (eventType) {
						// Treat this like the other events that have a start and end, so it can be processed the same way later
						trackEventEnds[difficulty].push({ tick: event.deltaTime, type: eventType, velocity: 127, channel: 1, isStart: true })
						trackEventEnds[difficulty].push({ tick: event.deltaTime, type: eventType, velocity: 127, channel: 1, isStart: false })
					}
				}
			}

			if (event.text === 'ENHANCED_OPENS' || event.text === '[ENHANCED_OPENS]') {
				enhancedOpens = true
			} else if (event.text === 'ENABLE_CHART_DYNAMICS' || event.text === '[ENABLE_CHART_DYNAMICS]') {
				// Treat this like the other events that have a start and end, so it can be processed the same way later
				trackEventEnds['all'].push({ tick: event.deltaTime, type: eventTypes.enableChartDynamics, channel: 1, isStart: true, velocity: 127 })
				trackEventEnds['all'].push({ tick: event.deltaTime, type: eventTypes.enableChartDynamics, channel: 1, isStart: false, velocity: 127 })
			}
		}
	}

	return trackEventEnds
}

/** These apply to the entire instrument, not specific difficulties. */
function getInstrumentEventType(note: number) {
	switch (note) {
		case 103:
			return eventTypes.soloSection
		case 104:
			return eventTypes.forceTap
		case 109:
			return eventTypes.forceFlam
		case 110:
			return eventTypes.yellowTomMarker
		case 111:
			return eventTypes.blueTomMarker
		case 112:
			return eventTypes.greenTomMarker
		case 116:
			return eventTypes.starPower
		case 120:
			if (instrumentType !== instrumentTypes.drums) return null
			return eventTypes.freestyleSection
		// Note: The official spec says all five need to be active to count as a drum fill, but some charts don't do this.
		// Most other popular parsers only check midi note 120 for better compatibility.
		// case 121:
		// 	return eventTypes.freestyleSection2
		// case 122:
		// 	return eventTypes.freestyleSection3
		// case 123:
		// 	return eventTypes.freestyleSection4
		// case 124:
		// 	return eventTypes.freestyleSection5
		case 126:
			return eventTypes.flexLaneSingle
		case 127:
			return eventTypes.flexLaneDouble
		default:
			return null
	}
}

function get6FretNoteType(note: number, difficulty: Difficulty) {
	switch (note - sixFretDiffStarts[difficulty]) {
		case 0:
			return eventTypes.open // Not forceOpen
		case 1:
			return eventTypes.white1
		case 2:
			return eventTypes.white2
		case 3:
			return eventTypes.white3
		case 4:
			return eventTypes.black1
		case 5:
			return eventTypes.black2
		case 6:
			return eventTypes.black3
		case 7:
			return eventTypes.forceHopo
		case 8:
			return eventTypes.forceStrum
		default:
			return null
	}
}

function get5FretNoteType(note: number, difficulty: Difficulty, enhancedOpens: boolean) {
	switch (note - fiveFretDiffStarts[difficulty]) {
		case 0:
			return enhancedOpens ? eventTypes.open : null // Not forceOpen
		case 1:
			return eventTypes.green
		case 2:
			return eventTypes.red
		case 3:
			return eventTypes.yellow
		case 4:
			return eventTypes.blue
		case 5:
			return eventTypes.orange
		case 6:
			return eventTypes.forceHopo
		case 7:
			return eventTypes.forceStrum
		default:
			return null
	}
}

function getDrumsNoteType(note: number, difficulty: Difficulty) {
	switch (note - drumsDiffStarts[difficulty]) {
		case -1:
			return eventTypes.kick2x
		case 0:
			return eventTypes.kick
		case 1:
			return eventTypes.redDrum
		case 2:
			return eventTypes.yellowDrum
		case 3:
			return eventTypes.blueDrum
		case 4:
			return eventTypes.fiveOrangeFourGreenDrum
		case 5:
			return eventTypes.fiveGreenDrum
		default:
			return null
	}
}

/**
 * Any Sysex modifiers with difficulty 0xFF are meant to apply to all charted difficulties.
 * Any instrument events above midi note 102 are meant to apply to all charted difficulties.
 * enableChartDynamics is meant to apply to all charted difficulties.
 * Distributes all of these to each difficulty in the instrument.
 */
function distributeInstrumentEvents(eventEnds: { [difficulty in Difficulty | 'all']: TrackEventEnd[] }) {
	for (const instrumentEvent of eventEnds.all) {
		for (const difficulty of difficulties) {
			if (eventEnds[difficulty].length === 0) {
				continue // Skip adding modifiers to uncharted difficulties
			}
			eventEnds[difficulty].push(_.clone(instrumentEvent))
		}
	}

	return {
		expert: _.orderBy(eventEnds.expert, ['tick', 'type'], ['asc', 'desc']),
		hard: _.orderBy(eventEnds.hard, ['tick', 'type'], ['asc', 'desc']),
		medium: _.orderBy(eventEnds.medium, ['tick', 'type'], ['asc', 'desc']),
		easy: _.orderBy(eventEnds.easy, ['tick', 'type'], ['asc', 'desc']),
	}
}

/**
 * Connects together start and end events to determine event lengths.
 */
function getTrackEvents(trackEventEnds: { [key in Difficulty]: TrackEventEnd[] }) {
	const trackEvents: { [key in Difficulty]: MidiTrackEvent[] } = { expert: [], hard: [], medium: [], easy: [] }

	for (const difficulty of difficulties) {
		const partialTrackEventsMap = _.chain(eventTypes)
			.values()
			.map(k => [k, []])
			.fromPairs()
			.value() as { [key in EventType]: MidiTrackEvent[] }

		for (const trackEventEnd of trackEventEnds[difficulty]) {
			const partialTrackEvents = partialTrackEventsMap[trackEventEnd.type]
			if (trackEventEnd.isStart) {
				const partialTrackEvent: MidiTrackEvent = {
					tick: trackEventEnd.tick,
					length: -1, // Represents that this is a partial track event (an end event has not been found for this yet)
					type: trackEventEnd.type,
					velocity: trackEventEnd.velocity,
					channel: trackEventEnd.channel,
				}
				partialTrackEvents.push(partialTrackEvent)
				trackEvents[difficulty].push(partialTrackEvent)
			} else if (partialTrackEvents.length) {
				let partialTrackEventIndex = partialTrackEvents.length - 1
				while (partialTrackEventIndex >= 0 && partialTrackEvents[partialTrackEventIndex].channel !== trackEventEnd.channel) {
					partialTrackEventIndex-- // Find the most recent partial event on the same channel
				}
				if (partialTrackEventIndex >= 0) {
					const partialTrackEvent = _.pullAt(partialTrackEvents, partialTrackEventIndex)[0]
					partialTrackEvent.length = trackEventEnd.tick - partialTrackEvent.tick
				}
			}
		}

		_.remove(trackEvents[difficulty], e => e.length === -1) // Remove all remaining partial events
	}

	return trackEvents
}

/**
 * These event types are modifier sustains that apply to all notes active during them:
 * - forceOpen
 * - forceTap
 * - forceStrum
 * - forceHopo
 * - forceFlam
 * - yellowTomMarker
 * - blueTomMarker
 * - greenTomMarker
 *
 * Splits these modifiers into zero-length modifier events on each unique note tick under them,
 * to mimic how .chart stores modifier events.
 * (Note: The ending tick of the modifier phrase is excluded)
 *
 * There are more "modifiers" like this, but these are the ones that are midi-specific.
 * Code to handle the remaining modifiers is shared between the .mid and .chart parsers later.
 */
function splitMidiModifierSustains(events: { [key in Difficulty]: MidiTrackEvent[] }, instrumentType: InstrumentType) {
	let enableChartDynamics = false
	const t = eventTypes
	const modifierSustains: EventType[] =
		instrumentType === instrumentTypes.drums ?
			[t.forceFlam, t.yellowTomMarker, t.blueTomMarker, t.greenTomMarker]
		:	[t.forceOpen, t.forceTap, t.forceStrum, t.forceHopo]
	const modifiableNotes: EventType[] =
		instrumentType === instrumentTypes.fiveFret ? [t.open, t.green, t.red, t.yellow, t.blue, t.orange]
		: instrumentType === instrumentTypes.sixFret ? [t.open, t.black3, t.black2, t.black1, t.white3, t.white2, t.white1]
		: [t.kick, t.kick2x, t.redDrum, t.yellowDrum, t.blueDrum, t.fiveOrangeFourGreenDrum, t.fiveGreenDrum]

	const newEvents: { [key in Difficulty]: MidiTrackEvent[] } = { expert: [], hard: [], medium: [], easy: [] }

	for (const difficulty of difficulties) {
		let hasNotes = false
		const activeModifiers: MidiTrackEvent[] = []
		/**
		 * A map of the last zero-length modifiers to be added to `newEvents`.
		 * used to check that duplicates are not added at the same tick.
		 */
		const latestInsertedModifiers: Partial<{ [key in EventType]: MidiTrackEvent }> = {}

		for (const event of events[difficulty]) {
			if (event.type === eventTypes.enableChartDynamics) {
				enableChartDynamics = true
				continue
			}

			// SysEx forceTap includes the end tick (per Phase Shift / Clone Hero / YARG).
			// MIDI note 104 forceTap excludes the end tick.
			// SysEx-sourced events have velocity=0 (sentinel); note 104 has velocity>0.
			_.remove(activeModifiers, m => {
				if (m.length === 0) return m.tick + m.length < event.tick
				if (m.type === eventTypes.forceTap && m.velocity === 0) return m.tick + m.length < event.tick
				return m.tick + m.length <= event.tick
			})

			if (modifierSustains.includes(event.type)) {
				activeModifiers.push(event)
				continue // Don't add modifier sustain to final result
			}

			if (modifiableNotes.includes(event.type)) {
				hasNotes = true
				// Add all currently active modifiers to event, if those modifiers haven't been added here already
				for (const activeModifier of activeModifiers) {
					const latestInsertedModifier = latestInsertedModifiers[activeModifier.type]
					if (!latestInsertedModifier || latestInsertedModifier.tick < event.tick) {
						const newInsertedModifier: MidiTrackEvent = {
							tick: event.tick,
							length: 0,
							type: activeModifier.type,
							velocity: activeModifier.velocity,
							channel: activeModifier.channel,
						}
						latestInsertedModifiers[activeModifier.type] = newInsertedModifier
						newEvents[difficulty].push(newInsertedModifier)
					}
				}

				if (enableChartDynamics && instrumentType === instrumentTypes.drums && (event.velocity === 1 || event.velocity === 127)) {
					newEvents[difficulty].push({
						tick: event.tick,
						length: 0,
						velocity: 127,
						channel: event.channel,
						type: event.velocity === 1 ? getDrumGhostNoteType(event.type)! : getDrumAccentNoteType(event.type)!,
					})
				}
			}

			newEvents[difficulty].push(event)
		}

		// Ensure that modifiers and other events are not copied into uncharted difficulties
		if (!hasNotes) {
			newEvents[difficulty] = []
		}
	}

	return newEvents
}

function getDrumGhostNoteType(note: EventType) {
	switch (note) {
		case eventTypes.redDrum:
			return eventTypes.redGhost
		case eventTypes.yellowDrum:
			return eventTypes.yellowGhost
		case eventTypes.blueDrum:
			return eventTypes.blueGhost
		case eventTypes.fiveOrangeFourGreenDrum:
			return eventTypes.fiveOrangeFourGreenGhost
		case eventTypes.fiveGreenDrum:
			return eventTypes.fiveGreenGhost
		case eventTypes.kick:
			return eventTypes.kickGhost
		case eventTypes.kick2x:
			return eventTypes.kickGhost
	}
}

function getDrumAccentNoteType(note: EventType) {
	switch (note) {
		case eventTypes.redDrum:
			return eventTypes.redAccent
		case eventTypes.yellowDrum:
			return eventTypes.yellowAccent
		case eventTypes.blueDrum:
			return eventTypes.blueAccent
		case eventTypes.fiveOrangeFourGreenDrum:
			return eventTypes.fiveOrangeFourGreenAccent
		case eventTypes.fiveGreenDrum:
			return eventTypes.fiveGreenAccent
		case eventTypes.kick:
			return eventTypes.kickAccent
		case eventTypes.kick2x:
			return eventTypes.kickAccent
	}
}

function fixLegacyGhStarPower(
	events: { [key in Difficulty]: MidiTrackEvent[] },
	instrumentType: InstrumentType,
	iniChartModifiers: IniChartModifiers,
) {
	if ((instrumentType === instrumentTypes.fiveFret || instrumentType === instrumentTypes.sixFret) && iniChartModifiers.multiplier_note !== 116) {
		for (const difficulty of difficulties) {
			const starPowerSections: MidiTrackEvent[] = []
			const soloSections: MidiTrackEvent[] = []

			for (const event of events[difficulty]) {
				if (event.type === eventTypes.starPower) {
					starPowerSections.push(event)
				} else if (event.type === eventTypes.soloSection) {
					soloSections.push(event)
				}
			}

			if (iniChartModifiers.multiplier_note === 103 || (!starPowerSections.length && soloSections.length > 1)) {
				for (const soloSection of soloSections) {
					soloSection.type = eventTypes.starPower // GH1 and GH2 star power
				}
				for (const starPowerSection of starPowerSections) {
					starPowerSection.type = eventTypes.rejectedStarPower // These should not exist; later this is used to generate issues
				}
			}
		}
	}
	return events
}

function fixFlexLaneLds(events: { [key in Difficulty]: MidiTrackEvent[] }) {
	_.remove(
		events['easy'],
		e => (e.type === eventTypes.flexLaneSingle || e.type === eventTypes.flexLaneDouble) && (e.velocity < 21 || e.velocity > 30),
	)
	_.remove(
		events['medium'],
		e => (e.type === eventTypes.flexLaneSingle || e.type === eventTypes.flexLaneDouble) && (e.velocity < 21 || e.velocity > 40),
	)
	_.remove(
		events['hard'],
		e => (e.type === eventTypes.flexLaneSingle || e.type === eventTypes.flexLaneDouble) && (e.velocity < 21 || e.velocity > 50),
	)

	return events
}

/**
 * Extracts vocal phrase boundaries from MIDI notes 105 and 106 on the PART VOCALS track.
 * These notes define phrase regions as note-on/note-off pairs.
 */
function getVocalPhrases(trackEvents: MidiEvent[]): { tick: number; length: number }[] {
	const phraseStarts: Map<number, number> = new Map() // noteNumber -> startTick
	const phrases: { tick: number; length: number }[] = []

	for (const event of trackEvents) {
		if (event.type === 'noteOn' && (event.noteNumber === 105 || event.noteNumber === 106)) {
			if (event.velocity > 0) {
				phraseStarts.set(event.noteNumber, event.deltaTime)
			} else {
				// velocity 0 noteOn = noteOff
				const startTick = phraseStarts.get(event.noteNumber)
				if (startTick !== undefined) {
					phrases.push({ tick: startTick, length: event.deltaTime - startTick })
					phraseStarts.delete(event.noteNumber)
				}
			}
		} else if (event.type === 'noteOff' && (event.noteNumber === 105 || event.noteNumber === 106)) {
			const startTick = phraseStarts.get(event.noteNumber)
			if (startTick !== undefined) {
				phrases.push({ tick: startTick, length: event.deltaTime - startTick })
				phraseStarts.delete(event.noteNumber)
			}
		}
	}

	return _.sortBy(phrases, 'tick')
}
