import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/env";

import { formatPhoneForDisplay } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canonicalProduct, formatNaira, useCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

/**
 * THE front door for ordering — the "between 1 & 5" concept: a slim left
 * gutter (always a back control — dashboard when signed in, home as a guest),
 * a session row, and the three CHANNELS as boxes. Depot is one box, not one
 * per product — WHAT you're buying is the depot flow's own first step. Deep
 * links with intent (a depot in the URL, a reorder draft) jump straight into
 * /order/depot; this page is the generic start.
 *
 * Owns its chrome (session row + gutter), so the slim header stays off here.
 */
export const Route = createFileRoute("/_slim/order")({
	component: ChooseProductPage,
	head: () => ({
		meta: [
			{ title: "New order | Soroman Energy" },
			{
				name: "description",
				content:
					"Order depot fuel, Dangote delivery, or cooking gas from Soroman. Browse prices as a guest, then confirm with your phone.",
			},
		],
	}),
});

const MONO_LABEL =
	"font-mono text-[0.6rem] font-medium tracking-[0.12em] uppercase text-muted-foreground";

function ChooseProductPage() {
	const auth = useAuth();
	const { depots, products, isLoading } = useCatalog();

	// Cheapest live litre across open depots for the depot channel's "from"
	// price — PMS and AGO both live behind that one door, so the honest number
	// is the best of either. Matched through canonicalProduct, not the raw
	// abbreviation: depots that list petrol as "Petrol" or "Fuel" are still
	// selling PMS, and reading them literally left this box claiming no price
	// was published while the landing page showed those prices live.
	const fromPrice = useMemo(() => {
		const open = new Set(depots.filter((d) => d.is_open).map((d) => d.id));
		let best: number | null = null;
		for (const p of products) {
			if (!p.available || !open.has(p.depot_id) || p.price <= 0) continue;
			const key = canonicalProduct(p).key;
			if (key !== "PMS" && key !== "AGO") continue;
			if (best === null || p.price < best) best = p.price;
		}
		return best;
	}, [depots, products]);

	const customer = auth.status === "authed" ? auth.customer : null;
	const displayName =
		customer?.company_name ||
		customer?.name ||
		(customer ? formatPhoneForDisplay(customer.phone) : "");
	const initials =
		displayName
			.split(/\s+/)
			.map((w) => w[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?";

	return (
		<div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-6 px-4 pt-7 pb-16 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:px-6 md:gap-x-8">
			{/*
			 * The gutter: one back control — destination depends on session. Below
			 * sm the gutter column collapses, so the control moves inline into the
			 * session row rather than sitting alone above it on a line of its own.
			 */}
			<aside className="hidden sm:block">
				<BackControl authed={auth.status === "authed"} />
			</aside>

			<div className="min-w-0">
				{/* Session row: who's here, and the one action that fits. */}
				<div className="mb-7 flex min-h-11 flex-wrap items-center gap-3">
					<BackControl
						authed={auth.status === "authed"}
						className="sm:hidden"
					/>
					{customer ? (
						<>
							<div
								className="inline-flex items-center gap-2.5 rounded-full border border-foreground/15 bg-card py-1 pr-3.5 pl-1.5 text-sm font-medium"
								aria-label={`Signed in as ${displayName}`}
							>
								<span className="grid size-7 place-items-center rounded-full bg-accent/10 font-mono text-[0.62rem] font-semibold text-accent">
									{initials}
								</span>
								<span className="flex flex-col leading-tight">
									<small className="font-mono text-[0.58rem] tracking-[0.1em] text-muted-foreground uppercase">
										Signed in
									</small>
									<span>{displayName}</span>
								</span>
							</div>
							<Link
								to="/dashboard"
								className="ease-luxe ml-auto text-sm font-medium text-muted-foreground transition-colors duration-250 hover:text-foreground"
							>
								Dashboard
							</Link>
						</>
					) : (
						<div className="ml-auto flex items-center gap-4">
							<Link
								to="/register"
								className="ease-luxe text-sm font-medium text-muted-foreground transition-colors duration-250 hover:text-foreground"
							>
								Create account
							</Link>
							<Link
								to="/login"
								search={{ redirect: "/order" }}
								className="inline-flex min-h-9 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background"
							>
								Sign in
							</Link>
						</div>
					)}
				</div>

				<p className="font-mono text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">
					New order
				</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
					What are you ordering?
				</h1>
				<p className="mt-2.5 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
					Three ways to buy from Soroman. Pick the one that matches what you
					need — we handle the rest from there.
				</p>
				{!customer && (
					<p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
						You can browse prices as a guest.{" "}
						<Link
							to="/login"
							search={{ redirect: "/order" }}
							className="font-semibold text-accent hover:underline"
						>
							Sign in
						</Link>{" "}
						when you're ready to place or track an order.
					</p>
				)}

				<div className="mt-9 grid gap-3.5 lg:grid-cols-3">
					<ChannelBox
						to="/order/depot"
						idx="01"
						title="Buy from Soroman Depot"
						description="Buy any product from our depots across Nigeria at today's prices. Collect it yourself, or let us deliver it to you."
						priceLabel="Today's price"
						priceValue={
							isLoading
								? null
								: fromPrice !== null
									? `${formatNaira(fromPrice)}/L`
									: "Prices coming soon"
						}
						go="Order now →"
					/>
					<ChannelBox
						to="/order/dangote-delivery"
						idx="02"
						title="Dangote Delivery"
						description="Buy from Dangote Refinery directly through Soroman and have it delivered straight to your site — no queues, no hassle. Send your company details and we take it from there."
						priceLabel="Delivered to site"
						priceValue="Bulk orders"
						go="Order now →"
					/>
					<ChannelBox
						to="/order/cooking-gas"
						idx="03"
						title="Cooking Gas"
						description="Refill your cylinders without leaving the house. Pick the sizes you need, pay, and follow the delivery to your door."
						priceLabel={
							env.VITE_COOKING_GAS_ENABLED ? "Today's price" : "Availability"
						}
						priceValue={
							env.VITE_COOKING_GAS_ENABLED ? "₦4,500/cyl" : "Coming soon"
						}
						go={env.VITE_COOKING_GAS_ENABLED ? "Order now →" : "Coming soon"}
						comingSoon={!env.VITE_COOKING_GAS_ENABLED}
					/>
				</div>
			</div>
		</div>
	);
}

/** The circular back control, shared by the gutter and the mobile session row. */
function BackControl({
	authed,
	className,
}: {
	authed: boolean;
	className?: string;
}) {
	return (
		<Link
			to={authed ? "/dashboard" : "/"}
			aria-label={authed ? "Back to dashboard" : "Back to home"}
			className={cn(
				"ease-luxe flex size-11 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-card shadow-xs transition-colors duration-250 hover:border-foreground/30 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
				className,
			)}
		>
			<ArrowLeft className="size-5" />
		</Link>
	);
}

function ChannelBox({
	to,
	idx,
	title,
	description,
	priceLabel,
	priceValue,
	go,
	comingSoon = false,
}: {
	to: string;
	idx: string;
	title: string;
	description: string;
	priceLabel: string;
	priceValue: string | null;
	go: string;
	/** Non-navigating shell — no link, no endpoint traffic. */
	comingSoon?: boolean;
}) {
	const body = (
		<>
			<span className="font-mono text-xs font-semibold text-muted-foreground">
				{idx}
			</span>
			<h2 className="mt-4 text-lg font-semibold tracking-tight">{title}</h2>
			<p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
				{description}
			</p>
			<div className="mt-5 flex items-end justify-between gap-3 border-t border-dashed border-foreground/15 pt-4">
				<div>
					<div className={MONO_LABEL}>{priceLabel}</div>
					{priceValue === null ? (
						<Skeleton className="mt-1 h-5 w-24" />
					) : (
						<div className="mt-1 font-semibold tracking-tight tabular-nums">
							{priceValue}
						</div>
					)}
				</div>
				<span
					className={cn(
						"font-mono text-[0.68rem] font-semibold tracking-[0.1em] whitespace-nowrap uppercase",
						comingSoon
							? "text-muted-foreground/70"
							: "ease-luxe text-muted-foreground transition-colors duration-250 group-hover:text-accent",
					)}
				>
					{go}
				</span>
			</div>
		</>
	);

	if (comingSoon) {
		return (
			<div
				aria-disabled="true"
				className="flex flex-col rounded-xl border border-foreground/10 bg-card/70 p-5 opacity-70 lg:min-h-70"
			>
				{body}
			</div>
		);
	}

	return (
		<Link
			to={to}
			className="group ease-luxe flex flex-col rounded-xl border border-foreground/15 bg-card p-5 transition-all duration-250 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_12px_28px_rgba(0,0,0,0.06)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99] lg:min-h-70"
		>
			{body}
		</Link>
	);
}
