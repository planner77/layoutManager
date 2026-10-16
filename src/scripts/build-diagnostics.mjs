/** Fail production builds on unresolved module export/import diagnostics.
 * Next/Webpack can report these as non-fatal warnings even when a Worker
 * would fail at runtime, as observed in Issue #31 v0.28.1. */
const fatalDiagnostics = [
  /Attempted import error:/i,
  /export\s+['"`][^'"`]+['"`](?:\s+\(imported as\s+['"`][^'"`]+['"`]\))?\s+was not found/i,
  /Module not found:\s+Can't resolve/i,
];

export function hasFatalModuleDiagnostic(log) {
  // Strip ANSI SGR sequences before looking for stable webpack diagnostics.
  const plain = String(log).replace(/\x1b\[[0-9;]*m/g, '');
  return fatalDiagnostics.some(pattern => pattern.test(plain));
}
