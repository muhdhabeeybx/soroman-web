import { Check } from "lucide-react";
import { useMemo } from "react";
import { StoreBadges } from "@/components/store-badges";
import { Skeleton } from "@/components/ui/skeleton";

import {
	canonicalProduct,
	formatNaira,
	hasPublishedPrice,
	PRODUCT_ORDER,
	useCatalog,
} from "@/lib/use-catalog";

/**
 * Mobile app section: a bordered muted panel closing the page, copy and
 * store links on the left, a phone bleeding off the panel edge on the right.
 * The phone shows a real mini preview of the product (live best prices from
 * the catalog, same data as the hero and the board), not an invented
 * screenshot.
 */

const FEATURES = [
	"Compare live prices across all Soroman depots",
	"Receive your invoice instantly after placing an order",
	"Track your order from payment to completion",
	"Reorder previous purchases in just a few clicks",
];

type BestQuote = { abbr: string; price: number; unit: string; depot: string };

export default function AppPromo() {
	const { depots, products, isLoading } = useCatalog();

	const rows = useMemo<BestQuote[]>(() => {
		const openDepots = new Map(
			depots.filter((d) => d.is_open).map((d) => [d.id, d.name]),
		);
		const best = new Map<string, BestQuote>();
		for (const p of products) {
			// Unpriced rows never enter the mock — a zero would read as the day's
			// best price and undercut every real quote.
			if (!p.available || !hasPublishedPrice(p) || !openDepots.has(p.depot_id))
				continue;
			// Keyed by canonical fuel, like the board: two depots calling petrol
			// "Petrol" and "PMS" are one product, not two rows in the mock.
			const key = canonicalProduct(p).key;
			const current = best.get(key);
			if (current === undefined || p.price < current.price) {
				best.set(key, {
					abbr: key,
					price: p.price,
					unit: p.unit,
					depot: openDepots.get(p.depot_id) ?? "",
				});
			}
		}
		const rank = (abbr: string) => {
			const i = PRODUCT_ORDER.indexOf(abbr);
			return i === -1 ? PRODUCT_ORDER.length : i;
		};
		return [...best.values()]
			.sort(
				(a, b) => rank(a.abbr) - rank(b.abbr) || a.abbr.localeCompare(b.abbr),
			)
			.slice(0, 4);
	}, [depots, products]);

	return (
		<section>
			<div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 md:pb-20">
				<div className="overflow-hidden rounded-xl border border-foreground/15 bg-muted/40">
					<div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-x-8">
						<div className="px-6 pt-10 sm:px-10 sm:pt-12 lg:col-span-7 lg:py-14">
							<h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
								Order Anywhere with the Soroman App
							</h2>
							<p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
								Order fuel, fund your wallet, track deliveries and receive live
								updates from your phone.
							</p>

							<ul className="mt-8 max-w-md space-y-3">
								{FEATURES.map((feature) => (
									<li key={feature} className="flex items-start gap-3 text-sm">
										<Check
											className="mt-0.5 size-4 shrink-0 text-accent"
											strokeWidth={2}
											aria-hidden
										/>
										{feature}
									</li>
								))}
							</ul>

							<div className="mt-10 flex flex-wrap gap-3">
								<StoreBadges />
							</div>
						</div>

						<div
							aria-hidden
							className="flex items-end justify-center px-6 lg:col-span-5 lg:px-0"
						>
							<div className="mt-12 w-[280px] translate-y-6 rounded-[2.75rem] border border-foreground/15 bg-card p-2.5 shadow-[0_24px_80px_rgba(0,0,0,0.12)] lg:mt-14">
								<div className="relative overflow-hidden rounded-[2.25rem] border border-foreground/10 bg-background text-foreground">
									<div className="absolute top-2.5 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-foreground/90" />
									<div className="px-5 pt-12 pb-6">
										<div className="flex items-center justify-between">
											<img
												src="/logo-full.png"
												alt=""
												className="h-4 w-auto dark:hue-rotate-180 dark:invert"
											/>
											<span className="flex items-center gap-1.5 text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">
												<span className="size-1.5 rounded-full bg-accent" />
												Live
											</span>
										</div>

										<p className="mt-5 text-[0.6rem] tracking-[0.22em] text-muted-foreground uppercase">
											Today's Lowest Price
										</p>
										<ul className="mt-1 divide-y divide-foreground/10">
											{isLoading ? (
												Array.from({ length: 4 }, (_, i) => (
													<li key={i} className="py-3">
														<Skeleton className="h-4 w-full" />
													</li>
												))
											) : rows.length === 0 ? (
												<li className="py-3 text-[0.65rem] text-muted-foreground">
													Prices not set across all locations yet.
												</li>
											) : (
												rows.map((row) => (
													<li
														key={row.abbr}
														className="flex items-baseline justify-between gap-3 py-2.5"
													>
														<span className="min-w-0">
															<span className="text-sm font-semibold">
																{row.abbr}
															</span>
															<span className="mt-0.5 block truncate text-[0.65rem] text-muted-foreground">
																{row.depot}
															</span>
														</span>
														<span className="text-sm font-semibold whitespace-nowrap tabular-nums">
															{formatNaira(row.price)}
															<span className="ml-0.5 text-[0.65rem] font-normal text-muted-foreground">
																/{row.unit}
															</span>
														</span>
													</li>
												))
											)}
										</ul>

										<div className="mt-4 rounded-xl border border-foreground/10 bg-muted/50 px-3.5 py-2.5">
											<p className="text-[0.6rem] tracking-[0.22em] text-muted-foreground uppercase">
												Recent Order Status
											</p>
											<p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
												<span className="size-1.5 shrink-0 rounded-full bg-accent" />
												AB-123A · Status: Loading
											</p>
										</div>

										<span className="mt-4 flex h-9 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
											Start an order
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
