import { Difficulty, Instrument } from 'src/interfaces'
import { ObjectValues } from 'src/utils'

// ---------------------------------------------------------------------------
// MoonSong-aligned types (plan 0029)
// ---------------------------------------------------------------------------

// Match MoonInstrument (20 values)
export type MoonInstrument = (typeof moonInstruments)[number]
export const moonInstruments = [
	'guitar', 'guitarcoop', 'bass', 'rhythm', 'keys', 'drums',
	'guitarghl', 'bassghl', 'rhythmghl', 'guitarcoopghl',
	'proguitar17', 'proguitar22', 'probass17', 'probass22',
	'prokeys', 'vocals', 'harmony1', 'harmony2', 'harmony3',
	'elitedrums',
] as const

// Match MoonChart.GameMode (7 values — determines rawNote interpretation)
export type GameMode = (typeof gameModes)[number]
export const gameModes = [
	'guitar', 'drums', 'ghlguitar', 'proguitar', 'prokeys', 'vocals', 'elitedrums',
] as const

/** Map instrument to its gameMode. */
export function getGameMode(instrument: MoonInstrument): GameMode {
	switch (instrument) {
		case 'guitar': case 'guitarcoop': case 'bass': case 'rhythm': case 'keys':
			return 'guitar'
		case 'drums':
			return 'drums'
		case 'guitarghl': case 'bassghl': case 'rhythmghl': case 'guitarcoopghl':
			return 'ghlguitar'
		case 'proguitar17': case 'proguitar22': case 'probass17': case 'probass22':
			return 'proguitar'
		case 'prokeys':
			return 'prokeys'
		case 'vocals': case 'harmony1': case 'harmony2': case 'harmony3':
			return 'vocals'
		case 'elitedrums':
			return 'elitedrums'
	}
}

// Match MoonNote.Flags — same bit positions as YARG.Core
export type MoonNoteFlag = ObjectValues<typeof moonNoteFlags>
export const moonNoteFlags = {
	none: 0,
	forced: 1 << 0,
	forcedStrum: 1 << 1,
	forcedHopo: 1 << 2,
	tap: 1 << 3,
	proDrumsCymbal: 1 << 4,
	proDrumsAccent: 1 << 5,
	proDrumsGhost: 1 << 6,
	doubleKick: 1 << 7,
	proGuitarMuted: 1 << 8,
	vocalsPercussion: 1 << 9,
	eliteDrumsFlam: 1 << 10,
	eliteDrumsForcedIndifferent: 1 << 11,
	eliteDrumsForcedClosed: 1 << 12,
	eliteDrumsSplash: 1 << 13,
	eliteDrumsInvisibleTerminator: 1 << 14,
	eliteDrumsStrictHatState: 1 << 15,
	eliteDrumsChannelFlagRed: 1 << 16,
	eliteDrumsChannelFlagYellow: 1 << 17,
	eliteDrumsChannelFlagBlue: 1 << 18,
	eliteDrumsChannelFlagGreen: 1 << 19,
} as const

// Match MoonPhrase.Type
export type PhraseType = ObjectValues<typeof phraseTypes>
export const phraseTypes = {
	starpower: 0,
	solo: 1,
	versusPlayer1: 2,
	versusPlayer2: 3,
	tremoloLane: 4,
	trillLane: 5,
	proDrumsActivation: 6,
	vocalsScoringPhrase: 7,
	vocalsStaticLyricPhrase: 8,
	vocalsPercussionPhrase: 9,
	vocalsRangeShift: 10,
	vocalsLyricShift: 11,
	proKeysRangeShift0: 12,
	proKeysRangeShift1: 13,
	proKeysRangeShift2: 14,
	proKeysRangeShift3: 15,
	proKeysRangeShift4: 16,
	proKeysRangeShift5: 17,
	proKeysGlissando: 18,
	eliteDrumsRightCrashLane: 19,
	eliteDrumsRideLane: 20,
	eliteDrumsTom3Lane: 21,
	eliteDrumsTom2Lane: 22,
	eliteDrumsTom1Lane: 23,
	eliteDrumsLeftCrashLane: 24,
	eliteDrumsHiHatLane: 25,
	eliteDrumsSnareLane: 26,
	eliteDrumsKickLane: 27,
	eliteDrumsHatPedalLane: 28,
	eliteDrumsDiscoFlip: 29,
} as const

