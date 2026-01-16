/**
 * Matches a string against a wildcard pattern (case-insensitive)
 * Supports * (matches any characters) and ? (matches single character)
 * @param {string} wildcard - Wildcard pattern (e.g., "*night*", "tour?")
 * @param {string} str - String to test against the pattern
 * @returns {boolean} True if string matches the wildcard pattern
 * @example
 * wildcardMatch("*night*", "Vancouver Nights") // returns true
 * wildcardMatch("tour?", "tour1") // returns true
 * wildcardMatch("tour?", "tours") // returns false
 */
module.exports = (wildcard, str) => {
  let w = wildcard.replace(/[.+^${}()|[\]\\]/g, '\\$&'); // regexp escape 
  const re = new RegExp(`^${w.replace(/\*/g,'.*').replace(/\?/g,'.')}$`,'i');
  return re.test(str); // remove last 'i' above to have case sensitive
}
