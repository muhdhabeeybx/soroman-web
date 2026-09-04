import { useState } from "react";
import { BoxedInput, BoxedSelect } from "@/components/order/boxed";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelectOption } from "@/components/ui/native-select";
import type { Depot, DepotProduct } from "@/lib/api";
import { formatNaira, hasPublishedPrice } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

/** Short trade code for the badge — never wrap a full product name into size-9. */
function productBadge(product: DepotProduct): string {
	const raw = (product.abbreviation || product.name || "").trim();
	if (!raw) return "?";
	// Prefer a short code (PMS / AGO); strip parentheticals like "(Premium Motor Spirit)".
	const code = raw.split(/[\s(/]/)[0]?.trim() ?? raw;
	if (code.length > 0 && code.length <= 5) return code.toUpperCase();
	return code.slice(0, 4).toUpperCase();
}

/**
 * Orderable = in stock AND carrying a real price. A product the desk has not
 * priced today would otherwise be selectable at ₦0 and place a zero-value
 * order, so it is offered as "price not set" and left disabled.
 */
function isOrderable(product: DepotProduct): boolean {
	return product.available && hasPublishedPrice(product);
}

/**
 * Depot + a SINGLE product. An order is one product (the backend places one
 * product per order, and the WhatsApp flow picks one too), so the products
 * are a radio group: choosing one clears any other's quantity.
 *
 * Layout: auto-fit tiles that grow with the catalog — up to 2 per row on
 * small screens, 4 on larger — so a short list fills the width and a longer
 * one wraps. Quantity sits below the grid so selecting a tile doesn't
 * stretch the list.
 */
export default function OrderStep({
	depots,
	depot,
	products,
	quantities,
	companyName,
	onDepotChange,
	onQuantityChange,
	onCompanyNameChange,
}: {
	depots: Depot[];
	depot: Depot | null;
	products: DepotProduct[];
	quantities: Record<number, number>;
	companyName: string;
	onDepotChange: (depotId: number) => void;
	onQuantityChange: (productId: number, quantity: number) => void;
	onCompanyNameChange: (companyName: string) => void;
}) {
	const openDepots = depots.filter((d) => d.is_open);

	// The product that already carries a quantity wins; otherwise a plain pick
	// (valid for this depot) stands until a quantity is typed. No local state
	// survives a depot switch that renames the product ids out from under it.
	const activeId =
		products.find((p) => (quantities[p.id] ?? 0) > 0)?.id ?? null;
	const [picked, setPicked] = useState<number | null>(null);
	const selectedId =
		activeId ??
		(picked != null && products.some((p) => p.id === picked && isOrderable(p))
			? picked
			: null);
	const selected = products.find((p) => p.id === selectedId) ?? null;
	const qty = selected ? (quantities[selected.id] ?? 0) : 0;
	const unit = selected
		? selected.unit === "litre"
			? "L"
			: selected.unit
		: "";

	const select = (id: number) => {
		setPicked(id);
		// Switching product drops the previous one's litres — one product only.
		if (activeId != null && activeId !== id) onQuantityChange(id, 0);
	};

	return (
		<div>
			<Field>
				<FieldLabel
					htmlFor="order-depot"
					className="text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase"
				>
					Depot
				</FieldLabel>
				<BoxedSelect
					id="order-depot"
					value={depot?.id ?? ""}
					onChange={(e) => onDepotChange(Number(e.target.value))}
				>
					{openDepots.map((d) => (
						<NativeSelectOption key={d.id} value={d.id}>
							{d.name} · {d.state}
						</NativeSelectOption>
					))}
				</BoxedSelect>
			</Field>

			<p className="mt-5 text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase">
				Product
			</p>
			<ul
				className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(max(9rem,calc((100%-0.5rem)/2)),1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(max(10rem,calc((100%-1.5rem)/4)),1fr))]"
				role="radiogroup"
				aria-label="Product"
			>
				{products.map((product) => {
					const isSelected = selectedId === product.id;
					const badge = productBadge(product);
					const orderable = isOrderable(product);
					return (
						<li key={product.id} className="min-w-0">
							<button
								type="button"
								role="radio"
								aria-checked={isSelected}
								disabled={!orderable}
								onClick={() => orderable && select(product.id)}
								className={cn(
									"ease-luxe flex h-full w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors duration-250 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
									isSelected
										? "border-accent/50 bg-accent/5"
										: "border-input hover:border-foreground/30",
									!orderable && "cursor-not-allowed opacity-55",
								)}
							>
								<div className="flex items-start justify-between gap-2">
									<span
										className={cn(
											"flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md font-mono text-[0.65rem] font-semibold tracking-wide whitespace-nowrap",
											isSelected
												? "bg-accent/15 text-accent"
												: "bg-muted text-muted-foreground",
										)}
										aria-hidden
									>
										{badge}
									</span>
									<span
										className={cn(
											"mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
											isSelected
												? "border-accent bg-accent"
												: "border-foreground/25",
										)}
										aria-hidden
									>
										{isSelected && (
											<span className="size-1.5 rounded-full bg-accent-foreground" />
										)}
									</span>
								</div>
								<span className="min-w-0">
									<span className="line-clamp-2 text-sm leading-snug font-semibold">
										{product.name}
									</span>
									<span className="mt-1 block text-xs text-muted-foreground tabular-nums">
										{!product.available ? (
											<span className="text-muted-foreground/60">
												Out of stock today
											</span>
										) : !hasPublishedPrice(product) ? (
											<span className="text-muted-foreground/60">
												Price not set today
											</span>
										) : (
											<>
												{formatNaira(product.price)}
												<span className="text-muted-foreground/60">
													/{product.unit}
												</span>
											</>
										)}
									</span>
								</span>
							</button>
						</li>
					);
				})}
			</ul>

			{selected && isOrderable(selected) && (
				<div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3.5">
					<label
						htmlFor={`qty-${selected.id}`}
						className="text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase"
					>
						Quantity in {selected.unit}s
						<span className="ml-1.5 font-normal tracking-normal text-muted-foreground/80 normal-case">
							· {productBadge(selected)}
						</span>
					</label>
					<div className="mt-1.5 flex items-center gap-3">
						<span className="flex flex-1 items-center overflow-hidden rounded-lg border border-input bg-card focus-within:border-accent">
							<input
								id={`qty-${selected.id}`}
								key={selected.id}
								inputMode="numeric"
								autoFocus
								aria-label={`${selected.name} quantity in ${selected.unit}s`}
								value={qty > 0 ? qty.toLocaleString() : ""}
								placeholder="0"
								onChange={(e) => {
									const parsed = Number(
										e.target.value.replace(/\D/g, "").slice(0, 9),
									);
									onQuantityChange(selected.id, parsed);
								}}
								className="h-11 flex-1 bg-transparent px-3.5 text-sm tabular-nums placeholder:text-muted-foreground/50 focus-visible:outline-none"
							/>
							<span className="border-l border-input px-3.5 py-2.5 text-xs text-muted-foreground">
								{unit}
							</span>
						</span>
						{qty > 0 && (
							<span className="shrink-0 text-sm font-semibold text-accent tabular-nums">
								{formatNaira(qty * selected.price)}
							</span>
						)}
					</div>
				</div>
			)}

			{/* Order-level: the company this order is placed for, named on the
          ticket/invoice. Required — matches the backend and the WhatsApp flow. */}
			<div className="mt-5">
				<Field>
					<FieldLabel
						htmlFor="order-company"
						className="text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase"
					>
						Company name
					</FieldLabel>
					<BoxedInput
						id="order-company"
						value={companyName}
						onChange={(e) => onCompanyNameChange(e.target.value)}
						placeholder="Company this order is for"
						autoComplete="organization"
						required
						aria-required="true"
					/>
				</Field>
			</div>
		</div>
	);
}
