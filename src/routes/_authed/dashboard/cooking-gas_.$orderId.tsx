import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	Check,
	CircleAlert,
	Copy,
	MessageCircle,
	PackagePlus,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { usePageVisible } from "@/hooks/use-page-visible";
import { WHATSAPP_URL } from "@/lib/company";
import { getMyLpgOrder, type LpgOrderRequest } from "@/lib/cooking-gas/api";
import { requestOrderLiveMs, visibleRefetch } from "@/lib/live-refetch";
import { formatNaira } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

import { CG_STATUS_LABELS, cgStatusTone } from "./cooking-gas";

export const Route = createFileRoute(
	"/_authed/dashboard/cooking-gas_/$orderId",
)({
	beforeLoad: () => {
		if (!env.VITE_COOKING_GAS_ENABLED) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: CookingGasOrderDetailPage,
	head: ({ params }) => ({
		meta: [
			{ title: `Cooking gas ${params.orderId} | Soroman Energy` },
			{
				name: "description",
				content:
					"Cooking gas request details — review status, quoted price, and payment instructions.",
			},
		],
	}),
});

const formatDate = (iso?: string) =>
	iso
		? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "medium" })
		: undefined;

/**
 * Cooking-gas request detail — next-step (wait / pay) + request facts in the
 * main column; sticky Actions + Progress in the rail. Same chrome as depot
 * and Dangote detail.
 */
function CookingGasOrderDetailPage() {
	const { orderId } = Route.useParams();
	const pageVisible = usePageVisible();

	const {
		data: request,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["cooking-gas-order", orderId],
		queryFn: () => getMyLpgOrder(Number(orderId)),
		refetchInterval: (query) => {
			const data = query.state.data as LpgOrderRequest | undefined;
			return visibleRefetch(pageVisible, requestOrderLiveMs(data));
		},
		refetchIntervalInBackground: false,
		retry: false,
	});

	return (
		<div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 md:pt-8 md:pb-14 lg:px-8">
			<DetailBack
				to="/dashboard/cooking-gas"
				label="Back to cooking gas orders"
			/>

			{isLoading ? (
				<OrderDetailSkeleton />
			) : isError || !request ? (
				<div className="mt-6 rounded-xl border border-dashed border-foreground/15 p-10 text-center">
					<p className="text-sm font-medium">We couldn't find that request.</p>
					<p className="mt-1 text-sm text-muted-foreground">
						It may have been removed, or the link is out of date.
					</p>
					<Button
						className="mt-5"
						nativeButton={false}
						render={<Link to="/dashboard/cooking-gas" />}
					>
						Back to cooking gas orders
					</Button>
				</div>
			) : (
				<RequestDetail request={request} />
			)}
		</div>
	);
}

