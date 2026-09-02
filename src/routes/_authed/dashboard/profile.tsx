import { createFileRoute } from "@tanstack/react-router";
import { PaymentsPanel } from "@/components/account/payments-panel";
import { ProfilePanel } from "@/components/account/profile-panel";
import { MICRO } from "@/components/dashboard/panel";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/dashboard/profile")({
	component: ProfilePage,
	head: () => ({
		meta: [
			{ title: "Profile | Soroman Energy" },
			{
				name: "description",
				content:
					"Update your Soroman profile details and payment preferences.",
			},
		],
	}),
});

function ProfilePage() {
	const auth = useAuth();
	if (auth.status !== "authed") return null;

	return (
		<div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 md:pt-8 md:pb-14 lg:px-8">
			<header className="snapshot-rise" style={{ animationDelay: "0ms" }}>
				<div className="flex items-center gap-4">
					<span className="h-px w-8 bg-foreground md:w-12" aria-hidden />
					<span className={cn(MICRO, "text-muted-foreground")}>Profile</span>
				</div>
				<h1 className="mt-5 text-3xl leading-[1.05] tracking-tight md:text-4xl">
					Your <em className="font-semibold text-accent not-italic">profile</em>
					.
				</h1>
				<p className="mt-3 max-w-lg text-sm text-muted-foreground">
					Details on invoices and waybills, plus how order payments work.
				</p>
			</header>

			<div className="snapshot-rise mt-10" style={{ animationDelay: "90ms" }}>
				<ProfilePanel />
			</div>

			<div className="snapshot-rise mt-6" style={{ animationDelay: "160ms" }}>
				<PaymentsPanel />
			</div>
		</div>
	);
}
