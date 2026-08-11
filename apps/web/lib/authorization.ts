export function isAllowedGithubLogin(
  login: string | null | undefined,
  allowedLogin: string,
): boolean {
  return Boolean(
    login && login.localeCompare(allowedLogin, undefined, { sensitivity: "accent" }) === 0,
  );
}
