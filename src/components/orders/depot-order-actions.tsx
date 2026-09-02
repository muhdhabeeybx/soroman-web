import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import { AccountRows, CopyAllButton } from "@/components/virtual-account";
import {
	api,
	formatPriceValidUntil,
	type OrderRecord,
	type VirtualAccount,
} from "@/lib/api";
import { ApiError } from "@/lib/http";
import { seedDraftFromOrder } from "@/lib/order-draft";
import { formatNaira } from "@/lib/use-catalog";

type PayDialogProps = {
	order: OrderRecord;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

/**
 * Pay modal for an unpaid depot order: the transfer account and the exact
 * total. Wallet pay was withdrawn backend-wide — orders are confirmed by the
 * finance desk against the bank transfer, never drawn from a balance.
 */
export function DepotPayDialog({ order, open, onOpenChange }: PayDialogProps) {
	const navigate = useNavigate();

	// List rows sometimes omit the VA — pull detail when the modal opens so
	// transfer details are always available for an unpaid order.
	const needsAccount = !order.account;
	const { data: detail, isLoading: detailLoading } = useQuery({
		queryKey: ["order", order.id],
		queryFn: () => api.orders.get(order.id),
		enabled: open && needsAccount,
	});

	const account: VirtualAccount | null =
		order.account ?? detail?.account ?? null;

	const openDetail = () => {
		onOpenChange(false);
		void navigate({
			to: "/dashboard/orders/$orderId",
			params: { orderId: order.id },
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Pay {order.id}</DialogTitle>
					<DialogDescription>
						{formatNaira(order.total)} due
						{order.lock_expires_at
							? ` — price valid till ${formatPriceValidUntil(order.lock_expires_at)}.`
							: "."}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 px-5">
					{/* Transfer first — the path that always works. */}
					{detailLoading && needsAccount ? (
						<Skeleton className="h-28 rounded-lg" />
					) : account ? (
						<div>
							<p className="mb-2 text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
								Transfer to the account for this order
							</p>
							<AccountRows account={account} className="border-foreground/15" />
							<div className="mt-2 flex justify-end">
								<CopyAllButton account={account} />
							</div>
							<p className="mt-2 text-xs text-muted-foreground">
								Transfer the exact total — Soroman confirms your payment once
								the transfer lands.
							</p>
						</div>
					) : (
						<p className="text-xs text-muted-foreground">
							Transfer details aren&apos;t available yet. Open the order or try
							again in a moment.
						</p>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						className="cursor-pointer"
						onClick={() => onOpenChange(false)}
					>
						Close
					</Button>
					<Button className="cursor-pointer" onClick={openDetail}>
						Open order
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Per-row actions for the depot orders desk: open detail, pay, cancel, reorder.
 * Stops row-click navigation when the menu or dialogs are used.
 */
export function DepotOrderActions({ order }: { order: OrderRecord }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [payOpen, setPayOpen] = useState(false);
	const [cancelOpen, setCancelOpen] = useState(false);

	const unpaid = order.status === "awaiting_payment";
	const canCancel = unpaid;
	const canReorder =
		order.status === "loaded" ||
		order.status === "cancelled" ||
		order.status === "expired" ||
		order.status === "awaiting_payment";

	const cancel = useMutation({
		mutationFn: () => api.orders.cancelByRef(order.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["orders"] });
			void queryClient.invalidateQueries({ queryKey: ["order", order.id] });
			setCancelOpen(false);
		},
	});

	const openDetail = () => {
		void navigate({
			to: "/dashboard/orders/$orderId",
			params: { orderId: order.id },
		});
	};

	const reorder = () => {
		seedDraftFromOrder(order);
		void navigate({ to: "/order/depot" });
	};

	const stopRow = (e: SyntheticEvent) => {
		e.stopPropagation();
	};

	return (
		// eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
		<div onClick={stopRow} onKeyDown={stopRow}>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon-sm" className="cursor-pointer" />
					}
				>
					<MoreHorizontal className="size-4" />
					<span className="sr-only">Actions for {order.id}</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={openDetail}>Open</DropdownMenuItem>
						{unpaid && (
							<DropdownMenuItem onClick={() => setPayOpen(true)}>
								Pay now
							</DropdownMenuItem>
						)}
						{canReorder && (
							<DropdownMenuItem onClick={reorder}>Reorder</DropdownMenuItem>
						)}
						{canCancel && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setCancelOpen(true)}
								>
									Cancel order
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<DepotPayDialog order={order} open={payOpen} onOpenChange={setPayOpen} />

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
		</div>
	);
}
