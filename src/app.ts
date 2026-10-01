import { ApiError, sing, writeLyrics } from "./api.js";
import { beginAuthorization, completeAuthorization, isSignedIn } from "./auth.js";
import { MAX_NOTES_CHARS, STYLES, styleById } from "./config.js";
import { button, clear, h, on } from "./dom.js";
import {
    LYRICS_SYSTEM,
    buildQuiz,
    drop,
    gradeLine,
    gradeQuiz,
    lyricsRequest,
    parsePlaylist,
    parseSong,
    songPrompt,
    upsert,
    type QuizLine,
    type Saved,
    type Song,
} from "./song.js";

type Screen = "compose" | "song" | "quiz" | "playlist";

const PLAYLIST_KEY = "earworm.playlist";

let screen: Screen = "compose";
let notes = "";
let styleId = STYLES[0].id;
let song: Song | null = null;
let audioUrl = "";
let saved: Saved[] = [];
let quiz: QuizLine[] = [];
let answers: string[] = [];
let checked = false;
let notice = "";
let busy = false;
let busyLabel = "";
let errorMessage = "";
/** Bumped every time an action lands, so a test can wait for the real end. */
let settled = 0;

const root = () => document.getElementById("app") as HTMLElement;

const messageOf = (error: unknown): string =>
    error instanceof ApiError ? error.message : "Something went wrong. Try again.";

const stage = (label: string): void => {
    busyLabel = label;
    render();
};

const run = async (label: string, work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    busy = true;
    busyLabel = label;
    errorMessage = "";
    notice = "";
    render();
    try {
        await work();
    } catch (error) {
        errorMessage = messageOf(error);
    } finally {
        busy = false;
        busyLabel = "";
        settled += 1;
        render();
    }
};

const release = (url: string) => {
    if (audioUrl && audioUrl !== url) URL.revokeObjectURL(audioUrl);
    audioUrl = url;
};

const loadPlaylist = () => {
    saved = parsePlaylist(localStorage.getItem(PLAYLIST_KEY));
};

const persist = () => {
    try {
        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(saved));
    } catch {
        /* out of quota — the playlist simply does not survive this visit */
    }
};

/* ---------------------------------------------------------------- the work */

const perform = async (): Promise<void> => {
    if (!song) throw new ApiError("There is no song to sing yet.");
    stage("Singing it — about 20 seconds…");
    release(await sing(songPrompt(song, styleById(styleId).suffix)));
};

/** Notes in, lyrics out, then straight into the song. */
const compose = async (): Promise<void> => {
    stage("Writing your lyrics…");
    const draft = parseSong(await writeLyrics(LYRICS_SYSTEM, lyricsRequest(notes)));
    if (!draft) throw new ApiError("That did not come back as a song. Try again.");
    song = draft;
    await perform();
    screen = "song";
};

/* --------------------------------------------------------------- commands */

const start = () => {
    const text = notes.trim();
    if (!text) {
        errorMessage = "Paste what you want to remember.";
        render();
        return;
    }
    if (text.length > MAX_NOTES_CHARS) {
        errorMessage = `Notes are limited to ${MAX_NOTES_CHARS} characters — trim them down.`;
        render();
        return;
    }
    notes = text;
    return run("Writing your lyrics…", compose);
};

/** Same words, new arrangement. Cheap, and often the better take. */
const restyle = (id: string) => {
    styleId = id;
    return run("Singing it in that style…", perform);
};

const rewrite = () => run("Writing new lyrics…", compose);

const toQuiz = () => {
    if (!song) return;
    quiz = buildQuiz(song);
    answers = quiz.map(() => "");
    checked = false;
    errorMessage = "";
    notice = "";
    screen = "quiz";
    render();
};

const check = () => {
    checked = true;
    render();
};

const retry = () => {
    answers = quiz.map(() => "");
    checked = false;
    render();
};

const keep = () => {
    if (!song) return;
    saved = upsert(saved, {
        id: crypto.randomUUID(),
        title: song.title,
        lines: song.lines,
        keyWords: song.keyWords,
        styleId,
    });
    persist();
    notice = "Saved to your playlist.";
    render();
};

const openPlaylist = () => {
    screen = "playlist";
    errorMessage = "";
    notice = "";
    render();
};

const singSaved = (entry: Saved) => {
    song = { title: entry.title, lines: entry.lines, keyWords: entry.keyWords };
    styleId = entry.styleId;
    screen = "song";
    return run("Singing it…", perform);
};

