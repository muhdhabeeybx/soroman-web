import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MICRO, PANEL } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { CopyIconButton } from "@/components/virtual-account";
import {
	formatPriceValidUntil,
	type OrderRecord,
	type OrderStatus,
	type VirtualAccount,
} from "@/lib/api";
import { seedDraftFromOrder } from "@/lib/order-draft";
import { formatNaira } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

/**
 * The action-first hero: one prominent card that answers "what do I do now?"
 * by adapting to the customer's most urgent order —
 *   awaiting payment → the invoice: amount due, price countdown, the
 *                       account to transfer into, and a live "listening" pulse
 *                       that resolves the moment the transfer confirms;
 *   in motion        → the order's journey along the 5-stage tracker;
 *   nothing pending  → a calm prompt to start an order.
 * The parent picks the single order to feature and refetches while one is
 * unpaid, so this card flips itself from Invoice to In-motion on its own.
 */

const STEPS = [
	"Invoiced",
	"Paid",
	"Released",
	"Loading",
	"Completed",
] as const;

const STATUS_STEP: Partial<Record<OrderStatus, number>> = {
	awaiting_payment: 1,
	paid: 2,
	released: 3,
	loading: 4,
	loaded: 5,
};

const MOTION_LABEL: Partial<Record<OrderStatus, string>> = {
	paid: "Paid — preparing your order",
	released: "Released for loading",
	loading: "Loading at the depot",
	loaded: "Completed",
};

const describe = (o: OrderRecord) =>
	o.lines
		.map((l) => `${l.quantity.toLocaleString()} L ${l.abbreviation}`)
		.join(" · ");

export default function DashboardHero({
	order,
	account,
}: {
	order: OrderRecord | null;
	account: VirtualAccount | null;
}) {
	if (!order) return <CleanState />;
	if (order.status === "awaiting_payment")
		return <InvoiceHero order={order} account={account} />;
	return <MotionHero order={order} />;
}

function CleanState() {
	return (
		<section
			className={cn(
				PANEL,
				"flex flex-col items-start gap-5 px-6 py-8 sm:flex-row sm:items-center sm:justify-between",
			)}
			aria-label="Start an order"
		>
			<div>
				<span className={cn(MICRO, "text-muted-foreground")}>All clear</span>
				<p className="mt-2 text-xl font-semibold tracking-tight text-balance md:text-2xl">
					Nothing in motion. Ready when you are.
				</p>
				<p className="mt-1.5 text-sm text-muted-foreground">
					Order at today's depot price and pay by bank transfer.
				</p>
			</div>
			<Button size="lg" nativeButton={false} render={<Link to="/order" />}>
				Start an order
			</Button>
		</section>
	);
}

function InvoiceHero({
	order,
	account,
}: {
	order: OrderRecord;
	account: VirtualAccount | null;
}) {
	// Re-check the deadline periodically so the badge flips without a refresh.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(t);
	}, []);

	// Missing lock_expires_at is "unknown", not expired — the dashboard used to
	// label that as "Price expired" while still showing the transfer account.
	const expiresAtMs = order.lock_expires_at
		? Date.parse(order.lock_expires_at)
		: Number.NaN;
	const expired =
		Number.isFinite(expiresAtMs) && expiresAtMs <= now;
	const validUntil = formatPriceValidUntil(order.lock_expires_at);
	const badge = expired
		? "Price expired"
		: validUntil
			? `Price valid till ${validUntil}`
			: "Awaiting payment";

	return (
		<section
			className={cn(PANEL, "border-amber-600/40")}
			aria-label={`Invoice ${order.id} awaiting payment`}
		>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-600/25 px-6 py-4">
				<span className="rounded-full border border-amber-600/40 px-2.5 py-0.5 text-[0.65rem] tracking-[0.14em] whitespace-nowrap text-amber-600 uppercase dark:text-amber-500">
					{badge}
				</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					Invoice {order.id}
				</span>
			</div>

			<div className="px-6 pt-5 pb-6">
				<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
					<div>
						<p className="text-[0.65rem] tracking-[0.22em] text-muted-foreground uppercase">
							Amount due
						</p>
						<p className="mt-1.5 text-3xl leading-none font-semibold tracking-tight tabular-nums md:text-4xl">
							{formatNaira(order.total)}
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							{describe(order)} · {order.depot_name}
						</p>
					</div>
					{expired && (
						<Button
							size="lg"
							nativeButton={false}
							render={
								// Seeding the draft is what carries the "same order, today's
								// price" intent through /order's front-door redirect.
								<Link
									to="/order/depot"
									onClick={() => seedDraftFromOrder(order)}
								/>
							}
						>
							Re-price order
						</Button>
					)}
				</div>

				{!expired && (
					<div className="mt-6 rounded-lg border border-foreground/15 bg-muted/40 p-4">
						<p className="text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
							Transfer to the account for this order
						</p>
						{account ? (
							<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
								<span className="inline-flex items-center gap-2 whitespace-nowrap">
									<span className="text-lg font-semibold tracking-wide tabular-nums">
										{account.account_number}
									</span>
									<CopyIconButton
										value={account.account_number}
										label="Copy account number"
									/>
								</span>
								<span className="text-sm text-muted-foreground">
									{account.bank} · {account.account_name}
								</span>
							</div>
						) : (
							<p className="mt-2 text-sm text-muted-foreground">
								The payment account is on the order page.
							</p>
						)}
						<div className="mt-3 flex items-center gap-2 border-t border-foreground/10 pt-3">
							<span
								className="live-dot size-2 shrink-0 rounded-full bg-accent"
								aria-hidden
							/>
							<span className="text-xs text-muted-foreground">
								Listening for your transfer — this updates the moment it lands.
							</span>
						</div>
					</div>
				)}
			</div>

			<div className="flex items-center justify-end bg-muted/40 px-6 py-3">
				<Link
					to="/dashboard/orders/$orderId"
					params={{ orderId: order.id }}
					className="group text-xs whitespace-nowrap text-accent"
				>
					View order
					<span className="ease-luxe ml-1 inline-block transition-transform duration-220 group-hover:translate-x-0.5">
						→
					</span>
				</Link>
			</div>
		</section>
	);
}

