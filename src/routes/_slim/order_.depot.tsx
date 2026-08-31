import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CreditCard, Fuel, ListChecks, Truck, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import InvoiceStep from "@/components/order/invoice-step";
import LoadingStep from "@/components/order/loading-step";
import NextSteps from "@/components/order/next-steps";
import OrderStep from "@/components/order/order-step";
import ReviewStep from "@/components/order/review-step";
import VerifyStep, { type GuestDetails } from "@/components/order/verify-step";
import {
	WizardActions,
	WizardBack,
	type WizardCta,
	WizardHeading,
	type WizardStep,
	WizardStepper,
} from "@/components/order-wizard/chrome";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	api,
	type LoadingDetails,
	type OrderLine,
	type PlacedOrder,
	TRUCK_CAPACITY_LITRES,
	type TruckEntry,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
	cancelPendingOrderDraftClear,
	clearOrderDraft,
	type OrderDraft,
	readOrderDraft,
	scheduleOrderDraftClearOnLeave,
	writeOrderDraft,
} from "@/lib/order-draft";
import { formatNaira, useCatalog } from "@/lib/use-catalog";
import { useSettings } from "@/lib/use-settings";

/** The depot wizard's steps (payment stands alone after the order is created). */
type StepKey = "order" | "loading" | "verify" | "review" | "payment";

const searchSchema = z.object({
	depot: z.number().optional(),
});

/** The wizard's steps, in the shared card-wizard chrome. */
const DEPOT_STEPS: readonly WizardStep<StepKey>[] = [
	{ key: "order", label: "Order", icon: Fuel },
	{ key: "loading", label: "Loading", icon: Truck },
	{ key: "verify", label: "Your details", icon: UserRound },
	{ key: "review", label: "Review", icon: ListChecks },
	{ key: "payment", label: "Payment", icon: CreditCard },
];

const STEP_COPY: Partial<
	Record<StepKey, { title: string; description: string }>
> = {
	order: {
		title: "Order",
		description: "Select a depot and product, then the litres you need.",
	},
	loading: {
		title: "Loading",
		description: "Load with your trucks, or load with Soroman Trucks.",
	},
	verify: {
		title: "Your details",
		description:
			"Just your name and phone number — the order is saved against the number, no code needed.",
	},
	review: {
		title: "Review & order",
		description: "Confirm the details, then place your order at today's price.",
	},
};

/**
 * Declaring trucks is optional at every quantity — the depot collects plates
 * and the split at the gate. A split the buyer DOES start still has to be
 * coherent: each truck ≤ one tanker, and the litres summing to the line's
 * quantity. Delivery orders never carry trucks.
 */
const truckEntrySchema = z.object({
	plate: z.string(),
	quantity: z
		.number()
		.min(0)
		.max(
			TRUCK_CAPACITY_LITRES,
			`Each truck can carry at most ${TRUCK_CAPACITY_LITRES.toLocaleString()} L`,
		),
});

function pickupLineTrucksSchema(lineQty: number) {
	return z.array(truckEntrySchema).superRefine((entries, ctx) => {
		const filled = entries.filter((t) => t.quantity > 0);
		if (filled.length === 0) return;

		const sum = filled.reduce((s, t) => s + t.quantity, 0);
		if (sum !== lineQty) {
			ctx.addIssue({
				code: "custom",
				message: `Truck quantities (${sum.toLocaleString()} L) must sum to the order (${lineQty.toLocaleString()} L)`,
			});
		}
	});
}

function pickupTrucksValid(
	lines: OrderLine[],
	trucks: Record<number, TruckEntry[]>,
): boolean {
	return lines.every(
		(line) =>
			pickupLineTrucksSchema(line.quantity).safeParse(
				trucks[line.product_id] ?? [],
			).success,
	);
}

/**
 * Depot channel wizard — PMS/AGO at today's prices. The chooser at /order
 * points here; deep links with intent (depot search param, seeded draft)
 * also land here.
 */
