/**
 * Single source of truth for company contact details and depot addresses.
 *
 * The contact values and store listings are env-configurable (VITE_* in
 * .env, see src/env.ts) so the real details can be set per environment
 * without a code change; the literals below are the fallbacks when an env
 * var is unset. TODO: the fallback phone, email and street addresses are
 * placeholders pending the real details from the desk team.
 */
import { env } from "@/env";

export const WHATSAPP_URL =
	env.VITE_WHATSAPP_URL ?? "https://chat.whatsapp.com/K0OVqaE6KJf80A2jd4nIWM";
export const SUPPORT_PHONE = env.VITE_SUPPORT_PHONE ?? "+234 705 5555 9623";
// Direct WhatsApp chat with the support desk — derived from SUPPORT_PHONE so
// one env var drives the number everywhere it appears (tel:, display, wa.me).
// Distinct from WHATSAPP_URL, which is the community group-invite link.
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, "")}`;
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL ?? "support@soromannl.com";

export const LOADING_HOURS = "7:00am to 6:00pm, Monday to Saturday";

export const APP_STORE_URL =
	env.VITE_APP_STORE_URL ??
	"https://apps.apple.com/ng/app/soroman/id0000000000";
export const PLAY_STORE_URL =
	env.VITE_PLAY_STORE_URL ??
	"https://play.google.com/store/apps/details?id=ng.soroman.app";

export const COMPANY_NAME = "Soroman Energy";

/** The head-office / main-depot street address shown on the contact page. */
export const OFFICE_ADDRESS =
	env.VITE_OFFICE_ADDRESS ??
	"Soroman Depot, Portside Industrial Area, Esuk Utan, Calabar, Cross River State";

/** A Google Maps directions link for any address string. */
export const mapsHref = (address: string) =>
	`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export const telHref = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;

/**
 * Where we load, grouped by state and alphabetical by state so the contact
 * page reads as a geography rather than an arbitrary list. Keep new entries in
 * their state's block.
 *
 * `state` carries no "State" suffix — the contact page renders `{state} State`,
 * so adding it here prints it twice.
 */
export const DEPOT_LOCATIONS = [
	{ name: "Calabar Soroman Depot", state: "Cross River" },

	{ name: "Keonamex Depot Warri", state: "Delta" },

	{ name: "Dangote Refinery Soroman Ticket", state: "Lagos" },
	{ name: "AIPEC Depot Lagos", state: "Lagos" },

	{ name: "TSL Depot Port Harcourt", state: "Rivers" },
	{ name: "Liquid Bulk Port Harcourt", state: "Rivers" },
	{ name: "Avidor Depot Port Harcourt", state: "Rivers" },
] as const;
