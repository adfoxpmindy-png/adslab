/**
 * Typed shapes returned by Meta's Graph / Marketing API.
 * Only fields AdsLab uses are typed here — Meta returns many more.
 */

export type MetaUser = {
  id: string;
  name: string;
};

export type MetaTokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in?: number; // seconds until expiry; absent for never-expiring app/page tokens
};

export type MetaBusinessRef = {
  id: string;
  name: string;
};

export type MetaAdAccountFromApi = {
  id: string; // "act_1234567890"
  account_id?: string; // "1234567890"
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  business?: MetaBusinessRef;
};

export type MetaPagedResponse<T> = {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
    previous?: string;
  };
};

export type MetaErrorBody = {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
    /** Localized error title (Meta returns Thai if account locale is th_TH). */
    error_user_title?: string;
    /** Localized error explanation — better for user-facing messages than `message`. */
    error_user_msg?: string;
  };
};

export class MetaApiError extends Error {
  readonly code: number;
  readonly subcode?: number;
  readonly type: string;
  readonly fbtraceId?: string;
  readonly status: number;
  readonly userTitle?: string;
  readonly userMessage?: string;

  constructor(body: MetaErrorBody, httpStatus: number) {
    // Prefer the localized user-facing message when present — it's
    // already translated and worded for end users.
    super(body.error.error_user_msg ?? body.error.message);
    this.name = "MetaApiError";
    this.code = body.error.code;
    this.subcode = body.error.error_subcode;
    this.type = body.error.type;
    this.fbtraceId = body.error.fbtrace_id;
    this.status = httpStatus;
    this.userTitle = body.error.error_user_title;
    this.userMessage = body.error.error_user_msg;
  }

  /** Code 190 = token issues (expired / revoked / invalid). */
  get isTokenInvalid(): boolean {
    return this.code === 190;
  }

  /** Codes 4 and 17 = rate limited (per-app / per-user). */
  get isRateLimited(): boolean {
    return this.code === 4 || this.code === 17 || this.status === 429;
  }

  /** Codes 1, 2 = transient server errors. */
  get isTransient(): boolean {
    return this.code === 1 || this.code === 2 || this.status >= 500;
  }
}
