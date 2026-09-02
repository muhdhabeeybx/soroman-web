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

	for (const route of PUBLIC_ROUTES) {
		const url = `http://localhost:${PORT}${route}`;
		console.log(`Prerendering ${url}`);

		await page.goto(url, { waitUntil: "networkidle" });

		const title = await page.title();
		const description = await page
			.locator('meta[name="description"]')
			.last()
			.getAttribute("content")
			.catch(() => null);

		const html = cleanSnapshot(await page.content(), title, description);

		const outDir =
			route === "/" ? DIST_DIR : path.join(DIST_DIR, route.replace(/^\//, ""));
		await fs.mkdir(outDir, { recursive: true });
		await fs.writeFile(path.join(outDir, "index.html"), html, "utf-8");
	}

	await browser.close();
	await server.close();
	console.log("Prerender complete.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