/** MoonSong-aligned per-track structure. One entry per instrument × difficulty. */
export interface MoonTrack {
	instrument: MoonInstrument
	difficulty: Difficulty
	gameMode: GameMode

	/** One Note per note. Flags (forced, tap, cymbal, etc.) are ON the note. */
	notes: MoonNote[]

	/** Unified typed phrase array (starpower, solo, activation, etc.). */
	phrases: MoonPhrase[]

	/** Per-track text events (disco flip, MIDI text events in instrument tracks). */
	textEvents: { tick: number; text: string }[]

	/** Animation events from MIDI. Empty for .chart. */
	animations: { tick: number; text: string }[]
}

/** MoonSong-aligned note. rawNote is instrument-dependent (see MoonNote docs). */
export interface MoonNote {
	tick: number
	/** Instrument-dependent: GuitarFret, DrumPad, GHLiveGuitarFret, etc. */
	rawNote: number
	/** Sustain length in ticks. */
	length: number
	/** Bitmask of moonNoteFlags. */
	flags: number
}

/** MoonSong-aligned phrase (starpower, solo, activation lane, etc.). */
export interface MoonPhrase {
	tick: number
	length: number
	type: PhraseType
}

// ---------------------------------------------------------------------------
// Original types (kept for backwards compatibility during migration)
// ---------------------------------------------------------------------------

export interface IniChartModifiers {
	song_length: number
	hopo_frequency: number
	eighthnote_hopo: boolean
	multiplier_note: number
	sustain_cutoff_threshold: number
	chord_snap_threshold: number
	five_lane_drums: boolean
	pro_drums: boolean
}

export const defaultIniChartModifiers = {
	song_length: 0,
	hopo_frequency: 0,
	eighthnote_hopo: false,
	multiplier_note: 0,
	sustain_cutoff_threshold: -1,
	chord_snap_threshold: 0,
	five_lane_drums: false,
	pro_drums: false,
}

/**
 * This is the common format that both .mid and .chart parsers target, and is used by `parseChart()` to generate `ChartData`.
 *
 * The intention is that the .mid and .chart parsers do as little processing of the data as possible so that the shared
 * functionality can all happen in `parseChart()`. This means that "invalid" event configurations can exist in this data, such as:
 * - modifiers and phrases that contain zero notes
 * - multiple events of the same type on the same tick
 * - overlapping events of the same type
 * - drum tracks containing both 5-lane green and tom/cymbal modifiers
 */
export interface RawChartData {
	chartTicksPerBeat: number

	// ── MoonSong-aligned fields (plan 0029) ──

	/** MoonSong-aligned per-track data. One entry per non-empty instrument × difficulty. */
	tracks?: MoonTrack[]

	/** Global text events from [Events] / EVENTS track — NOT sections or end events. */
	globalEvents?: { tick: number; text: string }[]

	/** Venue events from MIDI VENUE track. */
	venue?: { tick: number; text: string; type: string; length: number }[]

