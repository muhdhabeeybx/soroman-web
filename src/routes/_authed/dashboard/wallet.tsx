import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MICRO, PANEL } from "@/components/dashboard/panel";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type WalletTransaction } from "@/lib/api";
import { SUPPORT_PHONE } from "@/lib/company";
import type { AppColumnDef } from "@/lib/table";
import { formatNaira } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/dashboard/wallet")({
	component: WalletPage,
	head: () => ({
		meta: [
			{ title: "Wallet | Soroman Energy" },
			{
				name: "description",
				content: "View your Soroman wallet balance and transaction history.",
			},
		],
	}),
});

const PAGE_SIZE = 20;

const formatWhen = (iso: string) =>
	new Date(iso).toLocaleString("en-NG", {
		dateStyle: "medium",
		timeStyle: "short",
	});

const columns: AppColumnDef<WalletTransaction>[] = [
	{
		accessorKey: "at",
		header: "When",
		cell: ({ row }) => (
			<span className="whitespace-nowrap text-muted-foreground tabular-nums">
				{formatWhen(row.original.at)}
			</span>
		),
	},
	{
		accessorKey: "type",
		header: "Type",
		cell: ({ row }) => {
			const credit = row.original.type === "credit";
			return (
				<span
					className={cn(
						"inline-block rounded-full border px-2 py-0.5 text-[0.6rem] font-medium tracking-widest uppercase",
						credit
							? "border-accent/40 bg-accent/15 text-accent"
							: "border-foreground/15 bg-muted/50 text-muted-foreground",
					)}
				>
					{credit ? "Credit" : "Debit"}
				</span>
			);
		},
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ row }) => (
			<div className="min-w-0">
				<p className="truncate font-medium">
					{row.original.description || "—"}
				</p>
				{row.original.ref ? (
					<p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
						{row.original.ref}
					</p>
				) : null}
			</div>
		),
	},
	{
		accessorKey: "amount",
		header: "Amount",
		meta: { className: "text-right" },
		cell: ({ row }) => {
			const credit = row.original.type === "credit";
			return (
				<span
					className={cn(
						"font-semibold tabular-nums",
						credit ? "text-accent" : "text-foreground",
					)}
				>
					{credit ? "+" : "−"}
					{formatNaira(row.original.amount)}
				</span>
			);
		},
	},
	{
		accessorKey: "balanceAfter",
		header: "Balance",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="tabular-nums text-muted-foreground">
				{formatNaira(row.original.balanceAfter)}
			</span>
		),
	},
];

function WalletPage() {
	const [page, setPage] = useState(1);

	const overviewQuery = useQuery({
		queryKey: ["dashboard"],
		queryFn: () => api.dashboard.overview(),
	});

	const historyQuery = useQuery({
		queryKey: ["wallet-transactions", page],
		queryFn: () => api.wallet.transactions({ page, limit: PAGE_SIZE }),
	});

	const balance = overviewQuery.data?.wallet.balance;
	const rows = historyQuery.data?.transactions ?? [];
	const pagination = historyQuery.data?.pagination;

	return (
		<div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 md:pt-8 md:pb-14 lg:px-8">
			<header
				className="snapshot-rise flex flex-wrap items-end justify-between gap-4"
				style={{ animationDelay: "0ms" }}
			>
				<div>
					<div className="flex items-center gap-4">
						<span className="h-px w-8 bg-foreground md:w-12" aria-hidden />
						<span className={cn(MICRO, "text-muted-foreground")}>Wallet</span>
					</div>
					<h1 className="mt-5 text-3xl leading-[1.05] tracking-tight md:text-4xl">
						Wallet{" "}
						<em className="font-semibold text-accent not-italic">history</em>.
					</h1>
					<p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
						Credits from transfers and debits when you pay an order — newest
						first.
					</p>
				</div>
				<Button nativeButton={false} render={<Link to="/order" />}>
					New order
				</Button>
			</header>

			<div
				className="snapshot-rise mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
				style={{ animationDelay: "60ms" }}
			>
				<section
					className={cn(PANEL, "px-6 py-5")}
					aria-label="Current balance"
				>
					<span className={MICRO}>Spendable balance</span>
					{overviewQuery.isLoading ? (
						<Skeleton className="mt-3 h-9 w-40" />
					) : (
						<p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
							{formatNaira(balance ?? 0)}
						</p>
					)}
					<p className="mt-2 text-xs text-muted-foreground">
						Deposits recorded by Soroman. Orders are paid by bank transfer and
						confirmed by our desk against your payment.
					</p>
				</section>

				<section className={cn(PANEL, "px-6 py-5")} aria-label="Fund wallet">
					<span className={MICRO}>Fund your wallet</span>
					<div className="mt-3 space-y-2">
						<p className="text-sm text-muted-foreground">
							Wallet deposits are recorded by Soroman when your transfer is
							confirmed. Each order shows the exact bank account to pay into —
							or contact Soroman on{" "}
							<a
								href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
								className="font-medium text-accent underline-offset-4 hover:underline"
							>
								{SUPPORT_PHONE}
							</a>{" "}
							to top up your balance ahead of an order.
						</p>
						<Link
							to="/order"
							className="inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
						>
							Place an order →
						</Link>
					</div>
				</section>
			</div>

			<div className="snapshot-rise mt-8" style={{ animationDelay: "110ms" }}>
				<DataTable
					columns={columns}
					data={rows}
					isLoading={historyQuery.isLoading}
					emptyTitle="No wallet activity yet."
					emptyDescription="Deposits recorded by Soroman and order payments will show up here."
					pagination={
						pagination
							? {
									page: pagination.page,
									pages: pagination.pages,
									total: pagination.total,
									label: "transactions",
									alwaysShow: pagination.pages > 1,
									onPageChange: setPage,
								}
							: undefined
					}
				/>
			</div>
		</div>
	);
}
