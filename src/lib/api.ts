/**
 * The customer API client. Auth (phone + OTP), profile, catalog, and order
 * placement talk to the real backend; the namespaces the backend doesn't
 * serve yet are still mocked and say so at their definition:
 *
 *   REAL  auth.requestOtp / register / verifyOtp / loginWithPin / logout,
 *         restoreSession, me.update / setPin /
 *         requestDeleteOtp / deleteAccount, catalog.*, orders.place / list /
 *         get, dashboard.overview, wallet.transactions, tracking.lookup,
 *         payments.dedicatedAccount (last placement only), watchCredits (polling)
 *   LOCAL me.settings (browser-only buyer preferences)
 *
 * A PIN is the only credential. It signs in against either identifier on the
 * account — email or phone — but only from a device that has already proven
 * the phone by OTP once; every new device starts with that OTP.
 * Transport (cookies, bearer, CSRF, serialized refresh) lives in lib/http.ts.
 */

import {
	ApiError,
	clearTokens,
	refreshSession,
	request,
	tokensIssued,
} from "./http";
import { normalizePhone } from "./phone";

export { ApiError };

export type Customer = {
	id: number | string;
	phone: string;
	name: string;
	company_name?: string | null;
	/** Doubles as a sign-in identifier: email + PIN resolves the same account. */
	email?: string | null;
};

/**
 * Buyer preferences that pre-fill the order flow and pick which depot the
 * dashboard quotes. Stored in this browser only until the backend carries
 * customer settings.
 */
export type CustomerSettings = {
	default_depot_id: number | null;
	default_loading: LoadingDetails | null;
};

export const DEFAULT_SETTINGS: CustomerSettings = {
	default_depot_id: null,
	default_loading: null,
};

export type Depot = {
	id: number;
	name: string;
	state: string;
	is_open: boolean;
};

export type DepotProduct = {
	id: number;
	depot_id: number;
	name: string;
	abbreviation: string;
	unit: string;
	price: number;
	available: boolean;
};

export type OrderLine = {
	product_id: number;
	abbreviation: string;
	name: string;
	unit: string;
	unit_price: number;
	quantity: number;
};

export type LoadingDetails =
	| { type: "pickup" }
	| { type: "delivery"; state: string; address: string };

/**
 * A pickup customer's own truck: a plate (optional — it can be filled or
 * corrected at the gate) and the litres it carries. When trucks are declared,
 * the backend caps each at TRUCK_CAPACITY_LITRES and requires the per-truck
 * quantities to sum to the order quantity — same split the WhatsApp bot
 * collects. Declaring them is optional; the gate can capture the split later.
 */
export type TruckEntry = { plate: string; quantity: number };

/** One tanker capacity. A declared truck may not exceed this; undeclared pickups defer the split to the gate. */
export const TRUCK_CAPACITY_LITRES = 60000;

export type PlacedOrder = {
	id: string;
	depot_id: number;
	depot_name: string;
	depot_state: string;
	lines: OrderLine[];
	total: number;
	loading: LoadingDetails;
	/** Backend payment deadline; omitted when paid or not yet available. */
	lock_expires_at?: string;
};

export type OrderStatus =
	| "awaiting_payment"
	| "paid"
	| "released"
	| "loading"
	| "loaded"
	| "cancelled"
	| "expired";

export type OrderRecord = {
	id: string;
	placed_at: string;
	depot_id: number;
	depot_name: string;
	lines: OrderLine[];
	total: number;
	status: OrderStatus;
	/** Set while an invoice is unpaid — the 1-hour price-lock deadline. */
	lock_expires_at?: string;
	/** Set while a truck is being loaded at the depot. */
	fulfilment?: { truck: string; note: string };
	/** "paid" once the transfer or wallet settles; "unpaid" until then. */
	payment_status?: "paid" | "unpaid";
	/** How the fuel leaves the depot — pickup, or delivery to a state/address. */
	loading?: LoadingDetails;
	/** The depot's bank account to pay into, carried while an order is still unpaid. */
	account?: VirtualAccount | null;
};

/**
 * Owner detail from GET /api/customer/orders/by-ref/:ref (or /:id) — the list
 * row plus the stage timeline and trucks, so the signed-in page doesn't need
 * a second hop to public tracking.
 */
export type OrderDetail = OrderRecord & {
	stage: TrackingStage | null;
	reached: Partial<Record<TrackingStage | "cancelled", string>>;
	note: string | null;
	trucks: OrderTruck[];
};

/** Pagination envelope returned by GET /api/customer/orders. */
export type OrdersPagination = {
	total: number;
	page: number;
	limit: number;
	pages: number;
};

export type OrdersListResult = {
	orders: OrderRecord[];
	pagination: OrdersPagination;
};

/** Filters accepted by the customer order list endpoint. */
export type OrdersListParams = {
	page?: number;
	limit?: number;
	/** Frontend status vocabulary — mapped to the backend's Pending/Paid/… */
	status?: OrderStatus;
	search?: string;
	dateFrom?: string;
	dateTo?: string;
};

/** One day's confirmed spend — the sparkline series, oldest to newest. */
export type SpendPoint = { date: string; spent: number };

export type WalletBalance = {
	/** Spendable prepaid credit — an order can pay from this instantly. */
	balance: number;
	deposit: number;
};

/** One ledger row from GET /api/customer/wallet/transactions. */
export type WalletTransaction = {
	id: number;
	type: "credit" | "debit";
	amount: number;
	ref: string | null;
	description: string;
	balanceAfter: number;
	/** ISO timestamp. */
	at: string;
};

export type WalletTransactionsParams = {
	page?: number;
	limit?: number;
	dateFrom?: string;
	dateTo?: string;
};

