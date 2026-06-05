/**
 * Tiny className merge helper. Joins truthy class strings with a single space.
 * Note: this is a *concatenator*, not a Tailwind conflict resolver — when two
 * conflicting utilities are present, CSS source order decides the winner, not
 * argument order. Components below avoid emitting conflicting utilities so a
 * consumer-supplied `className` can still override the defaults in practice.
 */
export const cx = (...c: Array<string | false | undefined | null>): string =>
  c.filter(Boolean).join(' ');