	// ── End MoonSong-aligned fields ──
	/** Line ending style of the source .chart file. Only set for .chart files. */
	lineEnding?: '\r\n' | '\n'
	/** Whether the source .chart file had a UTF-8 BOM (EF BB BF). */
	hasBom?: boolean
	/**
	 * Complete raw text of the source .chart file. Used by the writer for
	 * byte-level roundtrip when no edits have been made. Enables perfect
	 * preservation of inter-section whitespace, malformed lines, and any
	 * formatting quirks that individual passthrough fields can't capture.
	 */
	rawChartText?: string
	/** Whether the source .chart file had a trailing newline after the last }. */
	hasTrailingNewline?: boolean
	metadata: ChartMetadata
	hasLyrics: boolean
	hasVocals: boolean
	lyrics: {
		tick: number
		length: number
		text: string
	}[]
	/** Vocal phrase boundaries from MIDI notes 105/106 or .chart phrase_start/phrase_end events. */
	vocalPhrases: {
		tick: number
		/** Number of ticks */
		length: number
	}[]
	tempos: {
		tick: number
		/** double, rounded to 12 decimal places */
		beatsPerMinute: number
	}[]
	timeSignatures: {
		tick: number
		numerator: number
		denominator: number
		/** MIDI clocks per metronome tick. Only from MIDI files. Default 24. */
		metronome?: number
		/** 32nd notes per MIDI quarter note. Only from MIDI files. Default 8. */
		thirtyseconds?: number
	}[]
	sections: {
		tick: number
		name: string
	}[]
	endEvents: {
		tick: number
	}[]
	trackData: {
		instrument: Instrument
		difficulty: Difficulty
		starPowerSections: {
			tick: number
			/** Number of ticks */
			length: number
		}[]
		/** related to multiplier_note */
		rejectedStarPowerSections: {
			tick: number
			/** Number of ticks */
			length: number
		}[]
		soloSections: {
			tick: number
			/** Number of ticks */
			length: number
		}[]
		flexLanes: {
			tick: number
			/** Number of ticks */
			length: number
			isDouble: boolean
		}[]
		drumFreestyleSections: {
			tick: number
			/** Number of ticks */
			length: number
			/** If the freestyle section is a big rock ending instead of an activation lane */
			isCoda: boolean
		}[]
		/** Only contains notes and note modifiers. */
		trackEvents: {
			tick: number
			/**
			 * Number of ticks. For modifiers, this should be zero. In .mid, modifiers do have length,
			 * but the .mid parser normalizes this by inserting a zero-length modifier for every
			 * note that it applies to. (chords count as one note in this context)
			 */
			length: number
			type: EventType
		}[]
	}[]

	/**
	 * Raw key-value pairs from the .chart [Song] section, preserving original
	 * field order and unknown fields (Player2, MediaType, etc.) that aren't
	 * parsed into metadata. Used by the .chart writer for roundtrip fidelity.
	 * Only populated when parsing .chart files.
	 */
	chartSongSection?: Array<{ key: string; value: string }>
	/** Raw lines from the .chart [Song] section with original indentation. */
	chartSongLines?: string[]

	/**
	 * Raw lines from the .chart [Events] section, preserving original event
	 * order and any events that aren't parsed into sections/lyrics/vocalPhrases.
	 * Used by the .chart writer for byte-level roundtrip fidelity.
	 * Only populated when parsing .chart files.
	 */
	chartEventsSection?: string[]

	/**
	 * Raw lines from the .chart [SyncTrack] section, preserving original
	 * TS/B ordering. Used by the .chart writer for byte-level roundtrip fidelity.
	 * Only populated when parsing .chart files.
	 */
	chartSyncTrackSection?: string[]

	/**
	 * Raw lines for each .chart track section, preserving original event order
	 * and unknown event types. Keyed by section name (e.g. "ExpertSingle").
	 * Used by the .chart writer for byte-level roundtrip fidelity.
	 * Only populated when parsing .chart files.
	 */
	chartTrackSections?: Record<string, string[]>

	/**
	 * Original MIDI track name ordering (including track 0).
	 * Used by the MIDI writer to preserve track order for byte-level roundtrip.
	 * Only populated when parsing .mid files.
	 */
	midiTrackOrder?: string[]

	/**
	 * Raw MIDI tempo track (track 0) events in delta-time format.
	 * Preserved verbatim so the MIDI writer can emit the original tempo track
	 * with its original event ordering. Only populated when parsing .mid files.
	 */
	midiTempoTrack?: MidiEvent[]

	/**
	 * Raw MIDI instrument track events in delta-time format, keyed by track name.
	 * Preserved so the MIDI writer can emit complete tracks (including events
	 * scan-chart doesn't model like animations, practice markers, etc.) for
	 * byte-level roundtrip fidelity. Only populated when parsing .mid files.
	 * Cleared when track data is edited to prevent stale passthrough.
	 */
	midiInstrumentTracks?: Record<string, MidiEvent[]>

