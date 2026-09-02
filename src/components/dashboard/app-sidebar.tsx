import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Bell,
	ChevronsUpDown,
	Factory,
	FileCheck,
	Flame,
	HandCoins,
	LayoutDashboard,
	LogOut,
	MessageCircle,
	Package,
	Settings,
	SquarePlus,
	Tag,
	UserRound,
	Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { env } from "@/env";

import { formatPhoneForDisplay } from "@/lib/api";
import { authStore, useAuth } from "@/lib/auth";
import { SUPPORT_WHATSAPP_URL } from "@/lib/company";

// Overview is the home, not a buying action — it sits above the groups.
// Buy holds the ways money starts moving; Manage holds depot, Dangote, and
// cooking-gas orders already in flight. New orders of every kind go through /order.
const BUY = [
	{ label: "New order", to: "/order", icon: SquarePlus },
	{ label: "Depot prices", to: "/dashboard/prices", icon: Tag },
] as const;

const MANAGE = [
	{ label: "Depot orders", to: "/dashboard/orders", icon: Package },
	{ label: "Dangote orders", to: "/dashboard/dangote-delivery", icon: Factory },
	{ label: "Licenses", to: "/dashboard/licenses", icon: FileCheck },
	...(env.VITE_COOKING_GAS_ENABLED
		? ([
				{
					label: "Cooking gas orders",
					to: "/dashboard/cooking-gas",
					icon: Flame,
				},
			] as const)
		: []),
] as const;

const ACCOUNT = [
	{ label: "Commissions", to: "/dashboard/commissions", icon: HandCoins },
	{ label: "Wallet", to: "/dashboard/wallet", icon: Wallet },
	{ label: "Notifications", to: "/dashboard/notifications", icon: Bell },
	{ label: "Profile", to: "/dashboard/profile", icon: UserRound },
	{ label: "Settings", to: "/dashboard/settings", icon: Settings },
] as const;

// Same desk as the slim header — the dashboard shouldn't be the one surface
// with no path to a human.
const SUPPORT_URL = SUPPORT_WHATSAPP_URL;

export function AppSidebar() {
	const auth = useAuth();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const customer = auth.status === "authed" ? auth.customer : null;
	const displayName =
		customer?.company_name ||
		customer?.name ||
		(customer ? formatPhoneForDisplay(customer.phone) : "");
	const initials =
		displayName
			.split(/\s+/)
			.map((w) => w[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?";

	return (
		<Sidebar variant="inset" collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						{/* Same wordmark treatment as the site header (see header.tsx for
                the dark-mode filter rationale); the square mark takes over
                when the rail collapses to icons. */}
						<SidebarMenuButton
							size="lg"
							render={<Link to="/dashboard" />}
							tooltip="Soroman"
						>
							<img
								src="/favicon.png"
								alt=""
								width={32}
								height={32}
								className="hidden size-8 shrink-0 group-data-[collapsible=icon]:block"
							/>
							<img
								src="/logo-full.png"
								alt="Soroman"
								width={720}
								height={131}
								className="h-5 w-auto group-data-[collapsible=icon]:hidden dark:hue-rotate-180 dark:invert"
							/>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={pathname === "/dashboard"}
									tooltip="Overview"
									render={<Link to="/dashboard" />}
								>
									<LayoutDashboard />
									<span>Overview</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel className="text-[0.65rem] tracking-[0.22em] uppercase">
						Buy
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{BUY.map(({ label, to, icon: Icon }) => (
								<SidebarMenuItem key={label}>
									<SidebarMenuButton
										isActive={pathname === to}
										tooltip={label}
										render={<Link to={to} />}
									>
										<Icon />
										<span>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel className="text-[0.65rem] tracking-[0.22em] uppercase">
						Manage
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{MANAGE.map(({ label, to, icon: Icon }) => (
								<SidebarMenuItem key={label}>
									<SidebarMenuButton
										isActive={pathname === to || pathname.startsWith(`${to}/`)}
										tooltip={label}
										render={<Link to={to} />}
									>
										<Icon />
										<span>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel className="text-[0.65rem] tracking-[0.22em] uppercase">
						Account
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{ACCOUNT.map(({ label, to, icon: Icon }) => (
								<SidebarMenuItem key={label}>
									<SidebarMenuButton
										isActive={pathname === to || pathname.startsWith(`${to}/`)}
										tooltip={label}
										render={<Link to={to} />}
									>
										<Icon />
										<span>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
							<SidebarMenuItem>
								<SidebarMenuButton
									tooltip="Support"
									render={
										<a href={SUPPORT_URL} target="_blank" rel="noreferrer" />
									}
								>
									<MessageCircle />
									<span>Support</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={<SidebarMenuButton size="lg" tooltip="Account" />}
							>
								<Avatar className="size-8">
									<AvatarFallback className="text-xs">
										{initials}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left leading-tight">
									<span className="truncate text-sm font-medium">
										{displayName}
									</span>
									{customer && (
										<span className="text-muted-foreground truncate text-xs">
											{formatPhoneForDisplay(customer.phone)}
										</span>
									)}
								</div>
								<ChevronsUpDown className="ml-auto size-4" />
							</DropdownMenuTrigger>
							<DropdownMenuContent side="top" align="start" className="w-56">
								<DropdownMenuGroup>
									<DropdownMenuLabel>{displayName}</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={() => void navigate({ to: "/dashboard/profile" })}
									>
										<UserRound />
										Profile
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => void navigate({ to: "/dashboard/settings" })}
									>
										<Settings />
										Settings
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											void authStore.logout().then(() => navigate({ to: "/" }))
										}
									>
										<LogOut />
										Sign out
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
