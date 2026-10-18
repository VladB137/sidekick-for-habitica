package io.github.critoracle.verdict;

/**
 * When the Stable wallpaper's timer runs (StableWallpaper): only while the wallpaper is on a screen that is on and
 * has a surface to draw on, and only while something moves (the herd, or a heart after a tap on the still picture).
 * The wallpaper tells it every change (visibility, the surface coming and going, the screen on or off, Battery
 * Saver, Android's animations) and each time asks {@link #sync} what to do, so no order of Android's callbacks can
 * leave the herd standing: a surface made again while the wallpaper stays visible restarts it, and a timer that
 * has not ticked for {@link #STALL_MS} counts as stopped. Pure Java, tested on any JDK.
 */
public final class StableLoop {
  /** a running timer that hasn't ticked for this long (uptime ms) is started again */
  public static final long STALL_MS = 1000;

  public enum Act {
    /** nothing changes: the timer runs and will keep running */
    NONE,
    /** start the timer (again): drop any tick still queued and tick now */
    START,
    /** stop the timer and the light check: nothing is on screen */
    STOP,
    /** a picture (Battery Saver, no scenery yet): stop the timer, check again at the next light of the day */
    STILL
  }

  /** the wallpaper is showing, it has a surface, the screen is on (not off, not the ambient display) */
  public boolean visible, surface, awake = true;
  /** Battery Saver on, or Android's animations off: nothing travels */
  public boolean still;
  private boolean running;
  private long lastTick;

  public boolean shown () { return visible && surface && awake; }

  public boolean running () { return running; }

  /** What to do now; {@code moving}: something to animate (the herd, or a heart on the still picture). */
  public Act sync (long now, boolean moving) {
    if (!shown()) { running = false; return Act.STOP; }
    if (running && now - lastTick < STALL_MS) return Act.NONE;
    if (!moving) { running = false; return Act.STILL; }
    running = true;
    lastTick = now;
    return Act.START;
  }

  /** A tick is due: false when it shouldn't run (stopped meanwhile), and then nothing more is scheduled. */
  public boolean tick (long now) {
    if (!running || !shown()) { running = false; return false; }
    lastTick = now;
    return true;
  }

  /** The timer stopped itself (the still picture's last heart is gone, or a tick failed). */
  public void ended () { running = false; }
}
