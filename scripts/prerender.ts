import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

// Public marketing routes under `_site`. Dashboard, auth, order wizards, and
// `/t/$ref` are left as the SPA shell (not worth static snapshots).
const PUBLIC_ROUTES = ["/", "/faq", "/contact", "/terms", "/privacy"] as const;

const DIST_DIR = path.resolve("dist");
const PORT = 4173;

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/** Collapse duplicate head tags HeadContent can leave behind after client render. */
function cleanSnapshot(
	html: string,
	title: string,
	description: string | null,
): string {
	const withoutPreviewOrigin = html.replaceAll(`http://localhost:${PORT}`, "");

	const cleaned = withoutPreviewOrigin
		.replace(/<title>[^<]*<\/title>/g, "")
		.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/g, "");

	const headExtras = [
		`<title>${escapeHtml(title)}</title>`,
		description
			? `<meta name="description" content="${escapeHtml(description)}">`
			: null,
	]
		.filter(Boolean)
		.join("");

	return cleaned.replace("</head>", `${headExtras}</head>`);
}

async function main() {
	const server = await preview({ preview: { port: PORT } });

	const browser = await chromium.launch();
	const page = await browser.newPage();

	/*
	 * Snapshots are collected in full before ANY of them is written.
	 *
	 * Writing inside the loop poisons the run: preview answers an unknown path
	 * with dist/index.html, so the moment "/" is written every later route is
	 * served the homepage snapshot — markup already in #app, assets already
	 * cached, therefore `networkidle` satisfied before React has replaced the
	 * DOM. page.content() then captures the homepage under the wrong URL. It is
	 * a race, so it does not fail the same route twice, which is exactly how it
	 * survived review: /faq shipped a byte-identical copy of /.
	 *
	 * Holding the writes back keeps preview serving the pristine shell for the
	 * whole run, so every route has to render itself from scratch.
	 */
	const snapshots = new Map<string, { html: string; title: string }>();

	for (const route of PUBLIC_ROUTES) {
		const url = `http://localhost:${PORT}${route}`;
		console.log(`Prerendering ${url}`);

		await page.goto(url, { waitUntil: "networkidle" });

		// networkidle only proves the network settled, not that the router
		// committed this route. Wait for the app to own the DOM before reading it.
		await page.waitForFunction(
			() => {
				const app = document.getElementById("app");
				return !!app && app.childElementCount > 0;
			},
			{ timeout: 15_000 },
		);

		const title = await page.title();
		const description = await page
			.locator('meta[name="description"]')
			.last()
			.getAttribute("content")
			.catch(() => null);

		snapshots.set(route, {
			html: cleanSnapshot(await page.content(), title, description),
			title,
		});
	}

	await browser.close();
	await server.close();

	/*
	 * Two routes rendering byte-identical HTML means the race above reappeared.
	 * Fail the build rather than publish it: duplicate content across URLs is
	 * the one SEO fault worse than shipping no static markup at all, and it is
	 * invisible until rankings move.
	 */
	const seen = new Map<string, string>();
	for (const [route, { html }] of snapshots) {
		const twin = seen.get(html);
		if (twin) {
			throw new Error(
				`Prerender produced identical HTML for ${twin} and ${route}. ` +
					`One of them did not render its own route — refusing to write duplicates.`,
			);
		}
		seen.set(html, route);
	}

	for (const [route, { html, title }] of snapshots) {
		const outDir =
			route === "/" ? DIST_DIR : path.join(DIST_DIR, route.replace(/^\//, ""));
		await fs.mkdir(outDir, { recursive: true });
		await fs.writeFile(path.join(outDir, "index.html"), html, "utf-8");
		console.log(`  ${route} → ${title}`);
	}

	console.log("Prerender complete.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