export type WalletTransactionsResult = {
	transactions: WalletTransaction[];
	pagination: OrdersPagination;
};

export type Commission = {
	id: number;
	orderId: number;
	orderNumber: string;
	depotName: string;
	productName: string;
	quantity: number;
	commissionRate: number;
	commissionAmount: number;
	status: "pending" | "paid";
	paidAt: string | null;
	createdAt: string;
};

export type CommissionSummary = {
	totalOrders: number;
	totalQuantity: number;
	pendingAmount: number;
	paidAmount: number;
};

export type CommissionsListParams = {
	page?: number;
	limit?: number;
	status?: "all" | "pending" | "paid";
	dateFrom?: string;
	dateTo?: string;
};

export type CommissionsListResult = {
	commissions: Commission[];
	pagination: OrdersPagination;
};

export type DashboardOverview = {
	wallet: WalletBalance;
	/** Orders still moving: unpaid invoices and trucks in fulfilment. */
	active: OrderRecord[];
	/** Completed orders, newest first. */
	past: OrderRecord[];
	month: { orders: number; litres: number; spent: number };
	/** Daily confirmed spend across the current month, for the sparkline. */
	trend: SpendPoint[];
};

/** The six public tracking stages, in order — mirrors the FAQ answer. */
export type TrackingStage =
	| "received"
	| "payment_confirmed"
	| "processing"
	| "released"
	| "loading"
	| "completed";

export type TrackedLine = {
	abbreviation: string;
	name: string;
	quantity: number;
	unit: string;
};

export type TruckStatus = "pending" | "gated_in" | "loaded" | "gated_out";

/** One allocated truck on the public tracking view — plate + status only. */
export type TrackedTruck = {
	index: number;
	plate: string | null;
	status: TruckStatus;
	/** Human phrasing of the status ("At the depot", "Ticket issued", …). */
	statusLabel: string;
};

/**
 * Owner detail truck — public tracking fields plus the declared quantity and
 * optional driver, so the dashboard can edit pickup declarations while loads
 * are still pending.
 */
export type OrderTruck = TrackedTruck & {
	quantity: number;
	driverName: string | null;
	driverPhone: string | null;
};

/**
 * Public view of an order for the tracking page. Anyone holding the
 * reference can see it, so it carries volumes and movement only — never
 * prices or the buyer's identity; invoices stay behind sign-in.
 */
export type TrackedOrder = {
	ref: string;
	placed_at: string;
	depot_name: string;
	depot_state: string;
	lines: TrackedLine[];
	loading: LoadingDetails;
	stage: TrackingStage;
	/** ISO timestamp for every stage the order has reached (current included). */
	reached: Partial<Record<TrackingStage, string>>;
	/** One-line situation report for the current stage. */
	note: string;
	/** Allocated trucks and where each is; empty until assigned at release. */
	trucks: TrackedTruck[];
};

export type VirtualAccount = {
	bank: string;
	account_number: string;
	account_name: string;
};

export type Passkey = {
	id: number;
	deviceName: string | null;
	createdAt: string;
};

/** A device that passed an OTP step-up and can now use a PIN. */
export type TrustedDevice = {
	id: number;
	deviceName: string | null;
	lastUsedAt: string | null;
	expiresAt: string;
};

/** The real, server-sourced state of every sign-in method on the account. */
export type Identities = {
	phone: { verified: boolean };
	hasPin: boolean;
	providers: { provider: string; verified: boolean; linkedAt: string }[];
	passkeys: Passkey[];
	trustedDevices: TrustedDevice[];
};

export type AuthSession = {
	id: number;
	deviceName: string | null;
	userAgent: string | null;
	ipAddress: string | null;
	lastUsedAt: string | null;
	createdAt: string;
	expiresAt: string;
	current: boolean;
};

export type PaymentCredit = {
	id: number | string;
	from: string;
	amount: number;
};

// ── Server shapes and mapping ────────────────────────────────────────────────

const AUTH = "/api/customer/auth";

type ServerCustomer = {
	id: number;
	name: string;
	phone: string;
	email: string | null;
	companyName: string | null;
	status: string;
	phoneVerifiedAt: string | null;
	address?: string;
};

type SessionData = {
	customer: ServerCustomer;
	accessToken: string;
	csrfToken?: string;
};

/**
 * The last customer any auth-ish endpoint returned. Lets calls that need a
 * detail about the signed-in customer work without a circular import of the
 * auth store.
 */
let knownCustomer: ServerCustomer | null = null;

function mapCustomer(c: ServerCustomer): Customer {
	knownCustomer = c;
	return {
		id: c.id,
		phone: c.phone ?? "",
		name: c.name ?? "",
		company_name: c.companyName ?? null,
		email: c.email ?? null,
	};
}

/** Restores the signed-in customer from the refresh cookie, if any. */
export async function restoreSession(): Promise<Customer | null> {
	const data = await refreshSession();
	const customer = (data as { customer?: ServerCustomer } | null)?.customer;
	return customer ? mapCustomer(customer) : null;
}

// ── Order placement bookkeeping ──────────────────────────────────────────────

type ServerOrder = {
	id: number;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	totalAmount: string | number;
	/** ISO deadline for unpaid Pending orders; null once paid/expired. */
	expiresAt?: string | null;
};

type ServerPayment = {
	accountNumber: string;
	bankName: string;
	accountName: string;
};

