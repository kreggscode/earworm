import { getToken } from "./auth.js";
import { GEN_BASE, SONG_MODEL, TEXT_MODEL, TRANSCRIBE_MODEL } from "./config.js";

export class ApiError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

const authorized = (): Record<string, string> => {
    const token = getToken();
    if (!token) throw new ApiError("Sign in with your Pollen to let Earworm sing.", 401);
    return { Authorization: `Bearer ${token}` };
};

/** Servers answer with JSON, plain text or nothing at all — read whichever. */
const describe = async (response: Response): Promise<string> => {
    try {
        const text = await response.text();
        if (text) {
            try {
                const body = JSON.parse(text) as { error?: unknown };
                const error = body.error;
                if (typeof error === "string" && error) return error;
                if (typeof error === "object" && error !== null) {
                    const message = (error as { message?: unknown }).message;
                    if (typeof message === "string" && message) return message;
                }
            } catch {
                /* not JSON — show what came back */
            }
            return text.slice(0, 240);
        }
    } catch {
        /* unreadable body — fall through to the status line */
    }
    return `Pollinations responded with ${response.status}.`;
};

/**
 * Ask the text model for lyrics. The system prompt demands bare JSON and
 * `parseSong` validates whatever arrives, so a rambling reply simply reads as
 * "not a song" and the player can ask again.
 */
export const writeLyrics = async (system: string, user: string): Promise<string> => {
    const response = await fetch(`${GEN_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { ...authorized(), "Content-Type": "application/json" },
        body: JSON.stringify({
            model: TEXT_MODEL,
            temperature: 0.7,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        }),
    });
    if (!response.ok) throw new ApiError(await describe(response), response.status);

    const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
        throw new ApiError("No song could be written from that. Try again.");
    }
    return content;
};

/**
 * Sing the lyrics. One fixed 30-second MP3 comes back as a blob.
 */
export const singBlob = async (prompt: string): Promise<Blob> => {
    const response = await fetch(`${GEN_BASE}/v1/audio/speech`, {
        method: "POST",
        headers: { ...authorized(), "Content-Type": "application/json" },
        body: JSON.stringify({
            model: SONG_MODEL,
            input: prompt,
            response_format: "mp3",
        }),
    });
    if (!response.ok) throw new ApiError(await describe(response), response.status);

    const blob = await response.blob();
    // A 30-second MP3 is hundreds of kilobytes; an error body is not audio.
    if (!blob.type.startsWith("audio") || blob.size < 1_000) {
        throw new ApiError("No audio came back. Sing it again.");
    }
    return blob;
};

/**
 * The same take, as something an `<audio>` tag can play. The caller owns the
 * object URL and has to revoke it when the song changes.
 */
export const sing = async (prompt: string): Promise<string> =>
    URL.createObjectURL(await singBlob(prompt));

/**
 * Read a finished song back. The whole app rests on the model singing the
 * words it was given, so this is how the test suite proves it did.
 */
export const transcribe = async (audio: Blob): Promise<string> => {
    const form = new FormData();
    form.append("file", audio, "song.mp3");
    form.append("model", TRANSCRIBE_MODEL);

    // The browser has to set the multipart boundary itself.
    const response = await fetch(`${GEN_BASE}/v1/audio/transcriptions`, {
        method: "POST",
        headers: authorized(),
        body: form,
    });
    if (!response.ok) throw new ApiError(await describe(response), response.status);

    const payload = (await response.json()) as { text?: unknown };
    if (typeof payload.text !== "string" || !payload.text.trim()) {
        throw new ApiError("The song could not be read back. Sing it again.");
    }
    return payload.text;
};
