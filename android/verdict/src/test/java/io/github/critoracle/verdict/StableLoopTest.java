package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import io.github.critoracle.verdict.StableLoop.Act;
import org.junit.Test;

/** The Stable wallpaper's timer: whatever order Android reports things in, a visible wallpaper keeps moving. */
public class StableLoopTest {
  private static StableLoop shown () {
    StableLoop l = new StableLoop();
    l.surface = true;
    l.visible = true;
    return l;
  }

  @Test
  public void startsWhenShownAndKeepsTicking () {
    StableLoop l = shown();
    assertEquals(Act.START, l.sync(0, true));
    for (long t = 33; t < 5000; t += 33) assertTrue(l.tick(t));
    assertEquals(Act.NONE, l.sync(5000, true));
  }

  @Test
  public void aSurfaceMadeAgainWhileVisibleRestarts () {
    StableLoop l = shown();
    l.sync(0, true);
    l.surface = false;
    assertEquals(Act.STOP, l.sync(100, true));
    assertFalse(l.tick(133));
    // Android makes the surface again without saying the wallpaper was hidden
    l.surface = true;
    assertEquals(Act.START, l.sync(200, true));
    assertTrue(l.tick(233));
  }

  @Test
  public void hiddenOrScreenOffStops () {
    StableLoop l = shown();
    l.sync(0, true);
    l.visible = false;
    assertEquals(Act.STOP, l.sync(10, true));
    l.visible = true;
    assertEquals(Act.START, l.sync(20, true));
    l.awake = false;
    assertEquals(Act.STOP, l.sync(30, true));
    assertFalse(l.tick(40));
    l.awake = true;
    assertEquals(Act.START, l.sync(50, true));
  }

  @Test
  public void aTimerThatStoppedTickingIsStartedAgain () {
    StableLoop l = shown();
    l.sync(0, true);
    assertTrue(l.tick(33));
    // its tick was lost: the next nudge (a home screen swipe, the screen coming on) starts it again
    assertEquals(Act.NONE, l.sync(33 + StableLoop.STALL_MS - 1, true));
    assertEquals(Act.START, l.sync(33 + StableLoop.STALL_MS, true));
  }

  @Test
  public void batterySaverIsStillAndEndsLive () {
    StableLoop l = shown();
    l.sync(0, true);
    l.still = true;
    // the running timer notices on its next tick (the herd holds still) and ends once nothing moves
    assertEquals(Act.NONE, l.sync(50, false));
    l.ended();
    assertEquals(Act.STILL, l.sync(100, false));
    assertFalse(l.running());
    // a tap's heart runs the timer until it is gone
    assertEquals(Act.START, l.sync(200, true));
    l.ended();
    // Battery Saver off while on screen: moving again at once
    l.still = false;
    assertEquals(Act.START, l.sync(300, true));
  }

  @Test
  public void nothingToMoveIsAPictureUntilSomethingIs () {
    StableLoop l = shown();
    // no scenery from the app yet
    assertEquals(Act.STILL, l.sync(0, false));
    assertFalse(l.tick(33));
    // it arrived
    assertEquals(Act.START, l.sync(100, true));
    assertTrue(l.tick(133));
  }

  @Test
  public void anEndedTimerStartsOnTheNextSync () {
    StableLoop l = shown();
    l.sync(0, true);
    l.ended();
    assertFalse(l.tick(33));
    assertEquals(Act.START, l.sync(40, true));
  }
}
