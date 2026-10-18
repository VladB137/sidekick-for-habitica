package io.github.critoracle.verdict;

/** Small rules shared by every native Habitica call (android HabiticaReader). */
public final class Calls {
  private Calls () {}

  /** A 429 without a usable Retry-After waits this long. */
  public static final long DEFAULT_RETRY_MS = 60_000;
  /** and never longer than this, whatever the header says */
  public static final long MAX_RETRY_MS = 3_600_000;

  /** Retry-After in seconds, whole ("30") or fractional ("12.5"), rounded up to the next ms; at least 1 s. */
  public static long retryAfterMs (String header) {
    if (header == null) return DEFAULT_RETRY_MS;
    double s;
    try { s = Double.parseDouble(header.trim()); } catch (NumberFormatException e) { return DEFAULT_RETRY_MS; }
    if (Double.isNaN(s) || Double.isInfinite(s)) return DEFAULT_RETRY_MS;
    return (long) Math.min(MAX_RETRY_MS, Math.ceil(Math.max(1, s) * 1000));
  }
}
