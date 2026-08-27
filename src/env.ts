import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Vite exposes client vars on import.meta.env, not process.env. Typed locally
// rather than augmenting ImportMeta globally, so this package never collides
// with the consuming app's vite/client types.
const viteEnv = (
	import.meta as unknown as { env: Record<string, string | undefined> }
).env;

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		// Cooking gas (cylinder delivery) channel. Off by default — set "true"
		// to re-enable the order wizard, dashboard, and LPG API calls.
		VITE_COOKING_GAS_ENABLED: z
			.enum(["true", "false"])
			.optional()
			.transform((v) => v === "true"),
		// Company contact details, surfaced on the contact page, footer,
		// support links and payment copy. Each is optional — when unset,
		// lib/company.ts falls back to its built-in default — so the real
		// values can be supplied per environment without a code change.
		VITE_SUPPORT_PHONE: z.string().min(5).optional(),
		VITE_SUPPORT_EMAIL: z.email().optional(),
		VITE_WHATSAPP_URL: z.url().optional(),
		VITE_APP_STORE_URL: z.url().optional(),
		VITE_PLAY_STORE_URL: z.url().optional(),
		VITE_OFFICE_ADDRESS: z.string().min(5).optional(),
	},
	runtimeEnv: viteEnv,
	skipValidation: !!viteEnv.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
