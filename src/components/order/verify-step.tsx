import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { z } from "zod";
import { FieldError, showFieldError } from "@/components/field-error";
import { BoxedInput } from "@/components/order/boxed";
import PhoneField from "@/components/phone-field";
import { Label } from "@/components/ui/label";
import { normalizePhone } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
	optionalEmailSchema,
	phoneSchema,
	requiredTrimmed,
} from "@/lib/validation";

const FIELD_LABEL =
	"text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase";

const detailsSchema = z.object({
	name: requiredTrimmed("Your name is required."),
	phone: phoneSchema,
	email: optionalEmailSchema,
});

/** The guest's identity, ready to ride along with the order placement. */
export type GuestDetails = { name: string; phone: string; email?: string };

type VerifyStepProps = {
	error: string | null;
	onError: (message: string | null) => void;
	/**
	 * Fires with validated details; the parent stores them and advances to
	 * review. No OTP here — the order is placed as a guest, and the phone is
	 * only ever proven later, when (if) they sign in to see their history.
	 */
	onReady: (guest: GuestDetails) => void;
	/** Advances past this step when a session already exists (or appears). */
	onVerified: () => void;
	continueHandlerRef: { current: (() => Promise<void>) | null };
};

/**
 * Guest details after Loading — name, phone, optional email. No verification
 * code: placing an unpaid order doesn't warrant one, and the OTP stays where
 * the stakes are (seeing history, spending a wallet). Signed-in buyers are
 * advanced by the parent; this step is skipped for them.
 */
export default function VerifyStep({
	error,
	onError,
	onReady,
	onVerified,
	continueHandlerRef,
}: VerifyStepProps) {
	const auth = useAuth();

	const form = useForm({
		defaultValues: {
			name: auth.status === "authed" ? auth.customer.name || "" : "",
			phone: auth.status === "authed" ? auth.customer.phone || "" : "",
			email: auth.status === "authed" ? auth.customer.email?.trim() || "" : "",
		},
		validators: { onChange: detailsSchema },
	});

	// Mid-wizard sign-in (e.g. another tab) — advance to review.
	useEffect(() => {
		if (auth.status === "authed") onVerified();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [auth.status]);

	continueHandlerRef.current = async () => {
		const parsed = detailsSchema.safeParse(form.state.values);
		if (!parsed.success) {
			onError(
				parsed.error.issues[0]?.message ??
					"Add your name and phone number to continue.",
			);
			return;
		}
		onError(null);
		onReady({
			name: parsed.data.name.trim(),
			phone: normalizePhone(parsed.data.phone) ?? parsed.data.phone,
			email: parsed.data.email.trim() || undefined,
		});
	};

	return (
		<section>
			<p className="mb-5 text-sm text-muted-foreground">
				Your phone number is all the order needs — no code, no password. Sign in
				with it any time to see your orders.
			</p>
			<div className="grid gap-5">
				<form.Field name="name">
					{(field) => (
						<div className="grid gap-1.5">
							<Label htmlFor="depot-account-name" className={FIELD_LABEL}>
								Your name
							</Label>
							<BoxedInput
								id="depot-account-name"
								autoComplete="name"
								placeholder="Ada Obi"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
								aria-invalid={showFieldError(field.state.meta) || undefined}
								aria-describedby="depot-account-name-error"
								autoFocus
							/>
							<FieldError
								meta={field.state.meta}
								id="depot-account-name-error"
							/>
						</div>
					)}
				</form.Field>

				<form.Field name="phone">
					{(field) => (
						<div className="grid gap-1.5">
							<Label htmlFor="depot-account-phone" className={FIELD_LABEL}>
								Phone number
							</Label>
							<PhoneField
								id="depot-account-phone"
								autoComplete="tel"
								value={field.state.value}
								onChange={field.handleChange}
								onBlur={field.handleBlur}
								aria-invalid={showFieldError(field.state.meta) || undefined}
								aria-describedby="depot-account-phone-error"
								inputComponent={BoxedInput}
							/>
							<FieldError
								meta={field.state.meta}
								id="depot-account-phone-error"
							/>
							<p className="text-xs text-muted-foreground">
								The order is saved against this number — it identifies you at
								the depot and on WhatsApp.
							</p>
						</div>
					)}
				</form.Field>

				<form.Field name="email">
					{(field) => (
						<div className="grid gap-1.5">
							<Label htmlFor="depot-account-email" className={FIELD_LABEL}>
								Email <span className="normal-case">(optional)</span>
							</Label>
							<BoxedInput
								id="depot-account-email"
								type="email"
								inputMode="email"
								autoComplete="email"
								placeholder="ada@company.com"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
								aria-invalid={showFieldError(field.state.meta) || undefined}
								aria-describedby="depot-account-email-error"
							/>
							<FieldError
								meta={field.state.meta}
								id="depot-account-email-error"
							/>
							<p className="text-xs text-muted-foreground">
								Used for your invoice and order updates.
							</p>
						</div>
					)}
				</form.Field>

				{error && (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				)}
			</div>
		</section>
	);
}
