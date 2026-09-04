import { useEffect, useState } from "react";

import { api, type Depot, type DepotProduct } from "./api";

type CatalogState = {
	depots: Depot[];
	products: DepotProduct[];
	/** Hours unpaid orders may sit — from GET /api/catalog. Null until loaded. */
	orderExpiryHours: number | null;
	updatedAt: Date | null;
	isLoading: boolean;
};

export function useCatalog(): CatalogState {
	const [state, setState] = useState<CatalogState>({
		depots: [],
		products: [],
		orderExpiryHours: null,
		updatedAt: null,
		isLoading: true,
	});

	useEffect(() => {
		let cancelled = false;
		Promise.all([
			api.catalog.depots(),
			api.catalog.products(),
			api.catalog.orderExpiryHours(),
		]).then(([depots, products, orderExpiryHours]) => {
			if (cancelled) return;
			setState({
				depots,
				products,
				orderExpiryHours,
				updatedAt: new Date(),
				isLoading: false,
			});
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}

/**
 * Whether the desk has actually published a price for this product.
 *
 * A depot row can carry a zero because no price has been set for the day yet
 * — that is NOT the same as the product being out of stock, and it is not a
 * genuine "₦0/litre" quote either. Every surface routes an unpriced product
 * to "price not set" copy rather than printing the zero or claiming no stock.
 */
export const hasPublishedPrice = (p: { price: number }): boolean =>
	Number.isFinite(p.price) && p.price > 0;

export const formatNaira = (amount: number) =>
	`₦${amount.toLocaleString("en-NG")}`;

/**
 * Depots name the same fuel inconsistently — "PMS", "Pickup PMS", "PMS (Premium
 * Motor Spirit)", "Petrol" and plain "Fuel" all mean petrol. Collapse each to
 * one canonical fuel so every surface agrees on what a product IS.
 *
 * Shared rather than per-component on purpose: the price board and the order
 * chooser both answer "what does petrol cost today", and when only the board
 * canonicalized, a depot quoting "Petrol" showed a live price on the landing
 * page while the chooser next to it claimed the board had not opened.
 * Unrecognized products keep their own label so nothing is silently dropped.
 */
const CANONICAL_FUELS: { key: string; name: string; match: RegExp }[] = [
	{ key: "PMS", name: "Petrol", match: /\bpms\b|petrol|premium motor/i },
	{ key: "AGO", name: "Diesel", match: /\bago\b|diesel|gas ?oil/i },
	{ key: "DPK", name: "Kerosene", match: /\bdpk\b|kerosene|\bkero\b/i },
	{ key: "ATK", name: "Jet A1", match: /\batk\b|jet\s?a1?|aviation/i },
	{ key: "LPG", name: "Cooking gas", match: /\blpg\b|cooking gas|\bgas\b/i },
];

/** Canonical column order; anything new lands after these, A–Z. */
export const PRODUCT_ORDER = ["PMS", "AGO", "DPK", "ATK", "LPG"];

export function canonicalProduct(p: DepotProduct): {
	key: string;
	name: string;
} {
	const hay = `${p.abbreviation} ${p.name}`;
	const hit = CANONICAL_FUELS.find((f) => f.match.test(hay));
	return hit
		? { key: hit.key, name: hit.name }
		: { key: p.abbreviation, name: p.name };
}