function MotionHero({ order }: { order: OrderRecord }) {
	const done = STATUS_STEP[order.status] ?? 3;
	const label = MOTION_LABEL[order.status] ?? "In motion";

	return (
		<section className={PANEL} aria-label={`Order ${order.id} progress`}>
			<div className="flex items-center justify-between gap-4 border-b border-foreground/15 px-6 py-4">
				<span className={MICRO}>In motion</span>
				<span className="rounded-full border border-accent/40 px-2.5 py-0.5 text-[0.65rem] tracking-[0.14em] whitespace-nowrap text-accent uppercase">
					{label}
				</span>
			</div>

			<div className="px-6 pt-5 pb-6">
				<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
					<p className="text-2xl leading-none font-semibold tracking-tight tabular-nums md:text-3xl">
						{describe(order)}
					</p>
					<p className="text-sm text-muted-foreground">
						{order.id} · {order.depot_name}
					</p>
				</div>

				<div className="mt-6">
					<div
						className="relative h-4"
						role="img"
						aria-label={`Step ${done} of ${STEPS.length}: ${label}`}
					>
						<div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" />
						<div
							className="ease-luxe absolute top-1/2 left-0 h-px -translate-y-1/2 bg-accent transition-[width] duration-500"
							style={{ width: `${((done - 1) / (STEPS.length - 1)) * 100}%` }}
						/>
						{STEPS.map((step, i) => {
							const isCurrent = i === done - 1;
							const isDone = i < done;
							return (
								<span
									key={step}
									aria-hidden
									className={cn(
										"absolute top-1/2 -translate-x-1/2 -translate-y-1/2",
										isCurrent
											? "live-dot size-2 rounded-full bg-accent"
											: isDone
												? "h-3.5 w-0.5 bg-accent"
												: "h-2 w-px bg-foreground/30",
									)}
									style={{ left: `${(i / (STEPS.length - 1)) * 100}%` }}
								/>
							);
						})}
					</div>
					<div className="mt-1.5 flex justify-between text-[0.65rem] tracking-[0.12em] uppercase">
						{STEPS.map((step, i) => (
							<span
								key={step}
								className={cn(
									i === done - 1
										? "font-medium text-accent"
										: i < done
											? "text-muted-foreground"
											: "text-muted-foreground/50",
								)}
							>
								{step}
							</span>
						))}
					</div>
				</div>
			</div>

			<div className="flex items-center justify-end bg-muted/40 px-6 py-3">
				<Link
					to="/dashboard/orders/$orderId"
					params={{ orderId: order.id }}
					className="group text-xs whitespace-nowrap text-accent"
				>
					View order
					<span className="ease-luxe ml-1 inline-block transition-transform duration-220 group-hover:translate-x-0.5">
						→
					</span>
				</Link>
			</div>
		</section>
	);
}
