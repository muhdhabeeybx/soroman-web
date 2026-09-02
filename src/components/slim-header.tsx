import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { SUPPORT_WHATSAPP_URL } from "@/lib/company";

/**
 * Slim chrome for focused surfaces — checkout and the auth pages. Every nav
 * item is an exit from the task at hand, so the full header comes off: the
 * logo stays as the trust anchor and single escape hatch, and support is the
 * one affordance someone mid-payment or locked out genuinely needs.
 */
export default function SlimHeader() {
	return (
		<header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
			<div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
				<Link to="/" aria-label="Back to Soroman home">
					<img
						src="/logo-full.png"
						alt="Soroman"
						width={720}
						height={131}
						className="h-5 w-auto dark:hue-rotate-180 dark:invert"
					/>
				</Link>
				<a
					href={SUPPORT_WHATSAPP_URL}
					target="_blank"
					rel="noreferrer"
					className="flex items-center gap-2 text-xs text-muted-foreground transition-colors duration-300 ease-luxe hover:text-foreground"
				>
					<MessageCircle className="size-3.5" strokeWidth={1.5} aria-hidden />
					Need help? WhatsApp desk
				</a>
			</div>
		</header>
	);
}
