import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Check,
	Copy,
	MapPin,
	MessageCircle,
	RotateCcw,
	Truck,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MICRO } from "@/components/dashboard/panel";
import {
	DetailBack,
	DetailRail,
	DetailRailCard,
	RailAction,
	railActionClass,
} from "@/components/orders/detail-rail";
import { OrderDetailSkeleton } from "@/components/orders/order-detail-skeleton";
import {
	canEditPickupTrucks,
	EditTrucksDialog,
	OrderTrucksPanel,
} from "@/components/orders/order-trucks-panel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { AccountRows, CopyAllButton } from "@/components/virtual-account";
import { usePageVisible } from "@/hooks/use-page-visible";
import {
	api,
	describePriceWindow,
	type OrderDetail,
	type TrackingStage,
} from "@/lib/api";
import { WHATSAPP_URL } from "@/lib/company";
import { ApiError } from "@/lib/http";
import { depotOrderLiveMs, visibleRefetch } from "@/lib/live-refetch";
import { seedDraftFromOrder } from "@/lib/order-draft";
import { formatNaira } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

import { ORDER_STATUS_LABEL, orderStatusTone } from "./orders";

export const Route = createFileRoute("/_authed/dashboard/orders_/$orderId")({
	component: OrderDetailPage,
	head: ({ params }) => ({
		meta: [
			{ title: `Order ${params.orderId} | Soroman Energy` },
			{
				name: "description",
				content:
					"Depot order details — invoice, payment, trucks, and live fulfilment progress.",
			},
		],
	}),
});

/** The six tracking stages, in order — mirrors the public tracking page. */
const STAGES: { key: TrackingStage; label: string }[] = [
	{ key: "received", label: "Order received" },
	{ key: "payment_confirmed", label: "Payment confirmed" },
	{ key: "processing", label: "Processing" },
	{ key: "released", label: "Released" },
	{ key: "loading", label: "Loading" },
	{ key: "completed", label: "Completed" },
];

const describeLines = (order: OrderDetail) =>
	order.lines
		.map((l) => `${l.quantity.toLocaleString()} L ${l.abbreviation}`)
		.join(" · ");

const formatStamp = (iso: string) =>
	new Date(iso).toLocaleString("en-NG", {
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
	});

const formatDate = (iso?: string) =>
	iso
		? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "medium" })
		: "—";

/**
 * Depot order detail — next-step (pay / status) + facts in the main column;
 * sticky Actions + Progress (+ trucks stay with the order body) in the rail.
 */
function OrderDetailPage() {
	const { orderId } = Route.useParams();
	const pageVisible = usePageVisible();

	const {
		data: order,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["order", orderId],
		queryFn: () => api.orders.get(orderId),
		// Live only while payment/fulfilment can change, and only while this tab
		// is focused — parked detail tabs were hammering by-ref every 10s.
		refetchInterval: (query) => {
			const data = query.state.data as OrderDetail | null | undefined;
			return visibleRefetch(pageVisible, depotOrderLiveMs(data?.status));
		},
		refetchIntervalInBackground: false,
		retry: false,
	});

	return (
		<div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 md:pt-8 md:pb-14 lg:px-8">
			<DetailBack to="/dashboard/orders" label="Back to depot orders" />

			{isLoading ? (
				<OrderDetailSkeleton />
			) : isError || !order ? (
				<div className="mt-6 rounded-xl border border-dashed border-foreground/15 p-10 text-center">
					<p className="text-sm font-medium">We couldn't find that order.</p>
					<p className="mt-1 text-sm text-muted-foreground">
						It may belong to another account, or the link is out of date.
					</p>
					<Button
						className="mt-5"
						nativeButton={false}
						render={<Link to="/dashboard/orders" />}
					>
						Back to my orders
					</Button>
				</div>
			) : (
				<OrderDetailView order={order} />
			)}
		</div>
	);
}

