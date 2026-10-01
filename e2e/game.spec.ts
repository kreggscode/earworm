import { expect, test, type Page } from "@playwright/test";

const API_KEY = process.env.POLLINATIONS_API_KEY ?? "";
const APP = process.env.E2E_BASE_URL || "http://127.0.0.1:4173/earworm/";
const evidence = (name: string) => `evidence/${name}.png`;

const NOTES = [
    "Mitochondria are the powerhouse of the cell.",
    "ATP carries energy around the cell.",
    "Ribosomes build proteins.",
    "Golgi apparatus packs and ships them.",
    "Lysosomes digest worn-out parts.",
].join("\n");

const shot = (page: Page, name: string) =>
    page.screenshot({ path: evidence(name), fullPage: true });

/**
 * Actions land in two steps: the call goes out, then a screen comes back.
 * Wait for the busy line to appear and then clear before touching anything.
 */
const settled = async (page: Page) => {
    await expect(page.locator(".busy")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".busy")).toHaveCount(0, { timeout: 180_000 });
};

const signIn = async (page: Page) => {
    await page.goto(APP);
    await page.evaluate(
        ([key]) => sessionStorage.setItem("earworm.token", key),
        [API_KEY],
    );
    await page.reload();
    await expect(page.getByText("Signed in — this song runs on your Pollen.")).toBeVisible();
};

/** Write a song and wait for both the lyrics and the recording. */
const compose = async (page: Page) => {
    await page.locator("#notes").fill(NOTES);
    await page.getByRole("button", { name: "Write me a song" }).click();
    await settled(page);
    await expect(page.locator("#player")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".lyric")).toHaveCount(6, { timeout: 30_000 });
};

test.beforeEach(() => {
    expect(API_KEY, "set POLLINATIONS_API_KEY to run the live end-to-end test").not.toBe("");
});

test("writes lyrics, sings them, and quizzes on the words", async ({ page }) => {
    await signIn(page);
    await shot(page, "01-compose");

    await page.locator("#notes").fill(NOTES);
    await page.getByRole("button", { name: "Sea shanty" }).click();
    await expect(page.getByRole("button", { name: "Sea shanty" })).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await page.getByRole("button", { name: "Write me a song" }).click();
    await settled(page);

    await expect(page.locator("#player")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".lyric")).toHaveCount(6, { timeout: 30_000 });
    await expect(page.locator(".head .sub")).toContainText("Sea shanty");
    await expect(page.locator(".head .sub")).toContainText("terms to remember");
    await expect(page.locator("#error")).toHaveCount(0);
    await shot(page, "02-song");

    // The recording is a real 30-second track, not a stub.
    const duration = await page.evaluate(
        () =>
            new Promise<number>((resolve) => {
                const audio = document.querySelector("audio");
                if (!audio) return resolve(-1);
                if (audio.readyState >= 1) return resolve(audio.duration);
                audio.addEventListener("loadedmetadata", () => resolve(audio.duration), {
                    once: true,
                });
                audio.addEventListener("error", () => resolve(-1), { once: true });
                setTimeout(() => resolve(-1), 30_000);
            }),
    );
    expect(duration).toBeGreaterThan(25);

    await page.getByRole("button", { name: "Quiz me" }).click();
    const blanks = await page.locator(".qinput").count();
    expect(blanks).toBeGreaterThanOrEqual(3);
    await expect(page.locator(".head .sub")).toContainText("words are missing");
    await shot(page, "03-quiz");

    // Get every answer wrong, and read the one it hands back.
    for (let index = 0; index < blanks; index += 1) {
        await page.locator(".qinput").nth(index).fill("zzz");
    }
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.locator(".score")).toContainText("0 of", { timeout: 30_000 });
    await expect(page.locator(".verdict.no")).toHaveCount(blanks);
    // The reveal publishes the answer, so there is no reading it off the styling.
    const answer = await page.locator(".verdict.no").first().getAttribute("data-answer");
    expect(answer).toBeTruthy();

    // Hand back the word it revealed, and it has to score.
    await page.getByRole("button", { name: "Try again" }).click();
    await page.locator(".qinput").first().fill(answer);
    for (let index = 1; index < blanks; index += 1) {
        await page.locator(".qinput").nth(index).fill("zzz");
    }
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.locator(".score")).toContainText("1 of", { timeout: 30_000 });
    await expect(page.locator(".verdict.ok")).toHaveCount(1);
    await shot(page, "04-quiz-graded");

    await page.getByRole("button", { name: "Back to the song" }).click();
    await page.getByRole("button", { name: "Add to playlist" }).click();
    await expect(page.locator(".notice")).toContainText("Saved to your playlist.");

    await page.getByRole("button", { name: "Open playlist" }).click();
    await expect(page.locator(".saved")).toHaveCount(1);
    await expect(page.locator(".savedmeta")).toContainText("Sea shanty");
    await shot(page, "05-playlist");

    await expect(page.locator("#error")).toHaveCount(0);
});

test("sings the same words again in another style", async ({ page }) => {
    await signIn(page);
    await compose(page);
    await expect(page.locator(".head .sub")).toContainText("Bubblegum pop");

    await page.getByRole("button", { name: "Lullaby" }).click();
    await settled(page);
    await expect(page.locator(".head .sub")).toContainText("Lullaby");
    await expect(page.locator(".lyric")).toHaveCount(6);
    await expect(page.locator("#player")).toBeVisible();
    await shot(page, "06-restyle");

    await expect(page.locator("#error")).toHaveCount(0);
});

test("asks for notes instead of singing from nothing", async ({ page }) => {
    await signIn(page);
    await page.locator("#notes").fill("");
    await page.getByRole("button", { name: "Write me a song" }).click();
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#error")).toContainText("Paste what you want to remember.");
    await shot(page, "07-no-notes");
});

test("asks for Pollen instead of singing for free", async ({ page }) => {
    await page.goto(APP);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.locator("#notes").fill(NOTES);
    await page.getByRole("button", { name: "Write me a song" }).click();
    await expect(page.locator("#error")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("#error")).toContainText("Sign in with your Pollen");
    await expect(page.getByRole("button", { name: "Sign in with your Pollen" })).toBeVisible();
    await shot(page, "08-signin-required");
});

test("sign-in hands off to the Pollinations consent screen", async ({ page }) => {
    test.skip(
        !process.env.E2E_BASE_URL,
        "the local preview port is not a registered redirect URI",
    );
    await page.goto(APP);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "Sign in with your Pollen" }).click();
    await page.waitForURL(/enter\.pollinations\.ai\/authorize/, { timeout: 60_000 });

    const url = new URL(page.url());
    expect(url.searchParams.get("client_id")).toMatch(/^pk_/);
    expect(url.searchParams.get("redirect_uri")).toBe(APP);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();

    // The consent screen must name the app, not fall back to the hostname.
    await expect(page.getByText("Earworm", { exact: true })).toBeVisible({ timeout: 60_000 });
    await shot(page, "09-consent");
});
