/**
 * Centered auth layout: a single panel on the plain ground — no split-screen
 * side panel, so it reads the same at every viewport. Login, register and
 * forgot-password all sit in it.
 *
 * The page frame (logo, nav, legal links) comes from the _slim layout's shared
 * header and footer, so this shell no longer carries a brand mark, a back
 * control or a link row of its own — each would be the second one on screen.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-start justify-center px-4 py-14 sm:py-20">
			<div className="w-full max-w-md">
				<div className="rounded-xl border border-foreground/15 bg-background p-7 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:p-10">
					{children}
				</div>
			</div>
		</div>
	);
}
