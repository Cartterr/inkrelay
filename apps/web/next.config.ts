import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ["@inkrelay/core", "@inkrelay/db", "@inkrelay/rendering"],
};

export default config;