export const Route = createFileRoute("/_slim/order_/depot")({
	validateSearch: searchSchema,
	component: OrderPage,
	head: () => ({
		meta: [
			{ title: "Order depot fuel | Soroman Energy" },
			{
				name: "description",
				content:
					"Order PMS or AGO at today's depot prices. Choose pickup or Soroman trucks, pay by bank transfer, and track to the gate.",
			},
		],
	}),
});

function OrderPage() {
	const navigate = useNavigate();
	const auth = useAuth();
	const isAuthed = auth.status === "authed";
	const { depot: depotParam } = Route.useSearch();
	const { depots, products, isLoading } = useCatalog();
	const { settings } = useSettings();

	const [step, setStep] = useState<StepKey>(
		() => readOrderDraft()?.step ?? "order",
	);
	const [chosenDepotId, setChosenDepotId] = useState<number | null>(
		() => readOrderDraft()?.depotId ?? null,
	);
	const [quantities, setQuantities] = useState<Record<number, number>>(
		() => readOrderDraft()?.quantities ?? {},
	);
	const [loading, setLoading] = useState<LoadingDetails>(
		() => readOrderDraft()?.loading ?? { type: "pickup" },
	);
	// Pickup only: the truck split the buyer declares per product line, keyed by
	// product id — the web equivalent of the WhatsApp bot's per-truck prompts.
	const [trucks, setTrucks] = useState<Record<number, TruckEntry[]>>(
		() => readOrderDraft()?.trucks ?? {},
	);
	const [companyName, setCompanyName] = useState<string>(
		() => readOrderDraft()?.companyName ?? "",
	);
	const [order, setOrder] = useState<PlacedOrder | null>(null);
	const [guest, setGuest] = useState<GuestDetails | null>(null);
	const [accountError, setAccountError] = useState<string | null>(null);
	const accountContinueRef = useRef<(() => Promise<void>) | null>(null);
	const [placeBusy, setPlaceBusy] = useState(false);
	const [placeError, setPlaceError] = useState<string | null>(null);

	// A saved default loading method pre-fills a FRESH order once settings
	// arrive — never one resumed from a draft, whose choice is the buyer's.
	const hadDraft = useRef(readOrderDraft() !== null);
	const appliedDefaultLoading = useRef(false);
	useEffect(() => {
		if (hadDraft.current || appliedDefaultLoading.current) return;
		if (!settings.default_loading) return;
		appliedDefaultLoading.current = true;
		setLoading(settings.default_loading);
	}, [settings.default_loading]);

	// Persist while you're in the wizard; wipe when you leave (not on refresh).
	// Deferred so React Strict Mode's fake unmount→remount can cancel the clear.
	useEffect(() => {
		cancelPendingOrderDraftClear();
		return () => {
			scheduleOrderDraftClearOnLeave();
		};
	}, []);

	useEffect(() => {
		if (order) return;
		const draft: OrderDraft = {
			depotId: chosenDepotId,
			quantities,
			loading,
			trucks,
			companyName,
			step: step === "loading" ? "loading" : "order",
		};
		writeOrderDraft(draft);
	}, [chosenDepotId, quantities, loading, trucks, companyName, step, order]);

	// Signed-in customers never land on the account step.
	useEffect(() => {
		if (isAuthed && step === "verify") setStep("review");
	}, [isAuthed, step]);

	const openDepots = useMemo(() => depots.filter((d) => d.is_open), [depots]);
	// Explicit choice > depot in the link > the buyer's saved default.
	const depot =
		openDepots.find(
			(d) =>
				d.id === (chosenDepotId ?? depotParam ?? settings.default_depot_id),
		) ??
		openDepots[0] ??
		null;
	const depotProducts = useMemo(
		() => (depot ? products.filter((p) => p.depot_id === depot.id) : []),
		[depot, products],
	);
	const states = useMemo(
		() => [...new Set(depots.map((d) => d.state))],
		[depots],
	);

	const lines = useMemo<OrderLine[]>(
		() =>
			depotProducts
				.filter((p) => p.available && (quantities[p.id] ?? 0) > 0)
				.map((p) => ({
					product_id: p.id,
					abbreviation: p.abbreviation,
					name: p.name,
					unit: p.unit,
					unit_price: p.price,
					quantity: quantities[p.id],
				})),
		[depotProducts, quantities],
	);
	const total = lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);

	// The order names a company on its ticket/invoice, so it's required — asked on
	// the first step (depot & product), matching the backend's required companyName.
	const companyProvided = companyName.trim() !== "";
	const orderComplete = total > 0 && companyProvided;
	const loadingComplete =
		loading.type === "pickup"
			? pickupTrucksValid(lines, trucks)
			: loading.state !== "" && loading.address.trim() !== "";

	const placeOrder = async () => {
		if (!depot) throw new Error("No depot selected");
		const placed = await api.orders.place({
			depot,
			lines,
			loading,
			trucks,
			companyName,
			// Guest checkout: no session, the phone identifies the order. The
			// details were collected on the verify step; signed-in buyers skip it.
			guest: !isAuthed && guest ? guest : undefined,
		});
		clearOrderDraft();
		setOrder(placed);
		setStep("payment");
	};

	const createOrder = async () => {
		setPlaceBusy(true);
		setPlaceError(null);
		try {
			await placeOrder();
		} catch {
			setPlaceError("Couldn't create the order. Try again.");
		} finally {
			setPlaceBusy(false);
		}
	};

	// Switching depots keeps the buyer's quantities by product code: 15,000 L
	// of AGO at Oghara stays 15,000 L of AGO at Apapa (if Apapa quotes it).
	const changeDepot = (id: number) => {
		const next: Record<number, number> = {};
		for (const p of products) {
			if (p.depot_id !== id || !p.available) continue;
			const previous = depotProducts.find(
				(dp) => dp.abbreviation === p.abbreviation,
			);
			const qty = previous ? (quantities[previous.id] ?? 0) : 0;
			if (qty > 0) next[p.id] = qty;
		}
		setChosenDepotId(id);
		setQuantities(next);
	};

	const goAfterLoading = () => {
		setAccountError(null);
		setPlaceError(null);
		setStep(isAuthed ? "review" : "verify");
	};

	const cta: WizardCta | null =
		step === "order"
			? {
					label: "Continue",
					disabled: !orderComplete,
					hint:
						total === 0
							? "Add a quantity to continue"
							: "Enter the company this order is for",
					onClick: () => setStep("loading"),
				}
			: step === "loading"
				? {
						label: "Continue",
						disabled: !loadingComplete,
						hint:
							loading.type === "pickup"
								? "Finish the truck split so the litres total your order, or clear it to skip"
								: "Choose a delivery state and address to continue",
						onClick: goAfterLoading,
					}
				: step === "verify" && !isAuthed
					? {
							label: "Continue",
							onClick: () => void accountContinueRef.current?.(),
						}
					: step === "review"
						? {
								label: "Place order",
								busy: placeBusy,
								onClick: () => void createOrder(),
							}
						: null;

	// After create, payment is the receipt + pay surface — it drops the card
	// chrome and stands with the stepper so Payment reads as the final tab.
	if (step === "payment" && order) {
		return (
			<div className="relative mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 md:py-10">
				<WizardBack to="/order" label="Order something else" />
				<WizardHeading
					title="Soroman Depot"
					subtitle="Pay to confirm your order."
				/>
				<div className="mt-6">
					<WizardStepper
						steps={DEPOT_STEPS.filter((s) => {
							if (s.key === "verify" && isAuthed) return false;
							return true;
						})}
						current="payment"
					/>
				</div>
				<div className="mt-6">
					<InvoiceStep
						order={order}
						onReprice={() => {
							void placeOrder().catch(() => {});
						}}
					/>
					<NextSteps orderId={order.id} />
				</div>
			</div>
		);
	}

	const copy = STEP_COPY[step];

	const onStepBack =
		step === "loading"
			? () => setStep("order")
			: step === "verify"
				? () => setStep("loading")
				: step === "review"
					? () => setStep(isAuthed ? "loading" : "verify")
					: undefined;

	/** Top-left exit — wipe the session draft so a later visit starts clean. */
	const leaveWizard = () => {
		clearOrderDraft();
		void navigate({ to: "/order" });
	};

	// Payment is reachable only after create; account is omitted when signed in.
	const chromeSteps = DEPOT_STEPS.filter((s) => {
		if (s.key === "verify" && isAuthed) return false;
		return true;
	});

	const wizardBusy = placeBusy;

	return (
		<div className="relative mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-6 md:py-10">
			<WizardBack
				onClick={leaveWizard}
				label="Back to orders"
				disabled={wizardBusy}
			/>
			<WizardHeading
				title="Order from Soroman Depots"
				subtitle="Fuel products at today's prices — place your order and get your invoice instantly"
			/>

			<div className="mt-6">
				<WizardStepper
					steps={chromeSteps}
					current={step}
					onNavigate={(s) => {
						if (wizardBusy || isLoading) return;
						if (s === "payment") return;
						if (s === "verify" && isAuthed) return;
						if (s === "review" && !isAuthed && step !== "review") return;
						setStep(s);
					}}
				/>
			</div>

			<Card className="mt-6">
				{copy && (
					<CardHeader className="border-b">
						<CardTitle className="text-lg font-semibold tracking-tight">
							{copy.title}
						</CardTitle>
						<CardDescription>{copy.description}</CardDescription>
					</CardHeader>
				)}
				<CardContent className="pt-6">
					{isLoading ? (
						<div className="grid gap-3">
							<Skeleton className="h-11 w-full" />
							<Skeleton className="h-24 w-full" />
						</div>
					) : (
						<>
							{step === "order" && (
								<OrderStep
									depots={depots}
									depot={depot}
									products={depotProducts}
									quantities={quantities}
									companyName={companyName}
									onDepotChange={changeDepot}
									onQuantityChange={(productId, quantity) =>
										// One product per order (mirrors the backend and the WhatsApp
										// flow): a quantity replaces the whole map, never merges.
										setQuantities(quantity > 0 ? { [productId]: quantity } : {})
									}
									onCompanyNameChange={setCompanyName}
								/>
							)}
							{step === "loading" && (
								<LoadingStep
									depot={depot}
									states={states}
									loading={loading}
									lines={lines}
									trucks={trucks}
									onChange={setLoading}
									onTrucksChange={setTrucks}
									onChangeDepot={() => setStep("order")}
								/>
							)}
							{step === "verify" && (
								<VerifyStep
									error={accountError}
									onError={setAccountError}
									onReady={(details) => {
										setGuest(details);
										setAccountError(null);
										setStep("review");
									}}
									onVerified={() => {
										setAccountError(null);
										setStep("review");
									}}
									continueHandlerRef={accountContinueRef}
								/>
							)}
							{step === "review" && (
								<>
									<ReviewStep
										depot={depot}
										lines={lines}
										loading={loading}
										trucks={trucks}
										companyName={companyName}
										total={total}
									/>
									{placeError && (
										<p role="alert" className="mt-4 text-xs text-destructive">
											{placeError}
										</p>
									)}
								</>
							)}
						</>
					)}
				</CardContent>
				{!isLoading && (cta || onStepBack) && (
					<CardFooter className="flex-col items-stretch gap-3 border-t bg-card">
						{(step === "order" || step === "review") && total > 0 && (
							<div className="flex items-baseline justify-between">
								<span className="text-[0.6rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
									Order total
								</span>
								<span className="text-xl font-semibold tracking-tight tabular-nums">
									{formatNaira(total)}
								</span>
							</div>
						)}
						<WizardActions cta={cta} onBack={onStepBack} />
					</CardFooter>
				)}
			</Card>
		</div>
	);
}
