import { describe, expect, it } from "vitest";
import { MAX_SAVED } from "./config.js";
import {
    buildQuiz,
    drop,
    extractJson,
    gradeLine,
    gradeQuiz,
    lyricsRequest,
    parsePlaylist,
    parseSong,
    songPrompt,
    upsert,
    LYRICS_SYSTEM,
    type Saved,
    type Song,
} from "./song.js";

const song: Song = {
    title: "The Water Cycle",
    lines: [
        "Evaporation lifts the water high",
        "Condensation gathers in the sky",
        "Precipitation falls as rain or snow",
        "Collection gathers where the rivers flow",
        "Runoff carries everything to sea",
        "Then it starts again for you and me",
    ],
    keyWords: ["evaporation", "condensation", "precipitation"],
};

const validReply = JSON.stringify({
    title: "Cells at Work",
    lines: [
        "Mitochondria power the cell",
        "ATP is the currency we sell",
        "Ribosomes build proteins all day",
        "Golgi packs them and sends them away",
        "Lysosomes break what cells discard",
        "The membrane keeps the inside unharmed",
    ],
    keyWords: ["mitochondria", "ribosomes", "lysosomes"],
});

describe("extractJson", () => {
    it("takes a bare object", () => {
        expect(extractJson('{"a":1}')).toBe('{"a":1}');
    });

    it("takes an object out of a code fence", () => {
        expect(extractJson('Sure!\n```json\n{"a":1}\n```\nDone.')).toBe('{"a":1}');
    });

    it("takes an object out of a lead-in sentence", () => {
        expect(extractJson('Here is your song: {"a":1} — enjoy!')).toBe('{"a":1}');
    });

    it("gives up when there is no object", () => {
        expect(extractJson("I cannot do that.")).toBeNull();
    });
});

describe("parseSong", () => {
    it("reads a well-formed reply", () => {
        const parsed = parseSong(validReply);
        expect(parsed).not.toBeNull();
        expect(parsed?.title).toBe("Cells at Work");
        expect(parsed?.lines).toHaveLength(6);
        expect(parsed?.keyWords).toEqual(["mitochondria", "ribosomes", "lysosomes"]);
    });

    it("reads a reply wrapped in a fence", () => {
        expect(parseSong(`\`\`\`json\n${validReply}\n\`\`\``)).not.toBeNull();
    });

    it("rejects prose with no song in it", () => {
        expect(parseSong("I am afraid I cannot write that.")).toBeNull();
    });

    it("rejects a reply that is not an object", () => {
        expect(parseSong('["a","b","c"]')).toBeNull();
    });

    it("rejects too few lines", () => {
        const short = JSON.parse(validReply) as { lines: string[] };
        short.lines = short.lines.slice(0, 3);
        expect(parseSong(JSON.stringify(short))).toBeNull();
    });

    it("rejects too many keywords", () => {
        const many = JSON.parse(validReply) as { keyWords: string[] };
        many.keyWords = Array.from({ length: 20 }, (_, index) => `term${index}`);
        expect(parseSong(JSON.stringify(many))).toBeNull();
    });

    it("drops a term the song never says, keeping the ones it does", () => {
        const wrong = JSON.parse(validReply) as { keyWords: string[] };
        wrong.keyWords = ["mitochondria", "ribosomes", "lysosomes", "photosynthesis"];
        expect(parseSong(JSON.stringify(wrong))?.keyWords).toEqual([
            "mitochondria",
            "ribosomes",
            "lysosomes",
        ]);
    });

    it("rejects a song with too few testable terms left", () => {
        const wrong = JSON.parse(validReply) as { keyWords: string[] };
        wrong.keyWords = ["mitochondria", "photosynthesis"];
        expect(parseSong(JSON.stringify(wrong))).toBeNull();
    });

    it("keeps the song when the lyrics shortened one of the terms", () => {
        // The notes said "Golgi apparatus"; the line says "Golgi packs".
        const short = JSON.parse(validReply) as { keyWords: string[]; lines: string[] };
        short.lines[3] = "Golgi packs them and sends them away";
        short.keyWords = ["mitochondria", "ribosomes", "lysosomes", "Golgi apparatus"];
        expect(parseSong(JSON.stringify(short))?.keyWords).toEqual([
            "mitochondria",
            "ribosomes",
            "lysosomes",
        ]);
    });

    it("rejects a blank line", () => {
        const blank = JSON.parse(validReply) as { lines: string[] };
        blank.lines[2] = "   ";
        expect(parseSong(JSON.stringify(blank))).toBeNull();
    });

    it("drops duplicate keywords", () => {
        const twice = JSON.parse(validReply) as { keyWords: string[] };
        twice.keyWords = ["mitochondria", "mitochondria", "ribosomes", "lysosomes"];
        expect(parseSong(JSON.stringify(twice))?.keyWords).toHaveLength(3);
    });
});

