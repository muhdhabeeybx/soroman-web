import { Link, useNavigate } from "@tanstack/react-router";
import { flexRender, useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { Depot, DepotProduct } from "@/lib/api";

import { type AppColumnDef, appTableFeatures } from "@/lib/table";
import {
	canonicalProduct,
	formatNaira,
	hasPublishedPrice,
	PRODUCT_ORDER,
	useCatalog,
} from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

/**
 * One board, not six cards: rows are depots, columns are products, so a
 * buyer can scan any product straight down a column. The best price is
 * marked with color alone — a pill would push prices out of the column.
 * Ordering is a quiet row-level link instead of a repeated primary button.
 *
 * Built with TanStack Table (dynamic product columns) rather than the shared
 * list DataTable — this is a matrix with a caption, a footer legend, and a
 * mobile card fallback, not a flat row list.
 */

const LOADING_ROWS = 6;
/** Placeholder product columns while the catalog is still loading. */
const LOADING_PRODUCTS = ["PMS", "AGO", "DPK"] as const;

type ProductColumn = { abbr: string; name: string };

type BoardRow = {
	depot: Depot;
	quotes: Map<string, DepotProduct | undefined>;
	bestPrices: Map<string, number>;
};

export default function PriceBoard({
	embedded = false,
}: {
	/**
	 * True when a page (e.g. the dashboard's Depot prices) supplies its own
	 * header and container: drops the section shell and the h2, keeps the
	 * updated-at line, filters and the board itself.
	 */
	embedded?: boolean;
}) {
	const { depots, products, updatedAt, isLoading } = useCatalog();
	const [stateFilter, setStateFilter] = useState<string | null>(null);
	const navigate = useNavigate();

	const states = useMemo(
		() => [...new Set(depots.map((d) => d.state))],
		[depots],
	);

	// Columns come from the full catalog (not the filtered depots) so the
	// board keeps its shape while the user flips between state filters.
	const productColumns = useMemo<ProductColumn[]>(() => {
		if (isLoading && products.length === 0) {
			return LOADING_PRODUCTS.map((abbr) => ({ abbr, name: "…" }));
		}
		const byKey = new Map<string, ProductColumn>();
		for (const p of products) {
			const c = canonicalProduct(p);
			if (!byKey.has(c.key)) {
				byKey.set(c.key, { abbr: c.key, name: c.name });
			}
		}
		const rank = (abbr: string) => {
			const i = PRODUCT_ORDER.indexOf(abbr);
			return i === -1 ? PRODUCT_ORDER.length : i;
		};
		return [...byKey.values()].sort(
			(a, b) => rank(a.abbr) - rank(b.abbr) || a.abbr.localeCompare(b.abbr),
		);
	}, [products, isLoading]);

	// Open depots first; closed ones sink to the bottom, muted.
	const visibleDepots = useMemo(() => {
		const list = stateFilter
			? depots.filter((d) => d.state === stateFilter)
			: depots;
		return [...list].sort((a, b) => Number(b.is_open) - Number(a.is_open));
	}, [depots, stateFilter]);

	const quoteFor = useMemo(() => {
		const map = new Map<string, DepotProduct>();
		// Keyed by the canonical fuel, so a depot's one petrol product lands in the
		// single "Petrol" column whatever it happens to be named.
		for (const p of products)
			map.set(`${p.depot_id}:${canonicalProduct(p).key}`, p);
		return map;
	}, [products]);

	// Cheapest available price per product across open depots — matches the
	// hero snapshot's "best" so both surfaces mark the same number in emerald.
	const bestPrices = useMemo(() => {
		const openIds = new Set(depots.filter((d) => d.is_open).map((d) => d.id));
		const best = new Map<string, number>();
		for (const p of products) {
			// An unpriced row would otherwise win every column with its zero.
			if (!p.available || !hasPublishedPrice(p) || !openIds.has(p.depot_id))
				continue;
			const key = canonicalProduct(p).key;
			const current = best.get(key);
			if (current === undefined || p.price < current) {
				best.set(key, p.price);
			}
		}
		return best;
	}, [depots, products]);

	const rows = useMemo<BoardRow[]>(
		() =>
			visibleDepots.map((depot) => {
				const quotes = new Map<string, DepotProduct | undefined>();
				for (const c of productColumns) {
					quotes.set(c.abbr, quoteFor.get(`${depot.id}:${c.abbr}`));
				}
				return { depot, quotes, bestPrices };
			}),
		[visibleDepots, productColumns, quoteFor, bestPrices],
	);

	const columns = useMemo<AppColumnDef<BoardRow>[]>(() => {
		const defs: AppColumnDef<BoardRow>[] = [
			{
				id: "depot",
				header: "Depot",
				cell: ({ row }) => (
					<>
						<span className="flex items-center gap-2 text-sm font-semibold">
							{row.original.depot.name}
							<StatusLabel open={row.original.depot.is_open} />
						</span>
						<span className="mt-0.5 block text-xs font-normal text-muted-foreground">
							{row.original.depot.state} State
						</span>
					</>
				),
			},
		];

		for (const c of productColumns) {
			defs.push({
				id: c.abbr,
				header: () => (
					<div className="text-right">
						<span className="block text-xs font-semibold tracking-[0.18em] uppercase">
							{c.name}
						</span>
					</div>
				),
				meta: { className: "text-right" },
				cell: ({ row }) => {
					const product = row.original.quotes.get(c.abbr);
					const best =
						row.original.depot.is_open &&
						product?.available === true &&
						hasPublishedPrice(product) &&
						row.original.bestPrices.get(c.abbr) === product.price;
					return <PriceCell product={product} best={Boolean(best)} />;
				},
			});
		}

		defs.push({
			id: "order",
			header: () => <span className="sr-only">Order</span>,
			meta: { className: "text-right" },
			cell: ({ row }) =>
				row.original.depot.is_open ? (
					<Link
						to="/order/depot"
						search={{ depot: row.original.depot.id }}
						className="group inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.14em] text-accent uppercase"
						onClick={(e) => e.stopPropagation()}
					>
						Order from this Depot
						<span
							aria-hidden
							className="ease-luxe transition-transform duration-250 group-hover:translate-x-0.5"
						>
							→
						</span>
						<span className="sr-only"> from {row.original.depot.name}</span>
					</Link>
				) : (
					<span className="text-[0.6rem] tracking-[0.12em] text-muted-foreground uppercase">
						Next loading day
					</span>
				),
		});

		return defs;
	}, [productColumns]);

	const table = useTable({
		features: appTableFeatures,
		data: rows,
		columns,
	});

	/**
	 * Nothing anywhere carries a price. The board still lists every depot —
	 * they are open and loading — but "live prices from all depots" would be a
	 * lie, so the line says plainly that the day's prices are not set yet.
	 */
	const nonePriced =
		products.length > 0 && !products.some((p) => hasPublishedPrice(p));

	const updatedLine = !updatedAt ? (
		"Fetching live prices..."
	) : nonePriced ? (
		"Prices not set across all locations. Call the desk for today's rate."
	) : (
		<>
			Last updated at{" "}
			{updatedAt.toLocaleTimeString("en-NG", {
				hour: "2-digit",
				minute: "2-digit",
			})}
			. Live prices from all Soroman depots.
		</>
	);

	return (
		<section
			id="prices"
			className={cn(
				!embedded && "bg-muted/60 border-b border-foreground/15 scroll-mt-20",
			)}
		>
			<div
				className={cn(
					!embedded && "mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20",
				)}
			>
				<div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
					<div>
						{!embedded && (
							<h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
								Today's Depot Prices
							</h2>
						)}
						<p
							className={cn(
								"text-sm text-muted-foreground",
								!embedded && "mt-2",
							)}
						>
							{updatedLine}
						</p>
					</div>

					<div
						className="flex gap-2 overflow-x-auto pb-1"
						role="group"
						aria-label="Filter depots by state"
					>
						<FilterPill
							label="All states"
							active={stateFilter === null}
							onClick={() => setStateFilter(null)}
						/>
						{states.map((state) => (
							<FilterPill
								key={state}
								label={state}
								active={stateFilter === state}
								onClick={() => setStateFilter(state)}
							/>
						))}
					</div>
				</div>

				{/* Desktop matrix board */}
				<div className="mt-8 hidden overflow-hidden rounded-xl border border-foreground/15 md:block">
					<Table>
						<caption className="sr-only">
							Today's prices by depot and product
						</caption>
						<TableHeader>
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow
									key={headerGroup.id}
									className="border-foreground/15 hover:bg-transparent"
								>
									{headerGroup.headers.map((header) => (
										<TableHead
											key={header.id}
											className={cn(
												"h-auto px-3 py-4 text-xs font-normal tracking-[0.22em] text-muted-foreground uppercase first:px-6 last:px-6",
												header.column.columnDef.meta?.className,
											)}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{isLoading ? (
								Array.from({ length: LOADING_ROWS }, (_, i) => (
									<TableRow
										key={`loading-${i}`}
										className="border-foreground/15 hover:bg-transparent"
									>
										<TableCell className="px-6 py-4">
											<Skeleton className="h-4 w-36" />
											<Skeleton className="mt-1.5 h-3 w-20" />
										</TableCell>
										{productColumns.map((c) => (
											<TableCell key={c.abbr} className="px-3 py-4 text-right">
												<Skeleton className="ml-auto h-4 w-24" />
											</TableCell>
										))}
										<TableCell className="px-6 py-4 text-right">
											<Skeleton className="ml-auto h-3 w-14" />
										</TableCell>
									</TableRow>
								))
							) : rows.length === 0 ? (
								<TableRow className="hover:bg-transparent">
									<TableCell
										colSpan={columns.length}
										className="px-6 py-12 text-center text-sm text-muted-foreground"
									>
										No depots match this filter.
									</TableCell>
								</TableRow>
							) : (
								table.getRowModel().rows.map((row) => {
									const open = row.original.depot.is_open;
									const goToOrder = () =>
										navigate({
											to: "/order/depot",
											search: { depot: row.original.depot.id },
										});
									return (
										<TableRow
											key={row.id}
											onClick={open ? goToOrder : undefined}
											onKeyDown={
												open
													? (e) => {
															if (e.key === "Enter" || e.key === " ") {
																e.preventDefault();
																goToOrder();
															}
														}
													: undefined
											}
											role={open ? "link" : undefined}
											tabIndex={open ? 0 : undefined}
											aria-label={
												open
													? `Order from ${row.original.depot.name}`
													: undefined
											}
											className={cn(
												"ease-luxe border-foreground/15 transition-colors duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
												open
													? "cursor-pointer hover:bg-muted/40"
													: "opacity-55",
											)}
										>
											{row.getAllCells().map((cell) => (
												<TableCell
													key={cell.id}
													className={cn(
														"px-3 py-4 whitespace-normal first:px-6 last:px-6",
														cell.column.columnDef.meta?.className,
													)}
												>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</TableCell>
											))}
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
					{/* <div className="border-t border-foreground/15 bg-muted/60 px-6 py-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              <span className="text-accent">Green</span> marks today's best open-depot price ·{" "}
              {isLoading ? "…" : `${openCount}/${depots.length}`} depots open
            </p>
          </div> */}
				</div>

				{/* Mobile cards */}
				<div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
					{isLoading
						? Array.from({ length: 4 }, (_, i) => <DepotCardSkeleton key={i} />)
						: visibleDepots.map((depot) => (
								<DepotCard
									key={depot.id}
									depot={depot}
									products={products.filter((p) => p.depot_id === depot.id)}
									bestPrices={bestPrices}
								/>
							))}
				</div>
			</div>
		</section>
	);
}

function FilterPill({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"ease-luxe shrink-0 rounded-full border px-4 py-2 text-xs font-medium tracking-[0.1em] uppercase transition-colors duration-250",
				active
					? "border-primary bg-primary text-primary-foreground"
					: "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
			)}
		>
			{label}
		</button>
	);
}

function StatusLabel({ open }: { open: boolean }) {
	return open ? (
		<span className="flex items-center gap-1.5 text-[0.6rem] font-medium tracking-[0.12em] text-primary uppercase">
			<span className="size-1.5 rounded-full bg-primary" aria-hidden />
			Open
		</span>
	) : (
		<span className="text-[0.6rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
			Closed
		</span>
	);
}

function PriceCell({
	product,
	best,
}: {
	product: DepotProduct | undefined;
	best: boolean;
}) {
	if (!product) {
		return (
			<span className="text-sm text-muted-foreground/40" aria-label="Not sold">
				—
			</span>
		);
	}
	if (!product.available) {
		return <span className="text-xs text-muted-foreground">Out of stock</span>;
	}
	// A zero means no price has been set for the day — say that, rather than
	// printing "₦0" or borrowing the out-of-stock label.
	if (!hasPublishedPrice(product)) {
		return <span className="text-xs text-muted-foreground">Price not set</span>;
	}
	return (
		<span
			className={cn(
				"text-sm font-semibold tabular-nums",
				best && "text-accent",
			)}
		>
			{best && <span className="sr-only">Best price: </span>}
			{formatNaira(product.price)}
			<span className="ml-1 text-xs font-normal text-muted-foreground">
				/{product.unit}
			</span>
		</span>
	);
}

function DepotCard({
	depot,
	products,
	bestPrices,
}: {
	depot: Depot;
	products: DepotProduct[];
	bestPrices: Map<string, number>;
}) {
	return (
		<article
			className={cn(
				"flex flex-col overflow-hidden rounded-xl border border-foreground/15 bg-card",
				!depot.is_open && "opacity-70",
			)}
		>
			<header className="flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-3">
				<div>
					<h3 className="text-sm font-semibold">{depot.name}</h3>
					<p className="text-xs text-muted-foreground">{depot.state} State</p>
				</div>
				<StatusLabel open={depot.is_open} />
			</header>

			<ul className="flex-1 px-4 py-2">
				{products.map((product) => (
					<li
						key={product.id}
						className="flex items-baseline justify-between gap-4 py-2"
					>
						<span className="text-sm font-medium">
							{canonicalProduct(product).name}
						</span>
						<PriceCell
							product={product}
							best={
								depot.is_open &&
								product.available &&
								hasPublishedPrice(product) &&
								bestPrices.get(canonicalProduct(product).key) === product.price
							}
						/>
					</li>
				))}
			</ul>

			<footer className="border-t border-foreground/15">
				{depot.is_open ? (
					<Link
						to="/order/depot"
						search={{ depot: depot.id }}
						className="group flex items-center justify-between px-4 py-3 text-xs font-medium tracking-[0.14em] text-accent uppercase"
					>
						Order from this depot
						<span
							aria-hidden
							className="ease-luxe transition-transform duration-250 group-active:translate-x-0.5"
						>
							→
						</span>
					</Link>
				) : (
					<p className="px-4 py-3 text-center text-xs text-muted-foreground">
						Opens on the next loading day
					</p>
				)}
			</footer>
		</article>
	);
}

function DepotCardSkeleton() {
	return (
		<div className="overflow-hidden rounded-xl border border-foreground/15 bg-card">
			<div className="flex items-center justify-between border-b border-foreground/15 px-4 py-3">
				<div className="flex flex-col gap-1.5">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-3 w-20" />
				</div>
				<Skeleton className="h-3 w-10" />
			</div>
			<div className="flex flex-col gap-3 px-4 py-4">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
			<div className="border-t border-foreground/15 p-3">
				<Skeleton className="h-5 w-40" />
			</div>
		</div>
	);
}
