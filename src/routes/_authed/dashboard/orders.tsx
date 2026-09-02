import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MICRO } from "@/components/dashboard/panel";
import { DataTable } from "@/components/data-table";
import {
	DepotOrderActions,
	DepotPayDialog,
} from "@/components/orders/depot-order-actions";
import { Button } from "@/components/ui/button";
import { usePageVisible } from "@/hooks/use-page-visible";
import {
	api,
	describePriceWindow,
	type OrderRecord,
	type OrderStatus,
	type OrdersListParams,
	type OrdersListResult,
} from "@/lib/api";
import { LIVE_PAYMENT_MS, visibleRefetch } from "@/lib/live-refetch";
import type { AppColumnDef } from "@/lib/table";
import { formatNaira } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/dashboard/orders")({
	component: OrdersPage,
	head: () => ({
		meta: [
			{ title: "Depot orders | Soroman Energy" },
			{
				name: "description",
				content:
					"View and manage your depot fuel orders — pay invoices, track loading, and reorder.",
			},
		],
	}),
});

/** Plain-word label for each lifecycle status, shown in the chip and filters. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
	awaiting_payment: "Awaiting payment",
	paid: "Paid",
	released: "Released",
	loading: "Loading",
	loaded: "Completed",
	cancelled: "Cancelled",
	expired: "Expired",
};

/** Chip tone per status: payment warns, movement reads neutral, done wins. */
export function orderStatusTone(status: OrderStatus): string {
	if (status === "cancelled") {
		return "border-destructive/30 bg-destructive/10 text-destructive";
	}
	if (status === "awaiting_payment") {
		return "border-amber-500/40 bg-amber-500/10 text-amber-600";
	}
	if (status === "loaded") {
		return "border-accent/40 bg-accent/15 text-accent";
	}
	return "border-foreground/15 bg-muted/50 text-muted-foreground";
}

type FilterKey =
	| "all"
	| "awaiting"
	| "active"
	| "completed"
	| "cancelled"
	| "expired";

/**
 * Filter tabs. Completed / cancelled / expired / awaiting map 1:1 to a
 * backend status; "in motion" spans paid→loading so it fetches a wider page
 * and narrows client-side (the list endpoint takes a single status).
 */
const FILTERS: {
	key: FilterKey;
	label: string;
	status?: OrderStatus;
	match: (s: OrderStatus) => boolean;
}[] = [
	{ key: "all", label: "All", match: () => true },
	{
		key: "awaiting",
		label: "Awaiting payment",
		status: "awaiting_payment",
		match: (s) => s === "awaiting_payment",
	},
	{
		key: "active",
		label: "In motion",
		match: (s) =>
			s === "awaiting_payment" ||
			s === "paid" ||
			s === "released" ||
			s === "loading",
	},
	{
		key: "completed",
		label: "Completed",
		status: "loaded",
		match: (s) => s === "loaded",
	},
	{
		key: "cancelled",
		label: "Cancelled",
		status: "cancelled",
		match: (s) => s === "cancelled",
	},
	{
		key: "expired",
		label: "Expired",
		status: "expired",
		match: (s) => s === "expired",
	},
];

const PAGE_SIZE = 10;
/** Wider fetch for the multi-status "in motion" tab (single-status API). */
const ACTIVE_FETCH_LIMIT = 100;

const describeLines = (order: OrderRecord) =>
	order.lines
		.map((l) => `${l.quantity.toLocaleString()} L ${l.abbreviation}`)
		.join(" · ");

const formatDate = (iso?: string) =>
	iso
		? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "medium" })
		: "—";

/** Stable column defs — module-level so useReactTable never re-creates them. */
const columns: AppColumnDef<OrderRecord>[] = [
	{
		accessorKey: "id",
		header: "Reference",
		cell: ({ row }) => (
			<span className="font-medium tabular-nums">{row.original.id}</span>
		),
	},
	{
		id: "product",
		header: "Product",
		cell: ({ row }) => (
			<span className="block max-w-56 truncate">
				{describeLines(row.original)}
			</span>
		),
	},
	{
		accessorKey: "depot_name",
		header: "Depot",
		cell: ({ row }) => (
			<span className="text-muted-foreground">{row.original.depot_name}</span>
		),
	},
	{
		id: "quantity",
		header: "Quantity",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="tabular-nums">
				{row.original.lines
					.reduce((sum, l) => sum + l.quantity, 0)
					.toLocaleString()}{" "}
				L
			</span>
		),
	},
	{
		accessorKey: "total",
		header: "Total",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="tabular-nums">{formatNaira(row.original.total)}</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<span
				className={cn(
					"inline-block rounded-full border px-2 py-0.5 text-[0.6rem] font-medium tracking-widest uppercase",
					orderStatusTone(row.original.status),
				)}
			>
				{ORDER_STATUS_LABEL[row.original.status]}
			</span>
		),
	},
	{
		accessorKey: "placed_at",
		header: "Placed",
		cell: ({ row }) => (
			<span className="text-muted-foreground tabular-nums">
				{formatDate(row.original.placed_at)}
			</span>
		),
	},
	{
		id: "actions",
		header: () => <span className="sr-only">Actions</span>,
		meta: { className: "w-12 text-right" },
		cell: ({ row }) => <DepotOrderActions order={row.original} />,
	},
];