const forget = (id: string) => {
    saved = drop(saved, id);
    persist();
    render();
};

const newSong = () => {
    song = null;
    release("");
    screen = "compose";
    errorMessage = "";
    notice = "";
    render();
};

const backToSong = () => {
    screen = "song";
    errorMessage = "";
    render();
};

/* ------------------------------------------------------------------ chrome */

const footer = () =>
    h(
        "footer",
        { class: "foot" },
        h(
            "p",
            {},
            "Powered by ",
            h("a", {
                href: "https://pollinations.ai",
                target: "_blank",
                rel: "noreferrer",
                text: "Pollinations",
            }),
            " · ",
            h("a", {
                href: "https://gen.pollinations.ai/docs",
                target: "_blank",
                rel: "noreferrer",
                text: "API docs",
            }),
            " · ",
            h("a", {
                href: "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md",
                target: "_blank",
                rel: "noreferrer",
                text: "Bring your own Pollen",
            }),
        ),
    );

const heading = (title: string, sub: string) =>
    h(
        "header",
        { class: "head" },
        h("p", { class: "mark", text: "Earworm" }),
        h("h1", { text: title }),
        h("p", { class: "sub", text: sub }),
    );

const shell = (...nodes: (Node | null | false | undefined)[]) => {
    const node = root();
    clear(node);
    node.dataset.busy = String(busy);
    node.dataset.settled = String(settled);
    for (const child of nodes) if (child) node.appendChild(child);
    if (busy) node.appendChild(h("p", { class: "busy", text: busyLabel, role: "status" }));
    if (errorMessage) {
        node.appendChild(h("div", { id: "error", class: "error", text: errorMessage }));
    }
    node.appendChild(footer());
};

const signInBlock = () =>
    isSignedIn()
        ? h("p", { class: "signed", text: "Signed in — this song runs on your Pollen." })
        : button("Sign in with your Pollen", () => void beginAuthorization(), "ghost");

const chipRow = (
    items: readonly { id: string; name: string }[],
    current: string,
    label: string,
    pick: (id: string) => void,
) =>
    h(
        "div",
        { class: "chips", role: "group", "aria-label": label },
        ...items.map((item) =>
            on(
                h("button", {
                    class: `chip${item.id === current ? " picked" : ""}`,
                    type: "button",
                    disabled: busy,
                    "aria-pressed": String(item.id === current),
                    text: item.name,
                }),
                "click",
                () => pick(item.id),
            ),
        ),
    );

const player = () =>
    audioUrl
        ? h("audio", { id: "player", class: "player", controls: true, preload: "auto", src: audioUrl })
        : h("p", { class: "fine", text: "No take has been recorded yet." });

/* --------------------------------------------------------------- screens */

const renderCompose = () =>
    shell(
        heading(
            "Turn your notes into an earworm.",
            `Paste what you have to remember, choose how it should sound, and Earworm writes the lyrics and sings them — a 30-second track you can play on the way to the exam.`,
        ),
        h(
            "section",
            { class: "card" },
            signInBlock(),
            h(
                "label",
                { class: "field", for: "notes" },
                h("span", { text: "What do you have to remember?" }),
                h("textarea", {
                    id: "notes",
                    class: "notes",
                    rows: "7",
                    placeholder:
                        "Mitochondria are the powerhouse of the cell. ATP carries energy. Ribosomes build proteins. Golgi packs and ships them.",
                    text: notes,
                    oninput: (event: Event) => {
                        notes = (event.target as HTMLTextAreaElement).value;
                    },
                }),
            ),
            h(
                "div",
                { class: "block" },
                h("p", { class: "legend", text: "How should it go?" }),
                chipRow(STYLES, styleId, "Musical style", (id) => {
                    styleId = id;
                    render();
                }),
            ),
            button("Write me a song", () => void start(), "primary", busy),
            saved.length > 0 ? button("Your playlist", openPlaylist, "ghost", busy) : null,
            h("p", {
                class: "fine",
                text: `${MAX_NOTES_CHARS} characters of notes, one 30-second track, sung on your own Pollen.`,
            }),
        ),
    );

const lyricList = (song: Song) =>
    h(
        "div",
        { class: "lyrics" },
        ...song.lines.map((line) => h("p", { class: "lyric", text: line })),
    );

