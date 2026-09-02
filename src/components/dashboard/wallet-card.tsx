import { Link } from "@tanstack/react-router";
import { MICRO, PANEL } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

/**
 * Wallet balance — deposits Soroman has recorded for this customer. Orders
 * are paid by bank transfer and confirmed by the desk (self-service wallet
 * pay was withdrawn), so this reads as a statement of standing, not a spend
 * button; the coverage line turns the naira figure into litres.
 */
export default function WalletCard({
	balance,
	todayPrice,
}: {
	balance: number;
	/** Lowest current price across open depots, for the litres estimate. */
	todayPrice: number | null;
}) {
	const litres =
		todayPrice && todayPrice > 0 ? Math.floor(balance / todayPrice) : null;

	return (
		<section className={cn(PANEL, "flex h-full flex-col")} aria-label="Wallet">
			<div className="flex items-baseline justify-between border-b border-foreground/15 px-6 py-4">
				<span className={MICRO}>Wallet balance</span>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="ghost"
						nativeButton={false}
						render={<Link to="/dashboard/wallet" />}
					>
						History
					</Button>
					<Button
						size="sm"
						variant="secondary"
						nativeButton={false}
						render={<Link to="/order" />}
					>
						New order
					</Button>
				</div>
			</div>

			<div className="px-6 pt-5 pb-6">
				<Link
					to="/dashboard/wallet"
					className="ease-luxe block rounded-sm outline-hidden transition-opacity duration-250 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
				>
					<p className="text-3xl leading-none font-semibold tracking-tight tabular-nums md:text-4xl">
						{formatNaira(balance)}
					</p>
					<p className="mt-2 text-xs text-muted-foreground">
						{balance <= 0
							? "Deposits recorded by Soroman appear here."
							: litres !== null
								? `About ${litres.toLocaleString()} L at today's best price.`
								: "Spendable on your next order."}
					</p>
				</Link>
			</div>

			<div className="mt-auto border-t border-foreground/15 bg-muted/40 px-6 py-3.5">
				<div className="flex items-center gap-2">
					<span className="text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
						Fund your wallet
					</span>
				</div>
				<div className="mt-2 space-y-1.5">
					<p className="text-xs text-muted-foreground">
						Deposits are recorded by Soroman when your transfer is confirmed.
					</p>
					<Link
						to="/dashboard/wallet"
						className="inline-flex text-xs font-medium text-accent underline-offset-4 hover:underline"
					>
						How to fund →
					</Link>
				</div>
			</div>
		</section>
	);
}
