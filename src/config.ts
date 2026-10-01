/** Every endpoint, model and credential the app talks to. */

export const GEN_BASE = "https://gen.pollinations.ai";
export const ENTER_BASE = "https://enter.pollinations.ai";

/**
 * Publishable App Key (`pk_...`) for Bring Your Own Pollen. It identifies the
 * app on the consent screen; the spend is always the player's own Pollen.
 * Overridable at build time so the key never has to live in git history.
 */
export const CLIENT_ID: string =
    (import.meta.env.VITE_POLLINATIONS_CLIENT_ID as string | undefined) ?? "";

/** OAuth redirect target — must match a Redirect URI registered on the App Key. */
export const REDIRECT_URI: string =
    (import.meta.env.VITE_POLLINATIONS_REDIRECT_URI as string | undefined) ??
    (typeof window === "undefined"
        ? ""
        : `${window.location.origin}${window.location.pathname}`);

/**
 * Turns notes into lyrics. Free, and it is the part that has to understand the
 * material rather than perform it.
 */
export const TEXT_MODEL = "openai/gpt-5.4-nano";

/**
 * Sings them. `google/lyria-3-clip-preview` takes lyrics in the prompt and
 * returns one fixed 30-second MP3 with vocals — the words come back verbatim
 * when transcribed, which is the whole point of a study song.
 */
export const SONG_MODEL = "google/lyria-3-clip-preview";

/** Reads a finished song back, so a test can prove the words were sung. */
export const TRANSCRIBE_MODEL = "openai/gpt-transcribe";

/** Notes are pasted, not typed; a paragraph fits, a textbook does not. */
export const MAX_NOTES_CHARS = 1_400;

/** Text replies are one small object; anything longer is a broken reply. */
export const MAX_REPLY_CHARS = 4_000;

/** Long enough to hold a topic, short enough to fit a 30-second chorus. */
export const MIN_LINES = 6;
export const MAX_LINES = 14;

/** The terms worth being quizzed on — enough coverage, not a word search. */
export const MIN_KEYWORDS = 3;
export const MAX_KEYWORDS = 10;

/** A study playlist, not an archive. */
export const MAX_SAVED = 24;

/** How the song sounds. Changing one re-sings the same words. */
export type Style = { id: string; name: string; suffix: string };

export const STYLES: readonly Style[] = [
    {
        id: "bubblegum",
        name: "Bubblegum pop",
        suffix: "bright bubblegum pop, bouncy synth, handclaps, cheerful vocal",
    },
    {
        id: "synth",
        name: "80s synthpop",
        suffix: "1980s synthpop, gated drums, shimmering arpeggios, clear vocal",
    },
    {
        id: "folk",
        name: "Acoustic folk",
        suffix: "warm acoustic folk, strummed guitar, close intimate vocal",
    },
    {
        id: "hiphop",
        name: "Hip hop",
        suffix: "boom bap hip hop, dusty breakbeat, laid-back rhythmic vocal",
    },
    {
        id: "shanty",
        name: "Sea shanty",
        suffix: "rowdy sea shanty, stomping beat, stomping group chorus",
    },
    {
        id: "lullaby",
        name: "Lullaby",
        suffix: "soft lullaby, music box, gentle breathy vocal",
    },
];

export const styleById = (id: string): Style =>
    STYLES.find((style) => style.id === id) ?? STYLES[0];
