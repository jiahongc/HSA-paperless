export function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: number; response?: { status?: number } };
  const code = maybeError.code;
  const status = maybeError.response?.status;
  return code === 401 || code === 403 || status === 401 || status === 403;
}
