/**
 * Typed errors for Recall API responses.
 *
 * The docs document four status codes the client must distinguish:
 *  - 401: bad/missing/expired key → user-actionable (re-enter key)
 *  - 404: resource gone → caller decides whether to delete local note
 *  - 422: validation error → bug in the plugin's request shape
 *  - 500: transient server error → retry with backoff, surface request_id
 *
 * Anything else is wrapped as RecallApiError with the raw status preserved.
 */

export class RecallApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body?: unknown,
		readonly requestId?: string,
	) {
		super(message);
		this.name = "RecallApiError";
	}
}

export class RecallAuthError extends RecallApiError {
	constructor(body?: unknown) {
		super("Recall API key is missing, invalid, or expired.", 401, body);
		this.name = "RecallAuthError";
	}
}

export class RecallNotFoundError extends RecallApiError {
	constructor(body?: unknown, requestId?: string) {
		super("Recall resource not found.", 404, body, requestId);
		this.name = "RecallNotFoundError";
	}
}

export class RecallValidationError extends RecallApiError {
	constructor(body?: unknown) {
		super("Recall API rejected the request payload.", 422, body);
		this.name = "RecallValidationError";
	}
}

export class RecallServerError extends RecallApiError {
	constructor(body?: unknown, requestId?: string) {
		super("Recall API returned a server error.", 500, body, requestId);
		this.name = "RecallServerError";
	}
}

export function errorForStatus(
	status: number,
	body: unknown,
): RecallApiError {
	const requestId = extractRequestId(body);
	switch (status) {
		case 401:
			return new RecallAuthError(body);
		case 404:
			return new RecallNotFoundError(body, requestId);
		case 422:
			return new RecallValidationError(body);
		case 500:
			return new RecallServerError(body, requestId);
		default:
			return new RecallApiError(
				`Recall API returned HTTP ${status}.`,
				status,
				body,
				requestId,
			);
	}
}

function extractRequestId(body: unknown): string | undefined {
	if (body && typeof body === "object" && "detail" in body) {
		const detail = (body as { detail: unknown }).detail;
		if (detail && typeof detail === "object" && "request_id" in detail) {
			const id = (detail as { request_id: unknown }).request_id;
			return typeof id === "string" ? id : undefined;
		}
	}
	return undefined;
}
