/**
 * Omise SDK singleton. The `omise` package has no shipped types, so
 * we declare a minimal interface for the methods we actually call.
 */

interface OmiseCustomersApi {
  create(opts: {
    email?: string;
    description?: string;
    card?: string;
    metadata?: Record<string, string>;
  }): Promise<OmiseCustomer>;
  update(
    id: string,
    opts: { default_card?: string; card?: string },
  ): Promise<OmiseCustomer>;
  retrieve(id: string): Promise<OmiseCustomer>;
}

interface OmiseChargesApi {
  create(opts: {
    amount: number; // satang (THB × 100)
    currency: "thb";
    customer?: string;
    card?: string;
    description?: string;
    metadata?: Record<string, string>;
    return_uri?: string;
  }): Promise<OmiseCharge>;
  retrieve(id: string): Promise<OmiseCharge>;
  createRefund(
    chargeId: string,
    opts: { amount: number; metadata?: Record<string, string> },
  ): Promise<OmiseRefund>;
}

export type OmiseCustomer = {
  object: "customer";
  id: string;
  livemode: boolean;
  default_card: string | null;
  email: string | null;
  description: string | null;
  created_at: string;
};

export type OmiseCharge = {
  object: "charge";
  id: string;
  livemode: boolean;
  amount: number;
  currency: string;
  status: "successful" | "pending" | "failed" | "expired" | "reversed";
  paid: boolean;
  authorize_uri: string | null;
  return_uri: string | null;
  failure_code: string | null;
  failure_message: string | null;
  customer: string | null;
  card: { id: string; brand: string; last_digits: string } | null;
  metadata: Record<string, string>;
  created_at: string;
  paid_at: string | null;
};

export type OmiseRefund = {
  object: "refund";
  id: string;
  amount: number;
  charge: string;
  created_at: string;
};

interface OmiseTokensApi {
  create(opts: {
    card: {
      name: string;
      number: string;
      expiration_month: number;
      expiration_year: number;
      security_code: string;
    };
  }): Promise<{ id: string; object: "token" }>;
}

interface OmiseClient {
  customers: OmiseCustomersApi;
  charges: OmiseChargesApi;
  tokens: OmiseTokensApi;
}

let cached: OmiseClient | null = null;

export function omise(): OmiseClient {
  if (cached) return cached;
  const secretKey = process.env.OMISE_SECRET_KEY;
  const publicKey = process.env.OMISE_PUBLIC_KEY;
  if (!secretKey) {
    throw new Error("OMISE_SECRET_KEY not set");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const omiseLib = require("omise");
  // publicKey is required for tokens.create (server-side tokenization
  // used in our e2e tests). In normal app flow the browser tokenizes
  // and we only ever pass card tokens to omise.customers — that path
  // works with just the secret key.
  cached = omiseLib({ secretKey, publicKey, omiseVersion: "2019-05-29" }) as OmiseClient;
  return cached;
}

/** Convert THB integer → satang for Omise API. */
export function toSatang(thb: number): number {
  return Math.round(thb * 100);
}

/** Convert satang → THB integer. */
export function fromSatang(satang: number): number {
  return Math.round(satang / 100);
}