/**
 * Depot orders desk: purpose line, pipeline counts, needs-attention strip for
 * unpaid invoices, then the full history table. Counts come from lightweight
 * status-filtered list calls (pagination.total); the table keeps its own
 * paginated query.
 */
function OrdersPage() {
	const navigate = useNavigate();
	const pageVisible = usePageVisible();
	const [filter, setFilter] = useState<FilterKey>("all");
	const [page, setPage] = useState(1);
	const [payOrder, setPayOrder] = useState<OrderRecord | null>(null);

	const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
	const listParams: OrdersListParams =
		filter === "active"
			? { page: 1, limit: ACTIVE_FETCH_LIMIT }
			: { page, limit: PAGE_SIZE, status: active.status };

	const { data, isLoading } = useQuery({
		queryKey: ["orders", listParams],
		queryFn: () => api.orders.list(listParams),
		refetchInterval: (query) => {
			const result = query.state.data as OrdersListResult | undefined;
			const hasUnpaid = result?.orders.some(
				(o) => o.status === "awaiting_payment",
			);
			return visibleRefetch(
				pageVisible,
				hasUnpaid ? LIVE_PAYMENT_MS : false,
			);
		},
		refetchIntervalInBackground: false,
	});

	const attentionQuery = useQuery({
		queryKey: ["orders", "attention"],
		queryFn: () =>
			api.orders.list({ status: "awaiting_payment", page: 1, limit: 10 }),
		refetchInterval: visibleRefetch(pageVisible, LIVE_PAYMENT_MS),
		refetchIntervalInBackground: false,
	});

	// Lightweight totals for the pipeline cards — one status each (in-motion
	// sums paid + released + loading).
	const countQueries = useQueries({
		queries: (
			[
				{ key: "awaiting", status: "awaiting_payment" as const },
				{ key: "paid", status: "paid" as const },
				{ key: "released", status: "released" as const },
				{ key: "loading", status: "loading" as const },
				{ key: "completed", status: "loaded" as const },
				{ key: "expired", status: "expired" as const },
			] as const
		).map(({ key, status }) => ({
			queryKey: ["orders", "count", key],
			queryFn: () => api.orders.list({ status, page: 1, limit: 1 }),
			staleTime: 30_000,
		})),
	});

	const counts = useMemo(() => {
		const totalOf = (i: number) => countQueries[i]?.data?.pagination.total ?? 0;
		return {
			awaiting: totalOf(0),
			active: totalOf(0) + totalOf(1) + totalOf(2) + totalOf(3),
			completed: totalOf(4),
			expired: totalOf(5),
		};
	}, [countQueries]);

	const attention = attentionQuery.data?.orders ?? [];

	const rows = (data?.orders ?? []).filter((o) => active.match(o.status));
	const pagination = data?.pagination;
	// "In motion" fetches a wider unpaginated slice and filters client-side —
	// the list API takes a single status — so the pager only applies to the
	// status tabs that map 1:1 to a server filter (including All).
	const showPager = filter !== "active" && Boolean(pagination);

	const selectFilter = (key: FilterKey) => {
		setFilter(key);
		setPage(1);
	};

	return (
		<div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 md:pt-8 md:pb-14 lg:px-8">
			<header
				className="snapshot-rise flex flex-wrap items-end justify-between gap-4"
				style={{ animationDelay: "0ms" }}
			>
				<div>
					<div className="flex items-center gap-4">
						<span className="h-px w-8 bg-foreground md:w-12" aria-hidden />
						<span className={cn(MICRO, "text-muted-foreground")}>
							Depot orders
						</span>
					</div>
					<h1 className="mt-5 text-3xl leading-[1.05] tracking-tight md:text-4xl">
						Depot{" "}
						<em className="font-semibold text-accent not-italic">orders</em>.
					</h1>
					<p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
						Fuel at today&apos;s prices — order, pay by transfer,
						track to the gate.
					</p>
				</div>
				<Button nativeButton={false} render={<Link to="/order/depot" />}>
					New depot order
				</Button>
			</header>

			<div
				className="snapshot-rise mt-8 grid grid-cols-2 gap-2.5 md:grid-cols-4"
				style={{ animationDelay: "60ms" }}
				role="group"
				aria-label="Pipeline snapshot"
			>
				<PipelineCard
					label="Awaiting payment"
					value={counts.awaiting}
					warn
					pressed={filter === "awaiting"}
					onClick={() => selectFilter("awaiting")}
				/>
				<PipelineCard
					label="In motion"
					value={counts.active}
					pressed={filter === "active"}
					onClick={() => selectFilter("active")}
				/>
				<PipelineCard
					label="Completed"
					value={counts.completed}
					pressed={filter === "completed"}
					onClick={() => selectFilter("completed")}
				/>
				<PipelineCard
					label="Expired"
					value={counts.expired}
					pressed={filter === "expired"}
					onClick={() => selectFilter("expired")}
				/>
			</div>

			{attention.length > 0 && (
				<section
					className="snapshot-rise mt-5 overflow-hidden rounded-xl border border-amber-500/35 bg-amber-500/8"
					style={{ animationDelay: "90ms" }}
					aria-label="Needs your attention"
				>
					<div className="flex items-center justify-between gap-3 border-b border-amber-500/25 px-4 py-3 sm:px-5">
						<span className="text-[0.7rem] font-semibold tracking-[0.12em] text-amber-700 uppercase">
							Needs your attention
						</span>
						<span className="font-mono text-[0.65rem] tracking-widest text-amber-700/80 uppercase tabular-nums">
							{attention.length} unpaid
						</span>
					</div>
					<div>
						{attention.map((order) => (
							<button
								key={order.id}
								type="button"
								onClick={() => setPayOrder(order)}
								className="ease-luxe grid w-full cursor-pointer grid-cols-1 items-center gap-2 border-b border-amber-500/20 px-4 py-3.5 text-left transition-colors duration-250 last:border-b-0 hover:bg-white/50 sm:grid-cols-[1fr_auto_auto] sm:gap-4 sm:px-5"
							>
								<div className="min-w-0">
									<p className="text-sm font-semibold tabular-nums">
										{order.id}
									</p>
									<p className="mt-0.5 text-xs text-amber-900/75">
										{describeLines(order)}
										{order.depot_name ? ` · ${order.depot_name}` : ""}
										{describePriceWindow(order.lock_expires_at)
											? ` · ${describePriceWindow(order.lock_expires_at)}`
											: ""}
									</p>
								</div>
								<p className="text-sm font-bold tabular-nums">
									{formatNaira(order.total)}
								</p>
								<span className="text-xs font-semibold text-amber-700 sm:text-right">
									Pay now →
								</span>
							</button>
						))}
					</div>
				</section>
			)}

			{payOrder && (
				<DepotPayDialog
					order={payOrder}
					open
					onOpenChange={(open) => {
						if (!open) setPayOrder(null);
					}}
				/>
			)}

			<div
				className="snapshot-rise mt-8 flex flex-wrap gap-2"
				style={{ animationDelay: "110ms" }}
			>
				{FILTERS.map((f) => (
					<button
						key={f.key}
						type="button"
						onClick={() => selectFilter(f.key)}
						className={cn(
							"cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200",
							filter === f.key
								? "border-foreground bg-foreground text-background"
								: "border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
						)}
					>
						{f.label}
					</button>
				))}
			</div>

			<div className="snapshot-rise mt-6" style={{ animationDelay: "130ms" }}>
				<DataTable
					columns={columns}
					data={rows}
					isLoading={isLoading}
					emptyTitle={
						filter === "all" && (!data || data.pagination.total === 0)
							? "No depot orders yet."
							: `No ${active.label.toLowerCase()} orders.`
					}
					emptyDescription={
						filter === "all" && (!data || data.pagination.total === 0)
							? "Order at today's depot price and pay by bank transfer — progress lives here."
							: undefined
					}
					emptyAction={
						filter === "all" && (!data || data.pagination.total === 0) ? (
							<Button nativeButton={false} render={<Link to="/order/depot" />}>
								Place your first order
							</Button>
						) : undefined
					}
					onRowClick={(order) =>
						navigate({
							to: "/dashboard/orders/$orderId",
							params: { orderId: order.id },
						})
					}
					pagination={
						showPager && pagination
							? {
									page: pagination.page,
									pages: pagination.pages,
									total: pagination.total,
									label: "orders",
									alwaysShow: true,
									onPageChange: setPage,
								}
							: undefined
					}
				/>
			</div>
		</div>
	);
}

function PipelineCard({
	label,
	value,
	warn,
	pressed,
	onClick,
}: {
	label: string;
	value: number;
	warn?: boolean;
	pressed: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={pressed}
			className={cn(
				"ease-luxe cursor-pointer rounded-xl border bg-card p-3.5 text-left transition-colors duration-220 sm:p-4",
				pressed
					? "border-accent/40 bg-accent/10"
					: "border-foreground/15 hover:border-foreground/30",
			)}
		>
			<span
				className={cn(
					"block text-2xl font-semibold tracking-tight tabular-nums",
					warn && value > 0 && "text-amber-600",
				)}
			>
				{value}
			</span>
			<span className="mt-1 block text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
				{label}
			</span>
		</button>
	);
}
