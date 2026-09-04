import { Link } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { paymentWindowHoursLabel } from "@/lib/api";
import { formatNaira, hasPublishedPrice, useCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

/**
 * Editorial principles adapted for a price-scanning utility.
 *
 * Keeps: the alabaster/charcoal/emerald palette, sharp edges, generous space,
 * wide-tracked labels, and a large display headline set in the brand face.
 * The right half carries the market snapshot: four fixed product rows whose
 * depot quotes rotate one row at a time (round-robin, so the eye only ever
 * tracks a single point of motion), resting on the best price between tours.
 */

type ProductQuote = {
	depotId: number;
	depotName: string;
	state: string;
	price: number;
};

type ProductRow = {
	abbr: string;
	name: string;
	unit: string;
	/** Open-depot quotes, cheapest first. quotes[0] is always the best price. */
	quotes: ProductQuote[];
	/** Open depots that carry no quote for this product today. */
	nonQuoting: { depotId: number; depotName: string }[];
};

const ROTATE_MS = 2200;
const SWAP_MS = 240;
/** Rounds a row sits out after finishing a tour, resting on its best price. */
const REST_TURNS = 6;
const PANEL_CLOSE_GRACE_MS = 200;

export default function Hero() {
	const { depots, products, updatedAt, isLoading, orderExpiryHours } =
		useCatalog();

	const openDepots = useMemo(() => depots.filter((d) => d.is_open), [depots]);

	const rows = useMemo<ProductRow[]>(() => {
		const byAbbr = new Map<string, { name: string; unit: string }>();
		for (const p of products) {
			if (!byAbbr.has(p.abbreviation)) {
				byAbbr.set(p.abbreviation, { name: p.name, unit: p.unit });
			}
		}
		const built = [...byAbbr.entries()].map(([abbr, meta]) => {
			const quotes = openDepots
				.flatMap((d) => {
					// A zero price is not a quote — the depot simply has not published
					// one today, so it falls through to nonQuoting below.
					const p = products.find(
						(x) =>
							x.depot_id === d.id &&
							x.abbreviation === abbr &&
							x.available &&
							hasPublishedPrice(x),
					);
					return p
						? [
								{
									depotId: d.id,
									depotName: d.name,
									state: d.state,
									price: p.price,
								},
							]
						: [];
				})
				.sort((a, b) => a.price - b.price);
			const quotingIds = new Set(quotes.map((q) => q.depotId));
			return {
				abbr,
				name: meta.name,
				unit: meta.unit,
				quotes,
				nonQuoting: openDepots
					.filter((d) => !quotingIds.has(d.id))
					.map((d) => ({ depotId: d.id, depotName: d.name })),
			};
		});
		return built
			.sort(
				(a, b) =>
					b.quotes.length - a.quotes.length || a.abbr.localeCompare(b.abbr),
			)
			.slice(0, 4);
	}, [openDepots, products]);

	return (
		<section className="border-b border-foreground/15">
			{/*
			 * min-w-0 on both columns is load-bearing, not decoration: a grid item
			 * defaults to min-width:auto, so the track is floored at the snapshot's
			 * min-content width (its rows carry a fixed price column and a nowrap
			 * truncating depot name). Without it the whole page is forced ~630px
			 * wide on a 375px phone and every section inherits the overflow.
			 */}
			<div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-28 lg:grid-cols-12 lg:items-center lg:gap-16">
				<div className="min-w-0 lg:col-span-6">
					<div className="flex items-center gap-4">
						<span className="h-px w-8 bg-foreground md:w-12" aria-hidden />
						<span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
							Order Fuel in Minutes
						</span>
					</div>
					<h1 className="mt-8 text-4xl leading-[1.02] tracking-tight text-balance sm:text-5xl sm:leading-[0.95] md:text-6xl">
						{/* Inter's italic is not loaded by choice; emphasis is weight. */}
						Buy Fuel Directly from{" "}
						<em className="font-semibold text-accent not-italic">Soroman.</em>
					</h1>
					<p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
						Purchase fuel products from our depots across Nigeria at today's
						prices. Place your order in minutes and track every stage until
						completion.
					</p>
					{/*
					 * data-hero-cta marks this row for the header: while it is on screen
					 * the header hides its own Start an order so the two never
					 * duplicate. See components/header.tsx.
					 */}
					<div
						data-hero-cta
						className="mt-10 flex flex-wrap gap-3 md:mt-12 md:gap-4"
					>
						<Button
							size="lg"
							nativeButton={false}
							render={<Link to="/order">Order Now</Link>}
						/>
						<Button
							size="lg"
							variant="secondary"
							nativeButton={false}
							render={<a href="#track">Check my order status</a>}
						/>
					</div>
				</div>

				<div className="min-w-0 lg:col-span-6">
					{isLoading ? (
						<MarketSnapshotSkeleton />
					) : (
						<MarketSnapshot
							rows={rows}
							openDepotCount={openDepots.length}
							totalDepotCount={depots.length}
							updatedAt={updatedAt}
							orderExpiryHours={orderExpiryHours}
						/>
					)}
				</div>
			</div>
		</section>
	);
}

function MarketSnapshotSkeleton() {
	return (
		<div className="overflow-hidden rounded-xl border border-foreground/15 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
			<div className="flex items-center justify-between border-b border-foreground/15 px-4 py-4 sm:px-6">
				<span className="text-xs tracking-[0.25em] uppercase">
					Market snapshot
				</span>
				<span className="flex items-center gap-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">
					<span className="size-1.5 rounded-full bg-muted" aria-hidden />
					Live
				</span>
			</div>

			{Array.from({ length: 4 }, (_, i) => (
				<div
					key={i}
					className="flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-4 sm:gap-5 sm:px-6"
				>
					<div className="min-w-0 flex-1">
						<Skeleton className="h-3 w-28 sm:w-36" />
						<Skeleton className="mt-2.5 h-3.5 w-40 max-w-full sm:w-52" />
						<Skeleton className="mt-2 h-2.5 w-32 max-w-full" />
					</div>
					<div className="flex shrink-0 flex-col items-end gap-1.5 sm:min-w-36">
						<Skeleton className="h-6 w-24 sm:h-7 sm:w-28" />
						<Skeleton className="h-4 w-20 rounded-full" />
					</div>
				</div>
			))}

			<div className="bg-muted/60 px-4 py-3 sm:px-6">
				<Skeleton className="h-3 w-full max-w-sm" />
			</div>
		</div>
	);
}

function MarketSnapshot({
	rows,
	openDepotCount,
	totalDepotCount,
	updatedAt,
	orderExpiryHours,
}: {
	rows: ProductRow[];
	openDepotCount: number;
	totalDepotCount: number;
	updatedAt: Date | null;
	orderExpiryHours: number | null;
}) {
	const [paused, setPaused] = useState(false);
	/** Which item each row currently shows: index into [...quotes, ...nonQuoting]. */
	const [shown, setShown] = useState<Record<string, number>>({});
	/** Rows mid cross-fade (content faded out, about to swap). */
	const [fading, setFading] = useState<Record<string, boolean>>({});
	const [panelKey, setPanelKey] = useState<string | null>(null);
	const [panelFading, setPanelFading] = useState(false);
	const paymentWindowLabel = paymentWindowHoursLabel(orderExpiryHours);
	/**
	 * Not one depot has published a price for any product. Promising a price
	 * window under that would be promising a price we do not have, so the
	 * status line states the actual situation instead.
	 */
	const nonePriced =
		rows.length > 0 && rows.every((r) => r.quotes.length === 0);

	const pausedRef = useRef(false);
	const turnRef = useRef(0);
	const restRef = useRef<Record<string, number>>({});
	const swapTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const panelSwapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const reducedMotion = useMemo(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);

	useEffect(() => {
		if (reducedMotion || rows.length === 0) return;
		const interval = setInterval(() => {
			if (pausedRef.current) return;
			const row = rows[turnRef.current % rows.length];
			turnRef.current++;
			if (!row) return;
			const seqLen = row.quotes.length + row.nonQuoting.length;
			// A product nobody quotes today holds a static "awaiting price" state;
			// rotating its empty depots would be motion without information.
			if (row.quotes.length === 0 || seqLen <= 1) return;
			const rest = restRef.current[row.abbr] ?? 0;
			if (rest > 0) {
				restRef.current[row.abbr] = rest - 1;
				return;
			}
			setFading((f) => ({ ...f, [row.abbr]: true }));
			swapTimers.current.push(
				setTimeout(() => {
					setShown((s) => {
						const next = (s[row.abbr] ?? 0) + 1;
						if (next >= seqLen) {
							restRef.current[row.abbr] = REST_TURNS;
							return { ...s, [row.abbr]: 0 };
						}
						return { ...s, [row.abbr]: next };
					});
					setFading((f) => ({ ...f, [row.abbr]: false }));
				}, SWAP_MS),
			);
		}, ROTATE_MS);
		return () => {
			clearInterval(interval);
			swapTimers.current.forEach(clearTimeout);
			swapTimers.current = [];
		};
	}, [rows, reducedMotion]);

	const openPanelFor = (abbr: string) => {
		if (closeTimer.current) clearTimeout(closeTimer.current);
		if (panelKey === abbr) return;
		if (panelKey !== null) {
			// Already open for another row: cross-fade the content instead of
			// collapsing and re-expanding, so the card never pumps while scanning.
			setPanelFading(true);
			if (panelSwapTimer.current) clearTimeout(panelSwapTimer.current);
			panelSwapTimer.current = setTimeout(() => {
				setPanelKey(abbr);
				setPanelFading(false);
			}, 180);
		} else {
			setPanelKey(abbr);
		}
	};

	const scheduleClosePanel = () => {
		if (closeTimer.current) clearTimeout(closeTimer.current);
		// Grace period so the diagonal mouse path from a row down to the panel
		// doesn't close it before the cursor arrives.
		closeTimer.current = setTimeout(
			() => setPanelKey(null),
			PANEL_CLOSE_GRACE_MS,
		);
	};

	const cancelClosePanel = () => {
		if (closeTimer.current) clearTimeout(closeTimer.current);
	};

	useEffect(
		() => () => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			if (panelSwapTimer.current) clearTimeout(panelSwapTimer.current);
		},
		[],
	);

	const panelRow = rows.find((r) => r.abbr === panelKey) ?? null;

	return (
		<div
			className="overflow-hidden rounded-xl border border-foreground/15 shadow-[0_8px_32px_rgba(0,0,0,0.06)]"
			onMouseEnter={() => {
				pausedRef.current = true;
				setPaused(true);
			}}
			onMouseLeave={() => {
				pausedRef.current = false;
				setPaused(false);
			}}
		>
			<div className="flex items-center justify-between border-b border-foreground/15 px-4 py-4 sm:px-6">
				<span className="text-xs tracking-[0.25em] uppercase">
					Market snapshot
				</span>
				<span className="flex items-center gap-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">
					<span
						className={cn(
							"size-1.5 rounded-full transition-[background-color,box-shadow] duration-200",
							paused
								? "bg-transparent shadow-[inset_0_0_0_1.5px_currentColor]"
								: "live-dot bg-accent",
						)}
						aria-hidden
					/>
					{paused ? "Paused" : "Live"}
				</span>
			</div>

			{rows.map((row, i) => (
				<SnapshotRow
					key={row.abbr}
					row={row}
					shownIndex={shown[row.abbr] ?? 0}
					fading={fading[row.abbr] ?? false}
					openDepotCount={openDepotCount}
					entranceDelay={i * 90}
					onEnter={() => openPanelFor(row.abbr)}
					onLeave={scheduleClosePanel}
				/>
			))}

			<div
				className="bg-muted/60 px-4 py-3 sm:px-6"
				onMouseEnter={cancelClosePanel}
				onMouseLeave={scheduleClosePanel}
			>
				<p
					className={cn(
						"text-xs text-muted-foreground tabular-nums transition-opacity duration-200",
						panelKey && "opacity-45",
					)}
				>
					{openDepotCount}/{totalDepotCount} depots open
					{updatedAt && (
						<>
							{" · Updated "}
							{updatedAt.toLocaleTimeString("en-NG", {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</>
					)}
					{nonePriced
						? " · Prices not set across all locations"
						: paymentWindowLabel
							? ` · ${paymentWindowLabel}`
							: ""}
				</p>
				<div
					className="ease-luxe grid transition-[grid-template-rows] duration-[280ms]"
					style={{ gridTemplateRows: panelKey ? "1fr" : "0fr" }}
				>
					<div className="overflow-hidden">
						<div
							className={cn(
								"ease-luxe pt-3 transition-[opacity,filter] duration-[180ms]",
								panelFading && "opacity-0 blur-[2px]",
							)}
						>
							{panelRow && <ContextPanel row={panelRow} />}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function SnapshotRow({
	row,
	shownIndex,
	fading,
	openDepotCount,
	entranceDelay,
	onEnter,
	onLeave,
}: {
	row: ProductRow;
	shownIndex: number;
	fading: boolean;
	openDepotCount: number;
	entranceDelay: number;
	onEnter: () => void;
	onLeave: () => void;
}) {
	const best = row.quotes[0] ?? null;
	const shownQuote =
		shownIndex < row.quotes.length ? row.quotes[shownIndex] : null;
	const shownNonQuoting =
		shownIndex >= row.quotes.length
			? row.nonQuoting[shownIndex - row.quotes.length]
			: null;

	const fadeClass = cn(
		"ease-luxe transition-[opacity,transform,filter] duration-[240ms] motion-reduce:transition-none",
		fading && "opacity-0 translate-y-[5px] blur-[2px]",
	);

	const content = (
		<>
			<div className="min-w-0 flex-1">
				<p className="text-xs tracking-[0.22em] uppercase">
					{row.abbr}
					<span className="ml-2 text-muted-foreground tracking-[0.08em]">
						· {row.name}
					</span>
				</p>
				<div className={fadeClass}>
					<p className="mt-1.5 truncate text-sm text-muted-foreground">
						{/*
						 * Exactly one of these. Touring the depots that are not quoting
						 * only makes sense while at least one IS: with nothing priced
						 * anywhere, the tour and the "nobody has published" line used to
						 * render together and ran into each other.
						 */}
						{shownQuote ? (
							<>
								{shownQuote.depotName}, {shownQuote.state}
							</>
						) : (
							<span className="text-muted-foreground/60">
								{best && shownNonQuoting
									? shownNonQuoting.depotName
									: "No depot has published a price yet"}
							</span>
						)}
					</p>
				</div>
				<p className="mt-1.5 text-[0.6rem] tracking-[0.12em] text-muted-foreground/70 uppercase">
					Priced at {row.quotes.length} of {openDepotCount} depots
					{best && (
						<span
							className={cn(
								"ml-2 text-accent transition-[opacity,transform] duration-[220ms] ease-luxe",
								"opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0",
								"group-focus-visible:opacity-100 group-focus-visible:translate-x-0",
								"pointer-coarse:opacity-100 pointer-coarse:translate-x-0",
								"motion-reduce:transition-none inline-block",
							)}
						>
							Order at best price →
						</span>
					)}
				</p>
			</div>

			<div
				className={cn(
					"flex shrink-0 flex-col items-end gap-1.5 text-right sm:min-w-[9rem]",
					fadeClass,
				)}
			>
				{shownQuote ? (
					<>
						<p className="text-xl leading-none font-semibold tracking-tight tabular-nums sm:text-2xl">
							{formatNaira(shownQuote.price)}
							<span className="ml-0.5 text-xs font-normal text-muted-foreground">
								/{row.unit}
							</span>
						</p>
						{shownIndex === 0 ? (
							<StatusChip tone="best">Best of {row.quotes.length}</StatusChip>
						) : (
							<StatusChip tone="delta">
								+{formatNaira(shownQuote.price - (best?.price ?? 0)).slice(1)}{" "}
								vs best
							</StatusChip>
						)}
					</>
				) : (
					<>
						<p className="text-xl leading-none font-semibold text-muted-foreground/40 tabular-nums sm:text-2xl">
							—
							<span className="ml-0.5 text-xs font-normal text-muted-foreground/30">
								/{row.unit}
							</span>
						</p>
						<StatusChip tone="muted">
							{best ? "No price today" : "Awaiting price"}
						</StatusChip>
					</>
				)}
			</div>
		</>
	);

	const rowClass = cn(
		"snapshot-rise group flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-4 sm:gap-5 sm:px-6",
		"transition-colors duration-250 ease-luxe hover:bg-muted/40 active:bg-muted/60",
	);
	const style = { animationDelay: `${entranceDelay}ms` };

	// The row links to the best-price depot even while touring pricier ones —
	// the CTA reads "order at best price", so the destination must match.
	if (!best) {
		return (
			<div
				className={rowClass}
				style={style}
				onMouseEnter={onEnter}
				onMouseLeave={onLeave}
			>
				{content}
			</div>
		);
	}
	return (
		<Link
			to="/order/depot"
			search={{ depot: best.depotId }}
			className={rowClass}
			style={style}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			onFocus={onEnter}
			onBlur={onLeave}
		>
			{content}
		</Link>
	);
}

function StatusChip({
	tone,
	children,
}: {
	tone: "best" | "delta" | "muted";
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				"rounded-full border px-2.5 py-0.5 text-[0.6rem] tracking-[0.14em] whitespace-nowrap uppercase",
				tone === "best" && "border-accent/40 text-accent",
				tone === "delta" &&
					"border-amber-600/40 text-amber-600 dark:text-amber-500",
				tone === "muted" && "border-foreground/15 text-muted-foreground/60",
			)}
		>
			{children}
		</span>
	);
}

function ContextPanel({ row }: { row: ProductRow }) {
	if (row.quotes.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				No {row.name.toLowerCase()} price published yet today.
			</p>
		);
	}

	const low = row.quotes[0].price;
	const high = row.quotes[row.quotes.length - 1].price;
	const span = high - low || 1;
	const bestDepot = row.quotes[0].depotName;

	if (row.quotes.length === 1) {
		return (
			<p className="text-xs text-muted-foreground">
				Only {bestDepot} has a price for {row.name.toLowerCase()} today.
			</p>
		);
	}

	return (
		<div>
			<div className="relative h-4 px-px">
				<div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" />
				{row.quotes.map((q, i) => (
					<span
						key={q.depotId}
						aria-hidden
						className={cn(
							"absolute top-1/2 -translate-x-1/2 -translate-y-1/2",
							i === 0 ? "h-3.5 w-0.5 bg-accent" : "h-2 w-px bg-foreground/30",
						)}
						style={{ left: `${((q.price - low) / span) * 100}%` }}
					/>
				))}
			</div>
			<div className="mt-1 flex justify-between text-[0.6rem] tracking-[0.12em] uppercase tabular-nums">
				<span className="text-accent">
					{formatNaira(low)} best · {bestDepot}
				</span>
				<span className="text-muted-foreground">{formatNaira(high)} high</span>
			</div>
		</div>
	);
}