/** An order row as the list/dashboard endpoints return it. */
type ServerListOrder = {
	id: number;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	quantity: number;
	price: string | number;
	totalAmount: string | number;
	createdAt: string;
	depotId: number;
	depotName: string | null;
	productName: string | null;
	/** The trade code (PMS/AGO/…). Newer backends send it; older ones don't. */
	productCategory?: string | null;
	productUnit: string | null;
	deliveryType: string;
	/** Routing state — the delivery destination on delivery orders. */
	state?: string | null;
	deliveryAddress?: string | null;
	/** The depot's bank account to pay into, populated while the order is unpaid. */
	virtualAccountNumber?: string | null;
	virtualAccountBank?: string | null;
	virtualAccountName?: string | null;
	/** ISO payment deadline from the backend (ORDER_EXPIRY_HOURS after place). */
	expiresAt?: string | null;
};

/** Backend lifecycle status → the frontend's order vocabulary. */
const ORDER_STATUS: Record<string, OrderStatus> = {
	Pending: "awaiting_payment",
	Paid: "paid",
	Released: "released",
	Loading: "loading",
	Completed: "loaded",
	Cancelled: "cancelled",
	Expired: "expired",
};

/** Frontend status → the exact string the customer list filter accepts. */
const ORDER_STATUS_TO_SERVER: Record<OrderStatus, string> = {
	awaiting_payment: "Pending",
	paid: "Paid",
	released: "Released",
	loading: "Loading",
	loaded: "Completed",
	cancelled: "Cancelled",
	expired: "Expired",
};

/**
 * The clock time an order's price stays valid until — "06:42 pm".
 *
 * Shown as an absolute time rather than a countdown: the payment window is
 * hours long, and "valid till 6:42 pm" is something a buyer can plan a bank
 * transfer around, where "03:58:21 left" is only noise until the last few
 * minutes. The ISO comes from the backend's `expiresAt`.
 */
