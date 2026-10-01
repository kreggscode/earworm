import { beforeAll, describe, expect, it } from "vitest";
import { ApiError, singBlob, transcribe, writeLyrics } from "./api.js";
import { LYRICS_SYSTEM, lyricsRequest, parseSong, songPrompt } from "./song.js";

const KEY = process.env.POLLINATIONS_API_KEY ?? "";

// `auth.ts` reads sessionStorage when a call is made; Node has none.
const store = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
};

const NOTES = [
    "Mitochondria are the powerhouse of the cell.",
    "ATP carries energy around the cell.",
    "Ribosomes build proteins.",
    "Golgi apparatus packs and ships them.",
].join(" ");

beforeAll(() => {
    if (KEY) store.set("earworm.token", KEY);
});

describe.skipIf(!KEY)("a study song, against the live endpoints", () => {
    let lyrics = "";
    let track = "";

    it("turns notes into lyrics a learner can be quizzed on", async () => {
        const reply = await writeLyrics(LYRICS_SYSTEM, lyricsRequest(NOTES));
        lyrics = reply;

        const song = parseSong(reply);
        expect(song).not.toBeNull();
        expect(song!.title.length).toBeGreaterThan(0);
        expect(song!.lines.length).toBeGreaterThanOrEqual(6);
        expect(song!.keyWords.length).toBeGreaterThanOrEqual(3);

        // Every term has to appear in the words that get sung, or it cannot be blanked.
        const body = song!.lines.join("\n").toLowerCase();
        for (const term of song!.keyWords) expect(body).toContain(term.toLowerCase());
    }, 120_000);

    it("sings them into a real audio track", async () => {
        const song = parseSong(lyrics);
        expect(song).not.toBeNull();

        const blob = await singBlob(songPrompt(song!, "bright bubblegum pop"));
        track = blob.type;
        expect(blob.type).toContain("audio");
        // A 30-second MP3 runs to hundreds of kilobytes; an error body does not.
        expect(blob.size).toBeGreaterThan(100_000);
    }, 240_000);

    it("sings the words it was given", async () => {
        const song = parseSong(lyrics);
        const blob = await singBlob(songPrompt(song!, "warm acoustic folk"));

        const heard = await transcribe(blob);
        expect(heard.length).toBeGreaterThan(20);

        // The point of the whole app: the study terms came back out of the song.
        const spoken = heard.toLowerCase();
        const terms = song!.keyWords.filter((term) => spoken.includes(term.toLowerCase()));
        expect(terms.length).toBeGreaterThanOrEqual(2);
        expect(track).toContain("audio");
    }, 240_000);
});

describe("sign-in is required", () => {
    it("raises an ApiError before any request goes out", async () => {
        const previous = store.get("earworm.token");
        store.delete("earworm.token");
        const error = await writeLyrics(LYRICS_SYSTEM, lyricsRequest(NOTES)).catch(
            (caught: unknown) => caught,
        );
        store.set("earworm.token", previous ?? "");
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
        expect((error as ApiError).message).toContain("Sign in with your Pollen");
    });

    it("raises it for the singer too", async () => {
        const previous = store.get("earworm.token");
        store.delete("earworm.token");
        const error = await singBlob("sing something").catch((caught: unknown) => caught);
        store.set("earworm.token", previous ?? "");
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
    });
});
