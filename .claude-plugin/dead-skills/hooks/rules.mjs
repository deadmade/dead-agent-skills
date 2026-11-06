// Shared policy receives only the active instruction text, never harness paths or events.
export function startupRules({ rules, globalInstructions, markers }) {
  const a = globalInstructions.indexOf(markers.start);
  const b = globalInstructions.indexOf(markers.end);
  if (
    a < 0 !== b < 0 ||
    (a >= 0 &&
      (b < a ||
        globalInstructions.indexOf(markers.start, a + 1) >= 0 ||
        globalInstructions.indexOf(markers.end, b + 1) >= 0))
  )
    throw new Error('Malformed managed rules block; preserve global instructions');
  const managedBlockPresent = a >= 0 && globalInstructions.slice(a + markers.start.length, b).trim() === rules.trim();
  return { context: managedBlockPresent ? '' : rules, managedBlockPresent };
}