export function formatPriceValidUntil(iso: string | undefined): string | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return null;
	return new Date(t).toLocaleTimeString("en-NG", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** True once the order's price window has passed. */
export function isPriceExpired(iso: string | undefined): boolean {
	if (!iso) return false;
	const t = Date.parse(iso);
	return !Number.isNaN(t) && t <= Date.now();
}

/**
 * The inline phrase the order lists append to a row's meta line —
 * "price valid till 06:42 pm", or "price expired" once it has passed.
 * Null when the order carries no window at all.
 */
export function describePriceWindow(iso: string | undefined): string | null {
	const until = formatPriceValidUntil(iso);
	if (!until) return null;
	return isPriceExpired(iso) ? "price expired" : `price valid till ${until}`;
}

/**
 * Pre-order copy for the payment window. Prefer the hours from GET /api/catalog
 * (`orderExpiryHours`); when unknown, stay neutral so we never promise a
 * different window than the sweep enforces.
 */
export function paymentWindowCopy(hours: number | null | undefined): string {
	if (hours == null || !(hours > 0)) {
		return "Pay to confirm this order at the price shown — after that, you reorder at the current price.";
	}
	const unit = hours === 1 ? "hour" : "hours";
	return `Your price stays valid for ${hours} ${unit} from the time you order. Pay on the next step or from your dashboard — after that, you reorder at the current price.`;
}

/** Short marketing line; null when hours are not loaded yet. */
export function paymentWindowHoursLabel(
	hours: number | null | undefined,
): string | null {
	if (hours == null || !(hours > 0)) return null;
	const unit = hours === 1 ? "hour" : "hours";
	return `Price valid ${hours} ${unit} from the time you order`;
}

/** "24 hours" / "1 hour" for FAQ and legal prose; null until catalog loads. */
export function formatExpiryHoursPhrase(
	hours: number | null | undefined,
): string | null {
	if (hours == null || !(hours > 0)) return null;
	const unit = hours === 1 ? "hour" : "hours";
	return `${hours} ${unit}`;
}

/**
 * A server order row → the OrderRecord the dashboard and history render. The
 * backend is one product per order, so an order is always a single line. The
 * trade badge is the product's category (PMS/AGO) when the backend sends it,
 * falling back to the product name's initials for older payloads.
 */
function mapListOrder(o: ServerListOrder): OrderRecord {
	const quantity = Number(o.quantity) || 0;
	const total = Number(o.totalAmount) || 0;
	const unit_price = Number(o.price) || (quantity ? total / quantity : 0);
	const status = ORDER_STATUS[o.status] ?? "awaiting_payment";
	const unit =
		o.productUnit && o.productUnit !== "Liters"
			? o.productUnit.toLowerCase()
			: "litre";
	const name = o.productName ?? "Product";
	const abbreviation = o.productCategory || initials(name);
	const loading: LoadingDetails =
		o.deliveryType === "delivery"
			? {
					type: "delivery",
					state: o.state ?? "",
					address: o.deliveryAddress ?? "",
				}
			: { type: "pickup" };
	const account: VirtualAccount | null = o.virtualAccountNumber
		? {
				bank: o.virtualAccountBank ?? "",
				account_number: o.virtualAccountNumber,
				account_name: o.virtualAccountName ?? "",
			}
		: null;

	return {
		id: o.orderNumber,
		placed_at: o.createdAt,
		depot_id: o.depotId,
		depot_name: o.depotName ?? "Depot",
		lines: [{ product_id: 0, abbreviation, name, unit, unit_price, quantity }],
		total,
		status,
		payment_status: o.paymentStatus === "Paid" ? "paid" : "unpaid",
		loading,
		account,
		// Backend `expiresAt` is the payment deadline (ORDER_EXPIRY_HOURS). Never
		// invent one on the client — that drifted from the sweep before.
		...(status === "awaiting_payment" && o.expiresAt
			? { lock_expires_at: o.expiresAt }
			: {}),
	};
}

/** Owner detail payload — list shape plus progress + trucks. */
type ServerDetailOrder = ServerListOrder & {
	stage?: TrackingStage | null;
	reached?: Partial<Record<TrackingStage | "cancelled", string>>;
	note?: string | null;
	trucks?: {
		index: number;
		plate: string | null;
		quantity: number;
		status: TruckStatus;
		statusLabel: string;
		driverName: string | null;
		driverPhone: string | null;
	}[];
};

function mapDetailOrder(o: ServerDetailOrder): OrderDetail {
	return {
		...mapListOrder(o),
		stage: o.stage ?? null,
		reached: o.reached ?? {},
		note: o.note ?? null,
		trucks: (o.trucks ?? []).map((t) => ({
			index: t.index,
			plate: t.plate,
			quantity: Number(t.quantity),
			status: t.status,
			statusLabel: t.statusLabel,
			driverName: t.driverName ?? null,
			driverPhone: t.driverPhone ?? null,
		})),
	};
}

/** The sanitised tracking payload as GET /api/tracking/:ref returns it. */
type ServerTracked = {
	ref: string;
	placedAt: string;
	depotName: string;
	depotState: string;
	lines: {
		category: string | null;
		name: string;
		quantity: number;
		unit: string;
	}[];
	delivery:
		| { type: "pickup" }
		| { type: "delivery"; state: string; address: string };
	stage: TrackingStage;
	reached: Partial<Record<TrackingStage, string>>;
	note: string;
	trucks: TrackedTruck[];
};

function mapTracked(t: ServerTracked): TrackedOrder {
	return {
		ref: t.ref,
		placed_at: t.placedAt,
		depot_name: t.depotName,
		depot_state: t.depotState,
		lines: t.lines.map((l) => ({
			abbreviation: l.category || initials(l.name),
			name: l.name,
			quantity: l.quantity,
			unit: l.unit === "Liters" ? "litre" : l.unit.toLowerCase(),
		})),
		loading:
			t.delivery.type === "delivery"
				? {
						type: "delivery",
						state: t.delivery.state,
						address: t.delivery.address,
					}
				: { type: "pickup" },
		stage: t.stage,
		reached: t.reached,
		note: t.note,
		trucks: t.trucks ?? [],
	};
}

/**
 * The invoice screen asks for the funding account and payment progress in
 * separate calls that don't carry the order — remembered here from the
 * placement response instead.
 */
let lastPlacement: {
	orderIds: number[];
	/** Order references (order numbers) — the public-tracking key. */
	refs: string[];
	payment: ServerPayment;
	paidFromWallet: boolean;
	/** Placed without a session — progress must be watched via public tracking. */
	guest: boolean;
} | null = null;

// ── Catalog cache ────────────────────────────────────────────────────────────

type ServerCatalogDepot = {
	id: number;
	name: string;
	state: string;
	products: {
		id: number;
		name: string;
		category: string | null;
		unit: string;
		price: number;
	}[];
};

let catalogCache: {
	at: number;
	promise: Promise<CatalogPayload>;
} | null = null;
const CATALOG_TTL_MS = 30_000;

type CatalogPayload = {
	depots: ServerCatalogDepot[];
	/**
	 * From ORDER_EXPIRY_HOURS. `null` means expiry is switched off
	 * (ORDER_EXPIRY_DISABLED) — the copy drops the deadline promise. An older
	 * API that omits the field entirely defaults to 24.
	 */
	orderExpiryHours: number | null;
};

function fetchCatalogPayload(): Promise<CatalogPayload> {
	if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
		return catalogCache.promise;
	}
	const promise = request<{
		depots: ServerCatalogDepot[];
		orderExpiryHours?: number | null;
	}>("/api/catalog").then((data) => {
		// Explicit null = expiry switched off server-side; pass it through so the
		// copy goes neutral. A genuinely ABSENT field (older API) still defaults
		// to 24; only a present-but-null value means "no window".
		let orderExpiryHours: number | null;
		if (data.orderExpiryHours === null) {
			orderExpiryHours = null;
		} else {
			const hours = Number(data.orderExpiryHours);
			orderExpiryHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
		}
		return { depots: data.depots, orderExpiryHours };
	});
	catalogCache = { at: Date.now(), promise };
	promise.catch(() => {
		// A failed load must not poison the cache window.
		catalogCache = null;
	});
	return promise;
}

function fetchCatalog(): Promise<ServerCatalogDepot[]> {
	return fetchCatalogPayload().then((data) => data.depots);
}

/** "Premium Motor Spirit" → "PMS" when the server has no trade code. */
function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0] ?? "")
		.join("")
		.toUpperCase()
		.slice(0, 4);
}

const SETTINGS_KEY = "soroman.settings";

/**
 * Proof that this browser was already verified by a phone OTP step-up. Not
 * the refresh token and not a secret — it only lets a *correct* password skip
 * the second factor on a device that already passed it once. Safe to keep
 * client-side (the backend can revoke it under Trusted devices).
 */
const DEVICE_TOKEN_KEY = "soroman.device";
const readDeviceToken = (): string | undefined => {
	try {
		return localStorage.getItem(DEVICE_TOKEN_KEY) || undefined;
	} catch {
		return undefined;
	}
};
const writeDeviceToken = (token: string) => {
	try {
		localStorage.setItem(DEVICE_TOKEN_KEY, token);
	} catch {
		/* storage unavailable — step-up will just be asked again next time */
	}
};