describe("prompts", () => {
    it("passes the notes through untouched", () => {
        const request = lyricsRequest("  ATP carries energy.  ");
        expect(request).toContain("ATP carries energy.");
        expect(request).not.toContain("  ");
    });

    it("joins the lyrics with newlines under the chosen style", () => {
        const prompt = songPrompt(song, "warm acoustic folk");
        expect(prompt.startsWith("warm acoustic folk, singing exactly these lyrics:")).toBe(true);
        expect(prompt).toContain("Evaporation lifts the water high\nCondensation gathers in the sky");
    });

    it("demands bare JSON from the songwriter", () => {
        expect(LYRICS_SYSTEM).toContain('"title"');
        expect(LYRICS_SYSTEM).toContain("keyWords");
        expect(LYRICS_SYSTEM).toContain("at most one keyWord in any single line");
    });
});

describe("buildQuiz", () => {
    it("blanks the term out of the line it lives in", () => {
        const quiz = buildQuiz(song);
        expect(quiz[0]).toEqual({
            text: "_____ lifts the water high",
            answer: "Evaporation",
        });
        expect(quiz[5]).toEqual({ text: "Then it starts again for you and me", answer: null });
    });

    it("matches without regard to case", () => {
        const shouty: Song = { ...song, lines: ["EVAPORATION lifts the water high"] };
        expect(buildQuiz(shouty)[0].text.startsWith("_____")).toBe(true);
    });

    it("prefers the longer term when one contains another", () => {
        const nested: Song = {
            title: "Membranes",
            lines: ["The cell membrane decides what enters"],
            keyWords: ["cell", "cell membrane"],
        };
        expect(buildQuiz(nested)[0]).toEqual({
            text: "The _____ decides what enters",
            answer: "cell membrane",
        });
    });

    it("keeps the original spelling of the term it blanked", () => {
        const odd: Song = { ...song, lines: ["Condensation gathers in the sky"] };
        expect(buildQuiz(odd)[0].answer).toBe("Condensation");
    });
});

describe("grading", () => {
    const quiz = buildQuiz(song);

    it("accepts the word, however it is capitalised and punctuated", () => {
        expect(gradeLine(quiz[0], "  evaporation! ")).toBe(true);
        expect(gradeLine(quiz[0], "Evaporation")).toBe(true);
    });

    it("rejects a different word", () => {
        expect(gradeLine(quiz[0], "condensation")).toBe(false);
        expect(gradeLine(quiz[0], "")).toBe(false);
    });

    it("passes a line that has nothing to answer", () => {
        expect(gradeLine(quiz[5], "anything at all")).toBe(true);
    });

    it("counts only the lines that were blanked", () => {
        expect(gradeQuiz(quiz, ["evaporation", "condensation", "precipitation", "x", "y", "z"])).toEqual({
            correct: 3,
            total: 3,
        });
        expect(gradeQuiz(quiz, ["evaporation", "wrong", "precipitation", "", "", ""])).toEqual({
            correct: 2,
            total: 3,
        });
    });

    it("scores zero when nothing is answered", () => {
        expect(gradeQuiz(quiz, quiz.map(() => ""))).toEqual({ correct: 0, total: 3 });
    });
});

describe("the playlist", () => {
    const entry = (id: string): Saved => ({
        id,
        title: `Song ${id}`,
        lines: ["one line", "two lines"],
        keyWords: ["line"],
        styleId: "folk",
    });

    it("reads nothing out of an empty slot", () => {
        expect(parsePlaylist(null)).toEqual([]);
        expect(parsePlaylist("")).toEqual([]);
    });

    it("reads nothing out of a corrupt slot", () => {
        expect(parsePlaylist("{not json")).toEqual([]);
        expect(parsePlaylist('{"a":1}')).toEqual([]);
    });

    it("drops entries that are not songs", () => {
        const mixed = JSON.stringify([entry("a"), { id: "b" }, 7, entry("c")]);
        expect(parsePlaylist(mixed).map((saved) => saved.id)).toEqual(["a", "c"]);
    });

    it("puts the newest first and never keeps a song twice", () => {
        const list = upsert(upsert([], entry("a")), entry("b"));
        expect(list.map((saved) => saved.id)).toEqual(["b", "a"]);
        expect(upsert(list, entry("a")).map((saved) => saved.id)).toEqual(["a", "b"]);
    });

    it("stops at the cap", () => {
        let list: Saved[] = [];
        for (let index = 0; index < MAX_SAVED + 10; index += 1) {
            list = upsert(list, entry(`e${index}`));
        }
        expect(list).toHaveLength(MAX_SAVED);
        expect(list[0].id).toBe(`e${MAX_SAVED + 9}`);
    });

    it("forgets one by id and leaves the rest alone", () => {
        const list = upsert(upsert([], entry("a")), entry("b"));
        expect(drop(list, "a").map((saved) => saved.id)).toEqual(["b"]);
        expect(drop(list, "missing")).toHaveLength(2);
    });

    it("survives a round trip through storage", () => {
        const list = [entry("a"), entry("b")];
        expect(parsePlaylist(JSON.stringify(list))).toEqual(list);
    });
});
