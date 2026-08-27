import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
	DEPOT_LOCATIONS,
	LOADING_HOURS,
	mapsHref,
	OFFICE_ADDRESS,
	SUPPORT_EMAIL,
	SUPPORT_PHONE,
	telHref,
	WHATSAPP_URL,
} from "@/lib/company";

export const Route = createFileRoute("/_site/contact")({
	component: ContactPage,
	head: () => ({
		meta: [
			{ title: "Contact | Soroman Energy" },
			{
				name: "description",
				content:
					"Reach the Soroman desk by WhatsApp, phone, or email during loading hours for orders, payments, and depot questions.",
			},
		],
	}),
});

function ContactPage() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 md:py-28">
			<div className="flex items-center gap-4">
				<span className="h-px w-8 bg-foreground md:w-12" aria-hidden />
				<span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
					Contact
				</span>
			</div>

			<h1 className="mt-8 max-w-2xl text-4xl leading-[0.95] tracking-tight text-balance md:text-5xl">
				Talk to the desk.
			</h1>
			<p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
				Our desk answers during loading hours, {LOADING_HOURS}. WhatsApp is
				fastest — most questions are answered in minutes.
			</p>

			<div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-16">
				<div className="lg:col-span-7">
					<div className="grid gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-2">
						<ContactMethod
							icon={MessageCircle}
							label="WhatsApp desk"
							value="Fastest — minutes during loading hours"
							action={
								<Button
									nativeButton={false}
									size="sm"
									render={
										<a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
											Open WhatsApp
										</a>
									}
								/>
							}
						/>
						<ContactMethod
							icon={Phone}
							label="Phone"
							value={SUPPORT_PHONE}
							action={
								<Button
									nativeButton={false}
									size="sm"
									variant="secondary"
									render={<a href={telHref(SUPPORT_PHONE)}>Call the desk</a>}
								/>
							}
						/>
					</div>

					<div className="mt-12 border-t border-foreground pt-8">
						<h2 className="text-2xl">Email</h2>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							For invoices, receipts and account questions. Include your order
							reference so we can find it quickly.
						</p>
						<a
							href={`mailto:${SUPPORT_EMAIL}`}
							className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline"
						>
							{SUPPORT_EMAIL}
						</a>
					</div>

					<div className="mt-12 border-t border-foreground pt-8">
						<h2 className="text-2xl">Visit us</h2>
						<address className="mt-2 text-sm leading-relaxed text-muted-foreground not-italic">
							{OFFICE_ADDRESS}
						</address>
						<a
							href={mapsHref(OFFICE_ADDRESS)}
							target="_blank"
							rel="noreferrer"
							className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline"
						>
							Get directions
						</a>
					</div>
				</div>

				<aside className="lg:col-span-5">
					<div className="border-t border-foreground pt-8">
						<h2 className="text-2xl">Where we load</h2>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							Six depots across four states. Live prices and stock for each are
							on the depot prices page.
						</p>
						<ul className="mt-6">
							{DEPOT_LOCATIONS.map(({ name, state }) => (
								<li
									key={name}
									className="flex items-baseline justify-between border-b border-border py-3 text-sm last:border-b-0"
								>
									<span className="font-medium">{name}</span>
									<span className="text-muted-foreground">{state} State</span>
								</li>
							))}
						</ul>
					</div>
				</aside>
			</div>
		</div>
	);
}

function ContactMethod({
	icon: Icon,
	label,
	value,
	action,
}: {
	icon: typeof Phone;
	label: string;
	value: string;
	action: React.ReactNode;
}) {
	return (
		<div className="flex flex-col justify-between gap-6 bg-background p-8">
			<div>
				<Icon className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
				<h2 className="mt-4 text-xs tracking-[0.25em] uppercase">{label}</h2>
				<p className="mt-2 text-sm text-muted-foreground">{value}</p>
			</div>
			<div>{action}</div>
		</div>
	);
}
