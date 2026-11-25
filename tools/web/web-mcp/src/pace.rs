//! Typing delays: how long the browser waits between the keys it presses for the `browser` tool's `type`.

use std::ops::RangeInclusive;

/// The browser tool's delay per key, in ms.
pub(crate) const BROWSER: RangeInclusive<u64> = 30..=60;

/// A uniform draw from `range`, in ms (the modulo bias is negligible for ranges this small); its midpoint when
/// the OS has no randomness to give.
pub(crate) fn delay_ms(range: RangeInclusive<u64>) -> u64 {
    let (lo, hi) = (*range.start(), *range.end());
    match getrandom::u64() {
        Ok(r) => lo + r % (hi - lo + 1),
        Err(_) => lo + (hi - lo) / 2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draw_stays_in_range() {
        let draws: Vec<u64> = (0..1_000).map(|_| delay_ms(BROWSER)).collect();
        assert!(draws.iter().all(|d| BROWSER.contains(d)), "{draws:?}");
        assert!(draws.iter().any(|d| *d != draws[0]), "{draws:?}");
    }
}
