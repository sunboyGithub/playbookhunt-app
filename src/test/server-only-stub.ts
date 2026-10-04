// Stand-in for the `server-only` package inside Vitest.
//
// The real package throws on import when a module ends up in a client bundle.
// That is a useful guard in the app but wrong in a test, where importing a
// server module is the point. Aliased in vitest.config.mts; see the note there.
export {};