export function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: number; response?: { status?: number } };
  return maybeError.code === 401 || maybeError.response?.status === 401;
}
