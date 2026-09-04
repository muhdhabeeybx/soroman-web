import { Link } from "@tanstack/react-router";
import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
	COMPANY_NAME,
	STAFF_DASHBOARD_URL,
	SUPPORT_PHONE,
	telHref,
	WHATSAPP_URL,
} from "@/lib/company";

import { ModeToggle } from "./mode-toggle";

export default function Footer() {
	return (
		<footer className="border-t">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-xl font-medium tracking-tight">Soroman Energy</p>
					<p className="mt-2 max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
						We supply PMS, AGO and LPG to businesses and customers across
						Nigeria through our nationwide depot network.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<Button
						variant="secondary"
						size="sm"
						nativeButton={false}
						render={
							<a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
								<MessageCircle data-icon="inline-start" />
								WhatsApp desk
							</a>
						}
					/>
					<a
						href={telHref(SUPPORT_PHONE)}
						className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-500 ease-luxe hover:text-foreground"
					>
						<Phone className="size-3.5" aria-hidden />
						{SUPPORT_PHONE}
					</a>
				</div>
			</div>
			<div className="border-t">
				<div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
					<p className="text-xs text-muted-foreground">
						© {new Date().getFullYear()} {COMPANY_NAME}.
					</p>
					<div className="flex items-center gap-6">
						<nav className="flex gap-6 text-xs text-muted-foreground">
							<Link
								to="/faq"
								className="transition-colors duration-500 ease-luxe hover:text-foreground"
							>
								FAQ
							</Link>
							<Link
								to="/contact"
								className="transition-colors duration-500 ease-luxe hover:text-foreground"
							>
								Contact
							</Link>
							<Link
								to="/privacy"
								className="transition-colors duration-500 ease-luxe hover:text-foreground"
							>
								Privacy
							</Link>
							<Link
								to="/terms"
								className="transition-colors duration-500 ease-luxe hover:text-foreground"
							>
								Terms
							</Link>
							<Link
								to="/delete-account"
								className="transition-colors duration-500 ease-luxe hover:text-foreground"
							>
								Delete account
							</Link>
							{/* The staff dashboard is a separate app on its own subdomain —
                an external link in a new tab, so a customer mid-task never
                loses this page. */}
							<a
								href={STAFF_DASHBOARD_URL}
								target="_blank"
								rel="noreferrer"
								className="transition-colors duration-500 ease-luxe hover:text-foreground"
							>
								Staff login
							</a>
						</nav>
						{/* Appearance is a preference, not a task — it lives here rather
                than competing with the CTA in the header. */}
						<ModeToggle />
					</div>
				</div>
			</div>
		</footer>
	);
}