function OrderDetailView({ order }: { order: OrderDetail }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [cancelOpen, setCancelOpen] = useState(false);
	const [trucksOpen, setTrucksOpen] = useState(false);

	const unpaid = order.status === "awaiting_payment";
	const cancelled = order.status === "cancelled";
	const canEditTrucks = canEditPickupTrucks(order);
	const inMotion =
		order.status === "paid" ||
		order.status === "released" ||
		order.status === "loading";

	const invalidateLists = () => {
		void queryClient.invalidateQueries({ queryKey: ["orders"] });
		void queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
		void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
	};

	const cancel = useMutation({
		mutationFn: () => api.orders.cancelByRef(order.id),
		onSuccess: (updated) => {
			queryClient.setQueryData(["order", order.id], updated);
			invalidateLists();
			setCancelOpen(false);
		},
	});

	const reorder = () => {
		seedDraftFromOrder(order);
		void navigate({ to: "/order/depot" });
	};

	const copyRef = async () => {
		try {
			await navigator.clipboard.writeText(order.id);
			toast.success("Reference copied");
		} catch {
			toast.error("Couldn't copy reference");
		}
	};

	const fulfilment = order.loading?.type === "delivery" ? "Delivery" : "Pickup";
	const headerMeta = [
		order.depot_name,
		fulfilment,
		`Placed ${formatDate(order.placed_at)}`,
		unpaid ? describePriceWindow(order.lock_expires_at) : null,
		order.payment_status === "paid" ? "Paid" : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<>
			<header
				className="snapshot-rise mt-6 flex flex-wrap items-start justify-between gap-4"
				style={{ animationDelay: "0ms" }}
			>
				<div>
					<div className="flex items-center gap-4">
						<span className="h-px w-8 bg-foreground md:w-12" aria-hidden />
						<span className={cn(MICRO, "text-muted-foreground tabular-nums")}>
							{order.id}
						</span>
					</div>
					<h1 className="mt-4 text-2xl leading-tight tracking-tight tabular-nums md:text-3xl">
						{describeLines(order)}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">{headerMeta}</p>
				</div>
				<span
					className={cn(
						"mt-1 inline-block rounded-full border px-2.5 py-1 text-[0.65rem] font-medium tracking-widest uppercase",
						orderStatusTone(order.status),
					)}
				>
					{ORDER_STATUS_LABEL[order.status]}
				</span>
			</header>

			<div
				className="snapshot-rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
				style={{ animationDelay: "90ms" }}
			>
				<div className="min-w-0 space-y-6">
					{/* Next step — pay, or a quiet status callout while in motion. */}
					{unpaid && (
						<section className="overflow-hidden rounded-xl border border-amber-500/35 bg-card">
							<div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/25 px-5 py-3.5">
								<span className={cn(MICRO, "text-amber-700")}>
									Next — pay while your price is valid
								</span>
								<span className="text-sm font-semibold tabular-nums">
									{formatNaira(order.total)} due
								</span>
							</div>
							<div className="space-y-4 px-5 py-5">
								{order.account ? (
									<div>
										<div className="flex items-center justify-between gap-3">
											<p className={cn(MICRO, "text-muted-foreground")}>
												Transfer to your Soroman account
											</p>
											<CopyAllButton account={order.account} />
										</div>
										<AccountRows
											account={order.account}
											className="mt-3 border-foreground/15"
										/>
										<div className="mt-3 flex items-center gap-2 border-t border-foreground/10 pt-3">
											<span
												className="live-dot size-2 shrink-0 rounded-full bg-accent"
												aria-hidden
											/>
											<span className="text-xs text-muted-foreground">
												Listening for your transfer — updates the moment it
												lands.
											</span>
										</div>
									</div>
								) : (
									<p className="text-xs text-muted-foreground">
										Transfer details aren&apos;t available yet. Try refreshing.
									</p>
								)}
							</div>
						</section>
					)}

					{inMotion && (
						<section className="rounded-xl border border-accent/30 bg-accent/8 p-5">
							<p className={cn(MICRO, "text-accent")}>What&apos;s happening</p>
							<p className="mt-2 text-sm font-medium">
								{order.note ||
									(order.status === "loading"
										? "Loading is in progress at the depot."
										: order.status === "released"
											? "Released — ready for loading at the gate."
											: "Payment confirmed — the depot is processing your order.")}
							</p>
						</section>
					)}

					{cancelled && (
						<section className="rounded-xl border border-destructive/25 bg-destructive/5 p-5">
							<p className={cn(MICRO, "text-destructive")}>Cancelled</p>
							<p className="mt-2 text-sm text-muted-foreground">
								This order was cancelled. Reorder anytime at today&apos;s price.
							</p>
						</section>
					)}

					<section className="rounded-xl border border-foreground/15 p-5">
						<p className={cn(MICRO, "text-muted-foreground")}>Order summary</p>
						<dl className="mt-4 divide-y divide-foreground/10">
							{order.lines.map((line, i) => (
								<div
									key={i}
									className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0"
								>
									<dt className="text-sm">
										{line.name}{" "}
										<span className="text-muted-foreground">
											· {line.quantity.toLocaleString()} L
											{line.unit_price > 0 &&
												` @ ${formatNaira(line.unit_price)}/L`}
										</span>
									</dt>
									<dd className="text-sm font-medium tabular-nums">
										{formatNaira(line.unit_price * line.quantity)}
									</dd>
								</div>
							))}
							<div className="flex items-baseline justify-between gap-4 py-2.5">
								<dt className="text-sm font-medium">Total</dt>
								<dd className="text-base font-semibold tabular-nums">
									{formatNaira(order.total)}
								</dd>
							</div>
						</dl>

						<dl className="mt-4 grid gap-x-8 gap-y-3 border-t border-foreground/10 pt-4 text-xs sm:grid-cols-3">
							<div>
								<dt className="text-muted-foreground">Depot</dt>
								<dd className="mt-0.5 font-medium">{order.depot_name}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Fulfilment</dt>
								<dd className="mt-0.5 font-medium">
									{order.loading?.type === "delivery"
										? "Delivery"
										: "Pickup at depot"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Payment</dt>
								<dd className="mt-0.5 font-medium">
									{order.payment_status === "paid" ? "Paid" : "Unpaid"}
								</dd>
							</div>
							{order.loading?.type === "delivery" && (
								<div className="sm:col-span-3">
									<dt className="text-muted-foreground">Delivery address</dt>
									<dd className="mt-0.5 font-medium">
										{order.loading.address || "—"}
										{order.loading.state && (
											<span className="text-muted-foreground">
												{" "}
												· {order.loading.state}
											</span>
										)}
									</dd>
								</div>
							)}
						</dl>
					</section>

					<OrderTrucksPanel
						order={order}
						onEdit={canEditTrucks ? () => setTrucksOpen(true) : undefined}
					/>
				</div>

				<DetailRail>
					<DetailRailCard title="Actions">
						<div className="space-y-1">
							{canEditTrucks && (
								<RailAction onClick={() => setTrucksOpen(true)}>
									<Truck />
									{order.trucks.length === 0 ? "Add trucks" : "Edit trucks"}
								</RailAction>
							)}
							{unpaid && (
								<>
									<div className="my-2 h-px bg-foreground/10" />
									<RailAction destructive onClick={() => setCancelOpen(true)}>
										<XCircle />
										Cancel order
									</RailAction>
								</>
							)}
							<RailAction onClick={reorder}>
								<RotateCcw />
								Reorder
							</RailAction>
							{!cancelled && (
								<Link
									to="/t/$ref"
									params={{ ref: order.id }}
									className={railActionClass()}
								>
									<MapPin />
									Track live
								</Link>
							)}
							<RailAction onClick={() => void copyRef()}>
								<Copy />
								Copy reference
							</RailAction>
							<RailAction href={WHATSAPP_URL}>
								<MessageCircle />
								Contact support
							</RailAction>
						</div>
					</DetailRailCard>

					<DetailRailCard title="Progress">
						{cancelled ? (
							<p className="text-sm text-muted-foreground">
								This order was cancelled.
							</p>
						) : order.stage ? (
							<Timeline order={order} />
						) : (
							<p className="text-sm text-muted-foreground">
								Progress appears here once the order is confirmed.
							</p>
						)}
					</DetailRailCard>
				</DetailRail>
			</div>

			<EditTrucksDialog
				order={order}
				open={trucksOpen}
				onOpenChange={setTrucksOpen}
			/>

			<Dialog
				open={cancelOpen}
				onOpenChange={(next) => {
					if (cancel.isPending) return;
					setCancelOpen(next);
					if (!next) cancel.reset();
				}}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Cancel {order.id}?</DialogTitle>
						<DialogDescription>
							Releases the reserved stock and today&apos;s price. This
							can&apos;t be undone — reorder if you change your mind.
						</DialogDescription>
					</DialogHeader>
					{cancel.isError && (
						<p className="px-5 text-xs text-destructive">
							{cancel.error instanceof ApiError
								? cancel.error.message
								: "Could not cancel this order."}
						</p>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							className="cursor-pointer"
							disabled={cancel.isPending}
							onClick={() => setCancelOpen(false)}
						>
							Keep order
						</Button>
						<Button
							variant="destructive"
							className="cursor-pointer"
							disabled={cancel.isPending}
							onClick={() => cancel.mutate()}
						>
							{cancel.isPending ? "Cancelling…" : "Cancel order"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function Timeline({ order }: { order: OrderDetail }) {
	const currentIndex = STAGES.findIndex((s) => s.key === order.stage);

	return (
		<ol>
			{STAGES.map((stage, i) => {
				const stamp = order.reached[stage.key];
				const isCurrent = i === currentIndex;
				const isDone =
					i < currentIndex || (isCurrent && stage.key === "completed");
				const isLast = i === STAGES.length - 1;

				return (
					<li key={stage.key} className="flex gap-4">
						<div className="flex w-4 flex-col items-center">
							<span
								aria-hidden
								className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
							>
								{isDone ? (
									<span className="flex size-4 items-center justify-center rounded-full bg-accent">
										<Check className="size-2.5 text-white" strokeWidth={3.5} />
									</span>
								) : isCurrent ? (
									<span className="live-dot size-2.5 rounded-full bg-accent" />
								) : (
									<span className="size-2 rounded-full border border-foreground/30" />
								)}
							</span>
							{!isLast && (
								<span
									aria-hidden
									className={cn(
										"mt-1 mb-1 w-px flex-1",
										i < currentIndex ? "bg-accent" : "bg-foreground/15",
									)}
								/>
							)}
						</div>

						<div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
							<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
								<p
									className={cn(
										"text-sm",
										isCurrent
											? "font-semibold"
											: isDone
												? "font-medium"
												: "text-muted-foreground/60",
									)}
									aria-current={isCurrent ? "step" : undefined}
								>
									{stage.label}
								</p>
								{stamp && (
									<time
										dateTime={stamp}
										className="text-xs text-muted-foreground tabular-nums"
									>
										{formatStamp(stamp)}
									</time>
								)}
							</div>
							{isCurrent && order.note && (
								<p className="mt-1 text-sm text-muted-foreground">
									{order.note}
								</p>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
