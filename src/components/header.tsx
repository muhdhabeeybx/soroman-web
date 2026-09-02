import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CircleUserRound, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/notifications/bell";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhoneForDisplay } from "@/lib/api";
import { authStore, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

// `hash` is declared on every entry so the array stays a uniform union that
// destructures cleanly; undefined simply means "no anchor".
const NAV = [
	{ label: "Depot prices", to: "/", hash: "prices" },
	{ label: "Track order", to: "/", hash: "track" },
	{ label: "FAQ", to: "/faq", hash: undefined },
	{ label: "Contact", to: "/contact", hash: undefined },
] as const;

/**
 * The icon buttons read as 28px, which is well under a comfortable thumb.
 * They're ghost variants — transparent until hover — so widening the hit area
 * on touch viewports costs nothing visually and only the target grows.
 */
const TOUCH_TARGET = "size-10 sm:size-7";

export default function Header() {
	const auth = useAuth();
	const navigate = useNavigate();
	const [stuck, setStuck] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [heroCtaOnScreen, setHeroCtaOnScreen] = useState(true);
	const sentinel = useRef<HTMLDivElement>(null);
	const mobileNavRef = useRef<HTMLElement>(null);
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const isAuthed = auth.status === "authed";
	const isGuest = auth.status === "guest";
	const isAuthLoading = auth.status === "loading";

	/**
	 * The header is transparent over the hero and only earns its background once
	 * the page scrolls beneath it. Driven by an IntersectionObserver on a 1px
	 * sentinel rather than a scroll listener, which would fire every frame.
	 */
	useEffect(() => {
		const el = sentinel.current;
		if (!el) return;
		const io = new IntersectionObserver(([entry]) =>
			setStuck(!entry.isIntersecting),
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	/**
	 * The header CTA only appears when no other one is on screen. The landing
	 * hero marks its CTA row with data-hero-cta; while that is visible the header
	 * stays quiet. Pages without a hero (FAQ, Contact, ...) have no such marker,
	 * so the CTA shows immediately.
	 */
	useEffect(() => {
		const heroCta = document.querySelector("[data-hero-cta]");
		if (!heroCta) {
			setHeroCtaOnScreen(false);
			return;
		}
		setHeroCtaOnScreen(true);
		const io = new IntersectionObserver(([entry]) =>
			setHeroCtaOnScreen(entry.isIntersecting),
		);
		io.observe(heroCta);
		return () => io.disconnect();
	}, [pathname]);

	// Any navigation closes the panel; so does Escape.
	useEffect(() => setMenuOpen(false), [pathname]);
	useEffect(() => {
		if (!menuOpen) return;
		const onKey = (e: KeyboardEvent) =>
			e.key === "Escape" && setMenuOpen(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [menuOpen]);

	// Lock page scroll while the mobile panel is open, and move focus into it.
	useEffect(() => {
		if (!menuOpen) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const first = mobileNavRef.current?.querySelector<HTMLElement>(
			"a[href], button:not([disabled])",
		);
		first?.focus();
		return () => {
			document.body.style.overflow = prev;
		};
	}, [menuOpen]);

	return (
		<>
			<div ref={sentinel} aria-hidden className="h-px" />
			<header
				className={cn(
					"sticky top-0 z-40 -mt-px border-b pt-[env(safe-area-inset-top)] transition-colors duration-700 ease-luxe motion-reduce:transition-none",
					stuck || menuOpen
						? "border-border bg-background/80 backdrop-blur-md"
						: "border-transparent bg-transparent",
				)}
			>
				{/*
				 * Full-bleed chrome: the bar runs to the viewport edges rather than
				 * sharing the page's max-w-6xl content column. The header is a layer
				 * over the page, not a row in it, so it reads as its own band.
				 */}
				<div className="mx-auto grid h-16 w-full max-w-[1600px] grid-cols-[auto_1fr_auto] items-center gap-6 px-5 sm:px-8 md:h-20 lg:px-12">
					<Link
						to="/"
						aria-label="Soroman home"
						className="flex shrink-0 items-center"
					>
						{/*
						 * The full bilingual lockup, 索罗曼 included.
						 *
						 * Sized off the Chinese line rather than the wordmark: it occupies
						 * the bottom 27% of the image, so the usual h-6 would set it at
						 * ~6px and reduce it to green mush. h-10/h-12 puts it at 11-13px,
						 * which reads. The bar is h-16/md:h-20, so that still leaves
						 * 12-16px of breathing room above and below.
						 *
						 * The wordmark is near-black (#222323), so on the charcoal dark
						 * ground it would sit at 1.08:1 and vanish. invert+hue-rotate flips
						 * lightness while keeping hue: the wordmark lands at #dddcdc
						 * (12.5:1) and both the mark and the Chinese stay green.
						 */}
						<img
							src="/logo-lockup.png"
							alt=""
							width={1000}
							height={250}
							className="h-10 w-auto md:h-12 dark:hue-rotate-180 dark:invert"
						/>
					</Link>

					<nav
						aria-label="Primary"
						className="hidden items-center justify-center gap-9 lg:flex"
					>
						{NAV.map(({ label, to, hash }) => (
							<Link
								key={label}
								to={to}
								hash={hash}
								viewTransition={!hash}
								className="group relative py-1 text-sm text-muted-foreground transition-colors duration-500 ease-luxe hover:text-foreground motion-reduce:transition-none"
								activeOptions={{ exact: true, includeHash: false }}
								// Anchors on the landing page all match "/", so letting them
								// claim "active" would light up two links at once. Only real
								// routes mark where you are.
								activeProps={hash ? {} : { className: "text-foreground" }}
							>
								{label}
								{/* Emerald rule grows from the centre on hover, and stays put
                    on the active route. */}
								<span
									aria-hidden
									className={cn(
										"absolute inset-x-0 -bottom-0.5 h-px origin-center scale-x-0 bg-accent transition-transform duration-500 ease-luxe group-hover:scale-x-100 motion-reduce:transition-none",
										!hash && "group-data-[status=active]:scale-x-100",
									)}
								/>
							</Link>
						))}
					</nav>

					<div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
						{isAuthLoading && (
							<>
								<Skeleton className={cn("rounded-lg", TOUCH_TARGET)} />
								<Skeleton className={cn("rounded-lg", TOUCH_TARGET)} />
							</>
						)}

						{isAuthed && (
							<>
								{/*
								 * Signed-in only: inbox next to account. Guests never see the
								 * bell. Slim/checkout chrome deliberately omits this.
								 */}
								<NotificationBell triggerClassName={TOUCH_TARGET} />
								{/*
								 * One account affordance in the same place in both states: a
								 * person icon that signs you in, or opens your account once
								 * you are.
								 */}
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<Button
												variant="ghost"
												size="icon-sm"
												className={TOUCH_TARGET}
											/>
										}
									>
										<CircleUserRound />
										<span className="sr-only">Account</span>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuGroup>
											<DropdownMenuLabel>
												{auth.customer.name ||
													formatPhoneForDisplay(auth.customer.phone)}
											</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<DropdownMenuItem render={<Link to="/dashboard" />}>
												Dashboard
											</DropdownMenuItem>
											<DropdownMenuItem
												render={<Link to="/dashboard/notifications" />}
											>
												Notifications
											</DropdownMenuItem>
											<DropdownMenuItem
												render={<Link to="/dashboard/profile" />}
											>
												Profile
											</DropdownMenuItem>
											<DropdownMenuItem
												render={<Link to="/dashboard/settings" />}
											>
												Settings
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() =>
													void authStore
														.logout()
														.then(() => navigate({ to: "/" }))
												}
											>
												Sign out
											</DropdownMenuItem>
										</DropdownMenuGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							</>
						)}

						{isGuest && (
							<Button
								variant="ghost"
								size="icon-sm"
								className={TOUCH_TARGET}
								nativeButton={false}
								render={
									<Link to="/login">
										<CircleUserRound />
										<span className="sr-only">Sign in</span>
									</Link>
								}
							/>
						)}

						{!heroCtaOnScreen && (
							<Button
								size="sm"
								nativeButton={false}
								className="hidden md:inline-flex"
								render={
									<Link to="/order">Start an order</Link>
								}
							/>
						)}

						<Button
							variant="ghost"
							size="icon-sm"
							className={cn("lg:hidden", TOUCH_TARGET)}
							aria-expanded={menuOpen}
							aria-controls="mobile-nav"
							onClick={() => setMenuOpen((o) => !o)}
						>
							{menuOpen ? <X /> : <Menu />}
							<span className="sr-only">
								{menuOpen ? "Close menu" : "Open menu"}
							</span>
						</Button>
					</div>
				</div>

				{/*
				 * A full-width panel rather than a cramped dropdown: below lg this is
				 * the only way to reach the nav, and it deserves real touch targets.
				 */}
				{menuOpen && (
					<nav
						ref={mobileNavRef}
						id="mobile-nav"
						aria-label="Mobile"
						className="max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain border-t border-border bg-background lg:hidden"
					>
						<div className="mx-auto w-full max-w-[1600px] px-5 py-2 sm:px-8">
							{NAV.map(({ label, to, hash }) => (
								<Link
									key={label}
									to={to}
									hash={hash}
									viewTransition={!hash}
									onClick={() => setMenuOpen(false)}
									className="block border-b border-border py-4 text-base text-muted-foreground last:border-b-0"
									activeOptions={{ exact: !hash, includeHash: false }}
									activeProps={{ className: "text-foreground" }}
								>
									{label}
								</Link>
							))}
							{isAuthed && (
								<>
									<Link
										to="/dashboard"
										onClick={() => setMenuOpen(false)}
										className="block border-b border-border py-4 text-base text-muted-foreground"
									>
										Dashboard
									</Link>
									<Link
										to="/dashboard/notifications"
										onClick={() => setMenuOpen(false)}
										className="block border-b border-border py-4 text-base text-muted-foreground"
									>
										Notifications
									</Link>
								</>
							)}
							<div className="flex flex-col gap-3 py-4">
								<Button
									nativeButton={false}
									render={
										<Link to="/order" onClick={() => setMenuOpen(false)}>
											Start an order
										</Link>
									}
								/>
								{isGuest && (
									<Button
										variant="secondary"
										nativeButton={false}
										render={
											<Link to="/login" onClick={() => setMenuOpen(false)}>
												Sign in
											</Link>
										}
									/>
								)}
								{isAuthed && (
									<Button
										variant="secondary"
										onClick={() =>
											void authStore.logout().then(() => {
												setMenuOpen(false);
												void navigate({ to: "/" });
											})
										}
									>
										Sign out
									</Button>
								)}
							</div>
						</div>
					</nav>
				)}
			</header>
		</>
	);
}
