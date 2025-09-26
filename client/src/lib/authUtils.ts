export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export async function requestSignOut(): Promise<void> {
  const response = await fetch("/api/auth/signout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const message = (await response.text()) || "Unable to sign out";
    throw new Error(message);
  }
}
