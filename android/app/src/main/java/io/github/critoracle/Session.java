package io.github.critoracle;

/**
 * The logout generation. Work that started before a logout (a native read waiting on Habitica, a night gear step)
 * captures it first and writes its results only while it is unchanged, so nothing lands after logout wiped the
 * phone's copy. The check and the write happen under one lock that logout takes too.
 */
final class Session {
  private Session () {}

  private static final Object LOCK = new Object();
  private static int generation;

  static int generation () { synchronized (LOCK) { return generation; } }

  /** First thing at logout: every write from work started before this is dropped from now on. */
  static void loggedOut () { synchronized (LOCK) { generation++; } }

  /** Runs `write` only if no logout happened since `gen` was captured; false when it was dropped. */
  static boolean ifCurrent (int gen, Runnable write) {
    synchronized (LOCK) {
      if (gen != generation) return false;
      write.run();
      return true;
    }
  }
}
