import { describe, expect, test } from "vitest";

import { isAllowedGithubLogin } from "../lib/authorization.js";

describe("dashboard authorization", () => {
  test.each(["Cartterr", "cartterr", "CARTTERR"])("permits the owner login %s", (login) => {
    expect(isAllowedGithubLogin(login, "Cartterr")).toBe(true);
  });

  test.each([null, undefined, "", "octocat", "Cartterr-admin"])(
    "rejects non-owner identity %s",
    (login) => expect(isAllowedGithubLogin(login, "Cartterr")).toBe(false),
  );
});
