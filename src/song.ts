import {
    MAX_KEYWORDS,
    MAX_LINES,
    MAX_SAVED,
    MIN_KEYWORDS,
    MIN_LINES,
} from "./config.js";

/**
 * A song is just the material a study aid needs: the words that will be sung,
 * and the terms the learner is meant to walk away knowing.
 */
export type Song = {
    title: string;
    lines: string[];
    keyWords: string[];
};

export type Saved = {
    id: string;
    title: string;
    lines: string[];
    keyWords: string[];
    styleId: string;
};

export const LYRICS_SYSTEM = `You write memorable study songs.

Reply with ONLY a JSON object, no prose and no code fences:
{"title":"short song title, under 6 words","lines":["line 1", ...],"keyWords":["term to remember", ...]}

Rules:
- ${MIN_LINES} to ${MAX_LINES} short lines. They should rhyme where that falls naturally.
- The lines must say what the learner's notes say. Never invent a fact that is not in them.
- keyWords lists ${MIN_KEYWORDS} to ${MAX_KEYWORDS} of the most important terms.
- Every keyWord must appear in the lines, spelled the same way (capitalisation may differ).
- Put at most one keyWord in any single line, and never repeat a keyWord.
- Plain words only: no stage directions, no chord symbols, no bracketed asides, no line numbers.`;

export const lyricsRequest = (notes: string): string =>
    `Notes:\n${notes.trim()}\n\nWrite a song that makes these notes memorable.`;

const isStringArray = (value: unknown, min: number, max: number): value is string[] =>
    Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0);

/** Pull the JSON object out of a reply that may be fenced or lead-in prose. */
export const extractJson = (raw: string): string | null => {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return candidate.slice(start, end + 1);
};

export const parseSong = (raw: string): Song | null => {
    const json = extractJson(raw);
    if (!json) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const { title, lines, keyWords } = parsed as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim()) return null;
    if (!isStringArray(lines, MIN_LINES, MAX_LINES)) return null;
    if (!isStringArray(keyWords, MIN_KEYWORDS, MAX_KEYWORDS)) return null;

    const cleaned = lines.map((line) => line.trim()).filter(Boolean);
    const terms = [...new Set(keyWords.map((word) => word.trim()).filter(Boolean))];
    if (terms.length < MIN_KEYWORDS) return null;

    // A term the song never says cannot be tested. Drop it rather than throw
    // away a perfectly good song because the model abbreviated one word.
    const body = cleaned.join("\n").toLowerCase();
    const tested = terms.filter((word) => body.includes(word.toLowerCase()));
    if (tested.length < MIN_KEYWORDS) return null;

    return { title: title.trim(), lines: cleaned, keyWords: tested };
};

/** The lyrics, shaped for a music model that takes one continuous prompt. */
export const songPrompt = (song: Song, suffix: string): string =>
    `${suffix}, singing exactly these lyrics:\n${song.lines.join("\n")}`;

export type QuizLine = {
    /** The line as shown, with the target word replaced by underscores. */
    text: string;
    /** What belongs in the blank, or null when the line has no target. */
    answer: string | null;
};

const escapeRegex = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Blank the term out of the line it appears in. Longest terms first so
 * "cell membrane" is not cut down to "cell" by a shorter sibling.
 */
export const buildQuiz = (song: Song): QuizLine[] => {
    const ordered = [...song.keyWords].sort((a, b) => b.length - a.length);
    return song.lines.map((line) => {
        for (const term of ordered) {
            const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
            const match = line.match(pattern);
            if (match) return { text: line.replace(pattern, "_____"), answer: match[0] };
        }
        return { text: line, answer: null };
    });
};

const normalise = (text: string): string =>
    text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?'"`]+$/g, "");

export const gradeLine = (line: QuizLine, given: string): boolean =>
    line.answer === null || normalise(given) === normalise(line.answer);

export type QuizResult = { correct: number; total: number };

export const gradeQuiz = (lines: QuizLine[], given: string[]): QuizResult => {
    let correct = 0;
    let total = 0;
    lines.forEach((line, index) => {
        if (line.answer === null) return;
        total += 1;
        if (gradeLine(line, given[index] ?? "")) correct += 1;
    });
    return { correct, total };
};

const isSaved = (value: unknown): value is Saved => {
    if (typeof value !== "object" || value === null) return false;
    const entry = value as Record<string, unknown>;
    return (
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        typeof entry.styleId === "string" &&
        Array.isArray(entry.lines) &&
        entry.lines.length > 0 &&
        entry.lines.every((line) => typeof line === "string")
    );
};

export const parsePlaylist = (raw: string | null): Saved[] => {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isSaved).slice(0, MAX_SAVED);
    } catch {
        return [];
    }
};

/** Newest first, no duplicates, and never more than the cap allows. */
export const upsert = (list: Saved[], entry: Saved): Saved[] =>
    [entry, ...list.filter((saved) => saved.id !== entry.id)].slice(0, MAX_SAVED);

export const drop = (list: Saved[], id: string): Saved[] =>
    list.filter((saved) => saved.id !== id);