	/**
	 * MIDI tracks whose names aren't recognized by the parser.
	 * Preserved verbatim so the MIDI writer can emit them for roundtrip fidelity.
	 * Only populated when parsing .mid files.
	 */
	unknownMidiTracks?: Array<{ name: string; events: MidiEvent[] }>

	/**
	 * .chart track sections whose names aren't recognized by the parser.
	 * Preserved verbatim so the .chart writer can emit them for roundtrip fidelity.
	 * Only populated when parsing .chart files.
	 */
	unknownChartSections?: Array<{ name: string; lines: string[] }>
}

export type EventType = ObjectValues<typeof eventTypes>
export const eventTypes = {
	starPower: 0,
	soloSection: 1, // .mid
	rejectedStarPower: 2, // .mid, related to multiplier_note
	soloSectionStart: 3, // .chart
	soloSectionEnd: 4, // .chart

	// 5 fret
	open: 5,
	green: 6,
	red: 7,
	yellow: 8,
	blue: 9,
	orange: 10,

	// 6 fret
	black1: 11,
	black2: 12,
	black3: 13,
	white1: 14,
	white2: 15,
	white3: 16,

	// Drums
	kick: 17,
	kick2x: 18,
	redDrum: 19,
	yellowDrum: 20,
	blueDrum: 21,
	fiveOrangeFourGreenDrum: 22,
	fiveGreenDrum: 23,
	flexLaneSingle: 24,
	flexLaneDouble: 25,
	freestyleSection: 26,

	// Modifiers
	forceOpen: 27, // .mid
	forceTap: 28,
	forceStrum: 29, // .mid
	forceHopo: 30, // .mid
	forceUnnatural: 31, // .chart
	forceFlam: 32,
	yellowTomMarker: 33, // .mid
	blueTomMarker: 34, // .mid
	greenTomMarker: 35, // .mid
	yellowCymbalMarker: 36, // .chart
	blueCymbalMarker: 37, // .chart
	greenCymbalMarker: 38, // .chart
	redGhost: 39,
	yellowGhost: 40,
	blueGhost: 41,
	fiveOrangeFourGreenGhost: 42,
	fiveGreenGhost: 43,
	kickGhost: 44,
	redAccent: 45,
	yellowAccent: 46,
	blueAccent: 47,
	fiveOrangeFourGreenAccent: 48,
	fiveGreenAccent: 49,
	kickAccent: 50,
	discoFlipOff: 51,
	discoFlipOn: 52,
	discoNoFlipOn: 53,

	// Toggle
	enableChartDynamics: 54,
} as const

/** A single event in a chart's track. Note that more than one event can occur at the same time. */
export interface NoteEvent {
	/** The chart tick of this event. */
	tick: number
	msTime: number
	/** Length of the event in ticks. Some events have a length of zero. */
	length: number
	msLength: number
	type: NoteType
	/** bitmask of `NoteFlag`. */
	flags: number
}

/** Note: specific values here are standardized; they are constants used in the track hash calculation. */
export type NoteType = ObjectValues<typeof noteTypes>
export const noteTypes = {
	// 5 fret
	open: 1,
	green: 2,
	red: 3,
	yellow: 4,
	blue: 5,
	orange: 6,

	// 6 fret
	black1: 7,
	black2: 8,
	black3: 9,
	white1: 10,
	white2: 11,
	white3: 12,

	// Drums
	kick: 13,
	redDrum: 14,
	yellowDrum: 15,
	blueDrum: 16,
	greenDrum: 17,
} as const

/** Note: specific values here are standardized; they are constants used in the track hash calculation. */
export const noteFlags = {
	none: 0,
	strum: 1,
	hopo: 2,
	tap: 4,
	doubleKick: 8,
	tom: 16,
	cymbal: 32,
	discoNoflip: 64,
	disco: 128,
	flam: 256,
	ghost: 512,
	accent: 1024,
} as const
