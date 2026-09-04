import { createFileRoute, Outlet } from "@tanstack/react-router";

import Footer from "@/components/footer";
import Header from "@/components/header";
import { NotFoundContent } from "@/components/not-found";

// Pathless layout: the focused surfaces — checkout and the auth pages. They
// used to wear their own slim chrome, but a visitor moving between the
// landing page, an order and sign-in should never watch the frame change
// underneath them, so this tree carries the same header and footer as _site.
// The wizards keep their own pinned back control for the step-level exit.
export const Route = createFileRoute("/_slim")({
	component: SlimLayout,
	notFoundComponent: NotFoundContent,
});

function SlimLayout() {
	return (
		<div className="flex min-h-svh flex-col">
			<Header />
			<main className="vt-page flex-1">
				<Outlet />
			</main>
			<Footer />
		</div>
	);
}