function RequestDetail({ request }: { request: LpgOrderRequest }) {
	const quoted = request.status === "Approved";
	const unpaid = request.paymentStatus === "Unpaid";
	const quoteReady = quoted && unpaid;
	const underReview = request.status === "Pending Review";
	const terminal =
		request.status === "Rejected" || request.status === "Cancelled";
	const total =
		request.totalAmount != null ? Number(request.totalAmount) : null;

	const copyRef = async () => {
		try {
			await navigator.clipboard.writeText(request.requestNumber);
			toast.success("Reference copied");
		} catch {
			toast.error("Couldn't copy reference");
		}
	};

	const statusLabel = quoteReady
		? "Price ready"
		: (CG_STATUS_LABELS[request.status] ?? request.status);

	const headerMeta = [
		request.stationName || null,
		request.deliveryState || null,
		underReview ? "Submitted for review" : null,
		quoteReady ? "Price ready — pay to confirm" : null,
		quoted && !unpaid ? "Paid" : null,
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
							{request.requestNumber}
						</span>
					</div>
					<h1 className="mt-4 text-2xl leading-tight tracking-tight md:text-3xl">
						{request.cylinderQuantity} × {request.cylinderSizeKg}kg cooking gas
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">{headerMeta}</p>
				</div>
				<span
					className={cn(
						"mt-1 inline-block rounded-full border px-2.5 py-1 text-[0.65rem] font-medium tracking-widest uppercase",
						quoteReady
							? "border-accent/40 bg-accent/15 text-accent"
							: cgStatusTone(request.status),
					)}
				>
					{statusLabel}
				</span>
			</header>

			<div
				className="snapshot-rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
				style={{ animationDelay: "90ms" }}
			>
				<div className="min-w-0 space-y-6">
					{underReview && (
						<section className="rounded-xl border border-foreground/15 p-5">
							<p className={cn(MICRO, "text-muted-foreground")}>
								What&apos;s happening
							</p>
							<p className="mt-2.5 text-base font-medium tracking-tight">
								The Soroman team is reviewing and pricing this order.
							</p>
							<p className="mt-2 max-w-xl text-sm text-muted-foreground">
								Nothing to pay yet. When the price is ready, this page will show
								the total and transfer details. Typical turnaround is 1–2
								business days.
							</p>
						</section>
					)}

					{quoteReady && total != null && (
						<section className="overflow-hidden rounded-xl border border-accent/35 bg-card">
							<div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent/20 bg-accent/8 px-5 py-3.5">
								<span className={cn(MICRO, "text-accent")}>
									Next — pay to confirm
								</span>
								<span className="text-sm font-semibold tabular-nums">
									{formatNaira(total)}
								</span>
							</div>
							<div className="space-y-4 px-5 py-5">
								<dl className="grid gap-x-8 gap-y-3 text-xs sm:grid-cols-3">
									<div>
										<dt className="text-muted-foreground">Gas</dt>
										<dd className="mt-0.5 font-medium tabular-nums">
											{request.pricePerKg != null
												? `${formatNaira(Number(request.pricePerKg))}/kg`
												: "—"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Delivery</dt>
										<dd className="mt-0.5 font-medium tabular-nums">
											{request.deliveryPrice != null
												? formatNaira(Number(request.deliveryPrice))
												: "—"}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Cylinders</dt>
										<dd className="mt-0.5 font-medium tabular-nums">
											{request.cylinderQuantity} × {request.cylinderSizeKg}kg
										</dd>
									</div>
								</dl>


								<div>
									<p className={cn(MICRO, "text-muted-foreground")}>
										Pay by transfer
									</p>
									<p className="mt-2 text-sm text-muted-foreground">
										Message us on WhatsApp with reference{" "}
										<span className="font-medium text-foreground">
											{request.requestNumber}
										</span>{" "}
										to get the bank account for this order — your payment is
										confirmed by Soroman once the transfer lands.
									</p>
									<a
										href={WHATSAPP_URL}
										target="_blank"
										rel="noreferrer"
										className="mt-3 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
									>
										Get payment details on WhatsApp →
									</a>
								</div>
							</div>
						</section>
					)}

					{quoted && !unpaid && (
						<section className="rounded-xl border border-accent/30 bg-accent/8 p-5">
							<p className={cn(MICRO, "text-accent")}>Quote paid</p>
							<p className="mt-2 text-sm font-medium tabular-nums">
								{total != null ? formatNaira(total) : "—"} confirmed
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Delivery is being arranged for {request.cylinderQuantity} ×{" "}
								{request.cylinderSizeKg}kg.
							</p>
						</section>
					)}

					{terminal && (
						<section className="rounded-xl border border-destructive/25 bg-destructive/5 p-5">
							<p className={cn(MICRO, "text-destructive")}>
								{CG_STATUS_LABELS[request.status] ?? request.status}
							</p>
							<p className="mt-2 text-sm text-muted-foreground">
								{request.status === "Cancelled"
									? "You withdrew this order. Place a new one anytime."
									: "This order didn't pass review. Contact support if you need help."}
							</p>
						</section>
					)}

					<section className="rounded-xl border border-foreground/15 p-5">
						<p className={cn(MICRO, "text-muted-foreground")}>Request</p>
						<dl className="mt-4 grid gap-x-8 gap-y-3 text-xs sm:grid-cols-3">
							<div>
								<dt className="text-muted-foreground">Station</dt>
								<dd className="mt-0.5 font-medium">
									{request.stationName ?? "—"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Cylinders</dt>
								<dd className="mt-0.5 font-medium tabular-nums">
									{request.cylinderQuantity} × {request.cylinderSizeKg}kg
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Quote</dt>
								<dd className="mt-0.5 font-medium tabular-nums">
									{total != null ? formatNaira(total) : "Awaiting"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Delivery</dt>
								<dd className="mt-0.5 font-medium">
									{request.deliveryState || "—"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Submitted</dt>
								<dd className="mt-0.5 font-medium tabular-nums">
									{formatDate(request.createdAt) ?? "—"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Payment</dt>
								<dd className="mt-0.5 font-medium">
									{request.paymentStatus || "—"}
								</dd>
							</div>
							<div className="sm:col-span-3">
								<dt className="text-muted-foreground">Address</dt>
								<dd className="mt-0.5 font-medium">
									{request.deliveryAddress}
								</dd>
							</div>
						</dl>
					</section>
				</div>

				<DetailRail>
					<DetailRailCard title="Actions">
						<div className="space-y-1">
							<RailAction onClick={() => void copyRef()}>
								<Copy />
								Copy reference
							</RailAction>
							<Link to="/order/cooking-gas" className={railActionClass()}>
								<PackagePlus />
								Order again
							</Link>
							<RailAction href={WHATSAPP_URL}>
								<MessageCircle />
								Contact support
							</RailAction>
						</div>
					</DetailRailCard>

					<DetailRailCard title="Progress">
						<CookingGasTimeline request={request} />
					</DetailRailCard>
				</DetailRail>
			</div>
		</>
	);
}

function CookingGasTimeline({ request }: { request: LpgOrderRequest }) {
	if (request.status === "Rejected" || request.status === "Cancelled") {
		const terminal = request.status === "Cancelled" ? "Cancelled" : "Rejected";
		const note =
			request.status === "Cancelled"
				? "You withdrew this order."
				: "This order didn't pass review.";
		return (
			<ol className="space-y-4">
				<TimelineRow
					done
					label="Submitted"
					note={formatDate(request.createdAt)}
				/>
				<li className="flex items-start gap-3">
					<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
						<CircleAlert className="size-3.5" />
					</span>
					<span>
						<span className="block text-sm font-medium text-destructive">
							{terminal}
						</span>
						<span className="mt-0.5 block text-xs text-muted-foreground">
							{note}
						</span>
					</span>
				</li>
			</ol>
		);
	}

	const approved = request.status === "Approved";
	const paid = request.paymentStatus === "Paid";

	return (
		<ol className="space-y-4">
			<TimelineRow
				done
				label="Submitted"
				note={formatDate(request.createdAt)}
			/>
			<TimelineRow
				done={approved}
				label={approved ? "Price ready" : "Under review"}
				note={
					approved
						? "Delivery priced — review and pay."
						: "The Soroman team is pricing your delivery."
				}
			/>
			<TimelineRow
				done={paid}
				label="Payment"
				note={
					paid
						? "Payment received"
						: approved
							? "Pay the amount above to confirm."
							: undefined
				}
			/>
			<TimelineRow done={false} label="Out for delivery" />
			<TimelineRow done={false} label="Delivered" />
		</ol>
	);
}

function TimelineRow({
	done,
	label,
	note,
}: {
	done: boolean;
	label: string;
	note?: string;
}) {
	return (
		<li className="flex items-start gap-3">
			<span
				className={
					done
						? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
						: "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-foreground/20"
				}
			>
				{done && <Check className="size-3" />}
			</span>
			<span>
				<span
					className={
						done
							? "block text-sm font-medium"
							: "block text-sm text-muted-foreground"
					}
				>
					{label}
				</span>
				{note && (
					<span className="mt-0.5 block text-xs text-muted-foreground">
						{note}
					</span>
				)}
			</span>
		</li>
	);
}
