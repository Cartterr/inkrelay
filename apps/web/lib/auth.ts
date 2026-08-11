import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { isAllowedGithubLogin } from "./authorization";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID ?? "missing-github-client-id",
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? "missing-github-client-secret",
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      const login = typeof profile?.login === "string" ? profile.login : null;
      return isAllowedGithubLogin(login, process.env.ALLOWED_GITHUB_LOGIN ?? "Cartterr");
    },
    jwt({ token, profile }) {
      if (typeof profile?.login === "string") token.githubLogin = profile.login;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { githubLogin?: string }).githubLogin =
          typeof token.githubLogin === "string" ? token.githubLogin : undefined;
      }
      return session;
    },
  },
});

export async function requireOwner(): Promise<string> {
  const session = await auth();
  const login = (session?.user as { githubLogin?: string } | undefined)?.githubLogin;
  const allowed = process.env.ALLOWED_GITHUB_LOGIN ?? "Cartterr";
  if (!isAllowedGithubLogin(login, allowed)) throw new Error("Unauthorized");
  return login as string;
}
