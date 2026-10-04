import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * AGENTS.md is the project brief, specified verbatim by P0. Next.js otherwise
   * appends its own generated agent-rules block to that file on every `next dev`,
   * which would stop it matching the brief. The brief already tells agents to
   * read the installed Next.js framework documentation, so nothing is lost.
   */
  agentRules: false,
};

export default nextConfig;