const renderSong = () => {
    const active = song;
    if (!active) return;

    shell(
        heading(
            active.title,
            `${styleById(styleId).name} · ${active.lines.length} lines · ${active.keyWords.length} terms to remember`,
        ),
        h("section", { class: "card" }, player(), lyricList(active)),
        h(
            "div",
            { class: "block" },
            h("p", { class: "legend", text: "Sing it another way:" }),
            chipRow(STYLES, styleId, "Musical style", (id) => void restyle(id)),
        ),
        h(
            "div",
            { class: "tools" },
            button("Quiz me", toQuiz, "primary", busy),
            button("Add to playlist", keep, "ghost", busy),
            button("Rewrite the lyrics", () => void rewrite(), "ghost", busy),
            button("New song", newSong, "ghost", busy),
        ),
        notice ? h("p", { class: "notice", text: notice }) : null,
        notice ? button("Open playlist", openPlaylist, "ghost", busy) : null,
        !isSignedIn() ? signInBlock() : null,
    );
};

const quizRow = (line: QuizLine, index: number) => {
    const answer = line.answer;
    if (answer === null) return h("p", { class: "qline plain", text: line.text });
    const given = answers[index] ?? "";
    const right = gradeLine(line, given);
    return h(
        "div",
        { class: `qline${checked ? (right ? " right" : " wrong") : ""}` },
        h("span", { class: "qtext", text: line.text }),
        h("input", {
            class: "qinput",
            type: "text",
            value: given,
            placeholder: "missing word",
            autocomplete: "off",
            spellcheck: false,
            disabled: checked || busy,
            "aria-label": `Missing word in: ${line.text}`,
            oninput: (event: Event) => {
                answers[index] = (event.target as HTMLInputElement).value;
            },
        }),
        checked
            ? h("span", {
                  class: right ? "verdict ok" : "verdict no",
                  "data-answer": answer,
                  text: right ? "right" : `it was: ${answer}`,
              })
            : null,
    );
};

const renderQuiz = () => {
    const active = song;
    if (!active) return;
    const blanks = quiz.filter((line) => line.answer !== null).length;
    const result = gradeQuiz(quiz, answers);

    shell(
        heading(
            "Fill in what you heard.",
            checked
                ? `${result.correct} of ${result.total} right · ${active.title}`
                : `${blanks} words are missing from ${active.title}`,
        ),
        h(
            "section",
            { class: "card" },
            player(),
            h("div", { class: "quiz" }, ...quiz.map(quizRow)),
        ),
        checked
            ? h("p", {
                  class: "score",
                  text:
                      result.total > 0 && result.correct === result.total
                          ? `All ${result.total} right. Play it once more to lock it in.`
                          : `${result.correct} of ${result.total} right.`,
              })
            : null,
        h(
            "div",
            { class: "tools" },
            !checked ? button("Check", check, "primary", busy) : button("Try again", retry, "primary", busy),
            button("Back to the song", backToSong, "ghost", busy),
        ),
    );
};

const renderPlaylist = () =>
    shell(
        heading(
            "Your study playlist.",
            saved.length === 0
                ? "Nothing saved yet."
                : `${saved.length} song${saved.length === 1 ? "" : "s"} · tap one to hear it again`,
        ),
        h(
            "section",
            { class: "card" },
            ...saved.map((entry) =>
                h(
                    "article",
                    { class: "saved" },
                    h("div", { class: "savedbody" },
                        h("p", { class: "savedtitle", text: entry.title }),
                        h("p", {
                            class: "savedmeta",
                            text: `${styleById(entry.styleId).name} · ${entry.lines.length} lines`,
                        }),
                    ),
                    h(
                        "div",
                        { class: "savedtools" },
                        button("Play", () => void singSaved(entry), "primary", busy),
                        button("Remove", () => forget(entry.id), "ghost", busy),
                    ),
                ),
            ),
            saved.length === 0 ? h("p", { class: "fine", text: "Write a song, then add it here." }) : null,
        ),
        h(
            "div",
            { class: "tools" },
            button("New song", newSong, "primary", busy),
        ),
    );

export const render = () => {
    // A screen that needs a song cannot outlive it.
    if ((screen === "song" || screen === "quiz") && !song) screen = "compose";
    if (screen === "song") renderSong();
    else if (screen === "quiz") renderQuiz();
    else if (screen === "playlist") renderPlaylist();
    else renderCompose();
};

/** Load, finish any sign-in round trip, then draw the first screen. */
export const boot = async (): Promise<void> => {
    loadPlaylist();
    try {
        await completeAuthorization();
    } catch (error) {
        errorMessage = messageOf(error);
    }
    render();
};