export const api = {
	auth: {
		/**
		 * Sends a sign-in code to a REGISTERED number. The response is the same
		 * generic 200 whether or not the number exists (anti-enumeration) — an
		 * unregistered number silently receives nothing, which is why new
		 * customers go through register() instead.
		 */
		requestOtp: async (phone: string): Promise<{ devCode?: string }> => {
			const body = await request<{ devCode?: string }>(`${AUTH}/request-otp`, {
				method: "POST",
				body: { phone },
				retryOn401: false,
				raw: true,
			});
			return { devCode: body.devCode };
		},

		/**
		 * Creates the account (Pending) and sends the code that will activate
		 * it. Same generic 200 as requestOtp, by design. In dev mode the response
		 * carries the fixed code so the screen can show it for testing.
		 */
		register: async (input: {
			phone: string;
			name: string;
			/** Stored on the account so email + PIN sign-in has an identifier. */
			email?: string;
			companyName?: string;
		}): Promise<{ devCode?: string }> => {
			const body = await request<{ devCode?: string }>(`${AUTH}/register`, {
				method: "POST",
				body: {
					phone: input.phone,
					name: input.name,
					...(input.email ? { email: input.email } : {}),
					...(input.companyName ? { companyName: input.companyName } : {}),
				},
				retryOn401: false,
				raw: true,
			});
			return { devCode: body.devCode };
		},

		/**
		 * Verify the phone OTP. `trustDevice` remembers this browser (stores a
		 * device token) so a PIN can later stand in for the OTP here.
		 */
		verifyOtp: async (
			phone: string,
			otp: string,
			opts: { trustDevice?: boolean; deviceName?: string } = {},
		): Promise<{ customer: Customer }> => {
			const data = await request<SessionData & { deviceToken?: string }>(
				`${AUTH}/verify-otp`,
				{
					method: "POST",
					body: {
						phone,
						code: otp,
						...(opts.trustDevice
							? { trustDevice: true, deviceName: opts.deviceName }
							: {}),
					},
					retryOn401: false,
				},
			);
			tokensIssued(data);
			if (data.deviceToken) writeDeviceToken(data.deviceToken);
			return { customer: mapCustomer(data.customer) };
		},

		/** Has this browser been trusted (so PIN sign-in is possible)? */
		hasTrustedDevice: (): boolean => Boolean(readDeviceToken()),

		/** Drop the local trust proof after the user removes this browser from Trusted devices. */
		clearTrustedDevice: (): void => {
			try {
				localStorage.removeItem(DEVICE_TOKEN_KEY);
			} catch {
				/* ignore */
			}
		},

		/**
		 * Sign in with a PIN — the only credential the portal has. `identifier`
		 * is whichever the customer typed: an email address or a phone number,
		 * both of which resolve the same account server-side.
		 *
		 * A PIN is only ever a second factor for a device already proven by OTP,
		 * so the stored device token is mandatory; an unrecognised browser has
		 * to pass the phone OTP once first (which is what mints the token).
		 */
		loginWithPin: async (
			identifier: string,
			pin: string,
		): Promise<{ customer: Customer }> => {
			const deviceToken = readDeviceToken();
			if (!deviceToken) {
				throw new ApiError(
					401,
					"This device isn't set up for PIN sign-in yet.",
				);
			}
			// An "@" is the only thing that separates the two — a phone number can
			// never contain one, so this needs no cleverer test.
			const trimmed = identifier.trim();
			const credential = trimmed.includes("@")
				? { email: trimmed.toLowerCase() }
				: { phone: normalizePhone(trimmed) ?? trimmed };
			const data = await request<SessionData>(`${AUTH}/login/pin`, {
				method: "POST",
				body: { ...credential, pin, deviceToken },
				retryOn401: false,
			});
			tokensIssued(data);
			return { customer: mapCustomer(data.customer) };
		},

		logout: async () => {
			try {
				await request(`${AUTH}/logout`, {
					method: "POST",
					csrf: true,
					retryOn401: false,
				});
			} finally {
				clearTokens();
				knownCustomer = null;
				lastPlacement = null;
			}
		},
	},

	me: {
		update: async (
			patch: Partial<Pick<Customer, "name" | "company_name" | "email">>,
		): Promise<Customer> => {
			const body: Record<string, string> = {};
			if (patch.name !== undefined) body.name = patch.name;
			if (patch.company_name != null) body.companyName = patch.company_name;
			if (patch.email != null) body.email = patch.email;
			if (Object.keys(body).length === 0 && knownCustomer) {
				return mapCustomer(knownCustomer);
			}
			const data = await request<{ customer: ServerCustomer }>(
				"/api/customer/profile",
				{
					method: "PATCH",
					body,
				},
			);
			return mapCustomer(data.customer);
		},

		/** Browser-local buyer preferences until the backend stores settings. */
		settings: async (): Promise<CustomerSettings> => {
			try {
				const raw = localStorage.getItem(SETTINGS_KEY);
				return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
			} catch {
				return DEFAULT_SETTINGS;
			}
		},

		updateSettings: async (
			patch: Partial<CustomerSettings>,
		): Promise<CustomerSettings> => {
			const current = await api.me.settings();
			const next = { ...current, ...patch };
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
			return next;
		},

		/** Set (or replace) the 6-digit device PIN. Must be signed in. */
		setPin: async (pin: string): Promise<void> => {
			await request(`${AUTH}/pin`, { method: "POST", body: { pin } });
		},

		/**
		 * Send a purpose-scoped deletion OTP to the signed-in customer's phone.
		 * Blockers (wallet balance, open orders) return 409 before an SMS is burnt.
		 */
		requestDeleteOtp: async (): Promise<{ devCode?: string }> => {
			const body = await request<{ devCode?: string }>(
				`${AUTH}/account/request-otp`,
				{
					method: "POST",
					raw: true,
				},
			);
			return { devCode: body.devCode };
		},

		/**
		 * Permanently delete the signed-in customer account (App Store 5.1.1(v)).
		 * Requires the account_deletion OTP from requestDeleteOtp —
		 * DELETE /api/customer/auth/account { code }.
		 */
		deleteAccount: async (code: string): Promise<void> => {
			await request(`${AUTH}/account`, {
				method: "DELETE",
				csrf: true,
				retryOn401: false,
				body: { code },
			});
			clearTokens();
			knownCustomer = null;
			lastPlacement = null;
		},

		/**
		 * The true state of every sign-in method — the only source that says
		 * whether a PIN is set, which providers/passkeys are linked, and which
		 * devices are trusted. The account screen reads from here rather than
		 * the session payload, which carries none of it.
		 */
		identities: async (): Promise<Identities> => {
			const data = await request<{
				phone: { verified: boolean };
				identities: { provider: string; verified: boolean; linkedAt: string }[];
				passkeys: Passkey[];
				trustedDevices: TrustedDevice[];
			}>(`${AUTH}/identities`);
			return {
				phone: data.phone,
				hasPin: data.identities.some((i) => i.provider === "pin"),
				// PIN is surfaced as a flag, not an OAuth-style link. Legacy "email"
				// rows may still exist on old accounts; they no longer sign anyone in.
				providers: data.identities.filter(
					(i) => i.provider !== "email" && i.provider !== "pin",
				),
				passkeys: data.passkeys,
				trustedDevices: data.trustedDevices,
			};
		},

		/** A trusted device is what lets a PIN skip the OTP; revoke removes that. */
		revokeDevice: async (id: number): Promise<void> => {
			await request(`${AUTH}/devices/${id}`, { method: "DELETE" });
		},

		/** Every active login session for this customer, current one flagged. */
		sessions: async (): Promise<AuthSession[]> => {
			const data = await request<{ sessions: AuthSession[] }>(
				`${AUTH}/sessions`,
			);
			return data.sessions;
		},

		revokeSession: async (id: number): Promise<void> => {
			await request(`${AUTH}/sessions/${id}`, { method: "DELETE" });
		},

		/** Sign out every session except the one you're on. */
		revokeOtherSessions: async (): Promise<number> => {
			const sessions = await api.me.sessions();
			const others = sessions.filter((s) => !s.current);
			await Promise.all(others.map((s) => api.me.revokeSession(s.id)));
			return others.length;
		},
	},

	catalog: {
		depots: async (): Promise<Depot[]> => {
			const catalog = await fetchCatalog();
			// Present in the catalog = has a priced, in-stock product = open.
			return catalog.map((d) => ({
				id: d.id,
				name: d.name,
				state: d.state,
				is_open: true,
			}));
		},

		products: async (depotId?: number): Promise<DepotProduct[]> => {
			const catalog = await fetchCatalog();
			const all = catalog.flatMap((d) =>
				d.products.map((p) => ({
					id: p.id,
					depot_id: d.id,
					name: p.name,
					abbreviation: p.category || initials(p.name),
					unit: p.unit === "Liters" ? "litre" : p.unit.toLowerCase(),
					price: p.price,
					available: true,
				})),
			);
			return depotId ? all.filter((p) => p.depot_id === depotId) : all;
		},

		/** Payment window in hours — same value the expiry sweep uses. */
		orderExpiryHours: async (): Promise<number | null> => {
			const payload = await fetchCatalogPayload();
			return payload.orderExpiryHours;
		},
	},

	orders: {
		/**
		 * The backend takes one product per order, so a multi-product cart
		 * places one order per line (sequentially — server-side pricing and
		 * stock holds are per order). The invoice presents them as one bill:
		 * every order funds through the same dedicated account, and the
		 * reference lists every order number.
		 */
		place: async (input: {
			depot: Depot;
			lines: OrderLine[];
			loading: LoadingDetails;
			/** Pickup only: the truck split per product line, keyed by product_id. */
			trucks?: Record<number, TruckEntry[]>;
			/** The company this order is placed for — may differ from the buyer's
			 * own profile company. Optional; the backend stores "" when omitted. */
			companyName?: string;
			/**
			 * Guest checkout: place without a session. The phone identifies the
			 * order (find-or-create on the backend, same as registering later) and
			 * no account access is granted — history and wallet stay behind OTP.
			 */
			guest?: { name: string; phone: string; email?: string };
		}): Promise<PlacedOrder> => {
			if (input.lines.length === 0)
				throw new ApiError(400, "Nothing to order.");

			const companyName = input.companyName?.trim();
			const endpoint = input.guest
				? "/api/customer/orders/guest"
				: "/api/customer/orders";
			const placed: { order: ServerOrder; payment: ServerPayment }[] = [];
			for (const line of input.lines) {
				const body: Record<string, unknown> = {
					depot: input.depot.id,
					product: line.product_id,
					state:
						input.loading.type === "delivery"
							? input.loading.state
							: input.depot.state,
					quantity: line.quantity,
					deliveryType: input.loading.type,
				};
				if (companyName) body.companyName = companyName;
				if (input.guest) {
					body.name = input.guest.name.trim();
					body.phone = normalizePhone(input.guest.phone) ?? input.guest.phone;
					if (input.guest.email?.trim()) body.email = input.guest.email.trim();
				}
				if (input.loading.type === "delivery") {
					// The field the UI has always collected but never sent — the truck's
					// destination. Empty on pickup, where the depot is the address.
					body.deliveryAddress = input.loading.address.trim();
				} else {
					// Pickup: send this line's declared trucks. A blank plate is dropped
					// (the backend treats truckNumber as optional). Omitted entirely when
					// no trucks are declared — the gate captures them later at any quantity.
					const lineTrucks = (input.trucks?.[line.product_id] ?? [])
						.filter((t) => t.quantity > 0)
						.map((t) => ({
							truckNumber: t.plate.trim() || undefined,
							quantity: t.quantity,
						}));
					if (lineTrucks.length) body.trucks = lineTrucks;
				}
				const data = await request<{
					order: ServerOrder;
					payment: ServerPayment;
				}>(endpoint, { method: "POST", body });
				placed.push(data);
			}

			lastPlacement = {
				orderIds: placed.map((p) => p.order.id),
				refs: placed.map((p) => p.order.orderNumber),
				payment: placed[0].payment,
				paidFromWallet: placed.every((p) => p.order.paymentStatus === "Paid"),
				guest: Boolean(input.guest),
			};

			const total = placed.reduce(
				(sum, p) => sum + Number(p.order.totalAmount || 0),
				0,
			);
			const first = placed[0].order;
			return {
				id: placed.map((p) => p.order.orderNumber).join(", "),
				depot_id: input.depot.id,
				depot_name: input.depot.name,
				depot_state: input.depot.state,
				lines: input.lines,
				total:
					total > 0
						? total
						: input.lines.reduce((s, l) => s + l.unit_price * l.quantity, 0),
				loading: input.loading,
				...(lastPlacement.paidFromWallet || !first.expiresAt
					? {}
					: { lock_expires_at: first.expiresAt }),
			};
		},

		/**
		 * The customer's full order history, newest first — every status,
		 * cancelled included (unlike the dashboard, which drops cancelled and
		 * only carries the most recent handful). Supports status / search / date
		 * filters and pagination; the backend hard-caps `limit` at 100.
		 */
		list: async (params: OrdersListParams = {}): Promise<OrdersListResult> => {
			const query = new URLSearchParams();
			query.set("page", String(params.page ?? 1));
			query.set("limit", String(params.limit ?? 50));
			if (params.status)
				query.set("status", ORDER_STATUS_TO_SERVER[params.status]);
			if (params.search?.trim()) query.set("search", params.search.trim());
			if (params.dateFrom) query.set("dateFrom", params.dateFrom);
			if (params.dateTo) query.set("dateTo", params.dateTo);

			const data = await request<{
				orders: ServerListOrder[];
				pagination: OrdersPagination;
			}>(`/api/customer/orders?${query.toString()}`);

			return {
				orders: data.orders.map(mapListOrder),
				pagination: data.pagination,
			};
		},

		/**
		 * A single order by its reference (order number) — the value every invoice
		 * and SMS shows. Hits GET /api/customer/orders/by-ref/:ref; an unknown or
		 * foreign reference comes back as null (the endpoint 404s). Carries the
		 * stage timeline and trucks so the detail page needs no public tracking hop.
		 */
		get: async (ref: string): Promise<OrderDetail | null> => {
			const normalized = ref.trim().toUpperCase();
			if (!normalized) return null;
			try {
				const data = await request<{ order: ServerDetailOrder }>(
					`/api/customer/orders/by-ref/${encodeURIComponent(normalized)}`,
				);
				return mapDetailOrder(data.order);
			} catch (err) {
				if (err instanceof ApiError && err.status === 404) return null;
				throw err;
			}
		},

		/**
		 * Replace the pickup truck declaration on an order (plate/driver optional).
		 * Only while every load is still pending — once any load leaves pending,
		 * the depot owns corrections.
		 */
		updateTrucks: async (
			ref: string,
			trucks: {
				plate?: string;
				quantity: number;
				driverName?: string;
				driverPhone?: string;
			}[],
		): Promise<OrderDetail> => {
			const normalized = ref.trim().toUpperCase();
			const data = await request<{ order: ServerDetailOrder }>(
				`/api/customer/orders/by-ref/${encodeURIComponent(normalized)}/trucks`,
				{
					method: "PATCH",
					csrf: true,
					body: {
						trucks: trucks.map((t) => ({
							truckNumber: t.plate?.trim() || undefined,
							quantity: t.quantity,
							driverName: t.driverName?.trim() || undefined,
							driverPhone: t.driverPhone?.trim() || undefined,
						})),
					},
				},
			);
			return mapDetailOrder(data.order);
		},

		/**
		 * Cancel an unpaid pending order by its order number. Releases reserved
		 * stock; refuses once Paid or further along (409).
		 */
		cancelByRef: async (ref: string): Promise<OrderDetail> => {
			const normalized = ref.trim().toUpperCase();
			const data = await request<{ order: ServerDetailOrder }>(
				`/api/customer/orders/by-ref/${encodeURIComponent(normalized)}/cancel`,
				{ method: "POST", csrf: true },
			);
			return mapDetailOrder(data.order);
		},
	},

	dashboard: {
		overview: async (): Promise<DashboardOverview> => {
			const data = await request<{
				wallet: WalletBalance;
				month: { orders: number; litres: number; spent: number };
				trend: SpendPoint[];
				orders: ServerListOrder[];
			}>("/api/customer/dashboard");

			const mapped = data.orders.map(mapListOrder);
			return {
				wallet: data.wallet,
				// Active = anything still moving; past = delivered. Cancelled orders
				// fall out of both (they live in full history, not the dashboard).
				active: mapped.filter(
					(o) =>
						o.status === "awaiting_payment" ||
						o.status === "paid" ||
						o.status === "released" ||
						o.status === "loading",
				),
				past: mapped.filter((o) => o.status === "loaded"),
				month: data.month,
				trend: data.trend,
			};
		},
	},

	/**
	 * Prepaid wallet ledger. Balance still comes from dashboard.overview; this
	 * is the paginated credit/debit history behind the wallet card.
	 */
	wallet: {
		transactions: async (
			params: WalletTransactionsParams = {},
		): Promise<WalletTransactionsResult> => {
			const query = new URLSearchParams();
			query.set("page", String(params.page ?? 1));
			query.set("limit", String(params.limit ?? 20));
			if (params.dateFrom) query.set("dateFrom", params.dateFrom);
			if (params.dateTo) query.set("dateTo", params.dateTo);

			// Controller nests rows under data.data inside the success envelope;
			// request() unwraps one level, leaving { data, pagination }.
			const body = await request<{
				data: WalletTransaction[];
				pagination: OrdersPagination;
			}>(`/api/customer/wallet/transactions?${query.toString()}`);

			return {
				transactions: body.data,
				pagination: body.pagination,
			};
		},
	},

	tracking: {
		/**
		 * Public order tracking by reference (the order number). Sanitised
		 * server-side to movement only — no price, total, or buyer identity — so
		 * anyone holding the reference can check it. A missing/cancelled order
		 * comes back as null (the endpoint 404s).
		 */
		lookup: async (ref: string): Promise<TrackedOrder | null> => {
			const normalized = ref.trim().toUpperCase();
			if (!normalized) return null;
			let data: { tracked: ServerTracked };
			try {
				data = await request<{ tracked: ServerTracked }>(
					`/api/tracking/${encodeURIComponent(normalized)}`,
					{ retryOn401: false },
				);
			} catch (err) {
				if (err instanceof ApiError && err.status === 404) return null;
				throw err;
			}
			return mapTracked(data.tracked);
		},
	},

	payments: {
		/**
		 * The account to pay the just-placed order into — the DEPOT's bank
		 * account, returned by the placement response. Personal Paystack DVAs
		 * are gone (the backend is manual-deposit only), so this exists solely
		 * for the invoice step, which always runs right after a placement.
		 */
		dedicatedAccount: async (): Promise<VirtualAccount> => {
			if (lastPlacement) {
				const p = lastPlacement.payment;
				return {
					bank: p.bankName,
					account_number: p.accountNumber,
					account_name: p.accountName,
				};
			}
			throw new ApiError(404, "No pending order to pay.");
		},

		/**
		 * Watches the just-placed orders until the backend marks them paid (the
		 * Paystack webhook advances them), emitting one credit per order as it
		 * flips. Polling stands in for a webhook-fed socket the backend doesn't
		 * expose yet.
		 */
		watchCredits: (
			total: number,
			onCredit: (credit: PaymentCredit) => void,
		): (() => void) => {
			const placement = lastPlacement;
			if (!placement) return () => {};

			if (placement.paidFromWallet) {
				const t = setTimeout(
					() =>
						onCredit({
							id: "wallet",
							from: "Paid from wallet balance",
							amount: total,
						}),
					800,
				);
				return () => clearTimeout(t);
			}

			const seen = new Set<number>();
			// A guest has no session, so the authed order endpoint would 401 on
			// every tick. Public tracking answers by reference instead: an order
			// whose timeline has reached payment_confirmed has been paid. Amounts
			// aren't public, so the guest credit carries the invoice total (guests
			// place a single order — the wizard is one product per order).
			const poll = placement.guest
				? async () => {
						for (const [i, ref] of placement.refs.entries()) {
							const orderId = placement.orderIds[i];
							if (seen.has(orderId)) continue;
							try {
								const tracked = await api.tracking.lookup(ref);
								if (tracked?.reached.payment_confirmed) {
									seen.add(orderId);
									onCredit({
										id: orderId,
										from: `Transfer confirmed · ${ref}`,
										amount: total,
									});
								}
							} catch {
								// Transient — next tick tries again.
							}
						}
						if (seen.size === placement.orderIds.length) stop();
					}
				: async () => {
						for (const orderId of placement.orderIds) {
							if (seen.has(orderId)) continue;
							try {
								const data = await request<{ order: ServerOrder }>(
									`/api/customer/orders/${orderId}`,
								);
								if (data.order.paymentStatus === "Paid") {
									seen.add(orderId);
									onCredit({
										id: orderId,
										from: `Transfer confirmed · ${data.order.orderNumber}`,
										amount: Number(data.order.totalAmount || 0),
									});
								}
							} catch {
								// Transient — next tick tries again.
							}
						}
						if (seen.size === placement.orderIds.length) stop();
					};

			const interval = setInterval(() => void poll(), 8000);
			const stop = () => clearInterval(interval);
			void poll();
			return stop;
		},
	},

	commissions: {
		list: async (
			params: CommissionsListParams = {},
		): Promise<CommissionsListResult> => {
			const query = new URLSearchParams();
			query.set("page", String(params.page ?? 1));
			query.set("limit", String(params.limit ?? 10));
			if (params.status && params.status !== "all")
				query.set("status", params.status);
			if (params.dateFrom) query.set("dateFrom", params.dateFrom);
			if (params.dateTo) query.set("dateTo", params.dateTo);

			const body = await request<{
				commissions: Commission[];
				pagination: OrdersPagination;
			}>(`/api/customer/commissions?${query.toString()}`);

			return {
				commissions: body.commissions,
				pagination: body.pagination,
			};
		},

		summary: async (): Promise<CommissionSummary> => {
			const body = await request<{ summary: CommissionSummary }>(
				"/api/customer/commissions/summary",
			);
			return body.summary;
		},
	},
};

// Phone normalization lives in lib/phone.ts (libphonenumber, matching the
// backend); re-exported here because most consumers already import it with
// the rest of the API surface.
export { formatPhoneForDisplay, normalizePhone } from "./phone";
