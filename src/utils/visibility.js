// Shared browser-tab-visibility mechanism for every historical/dashboard
// poll — a backgrounded/minimized browser tab should stop generating
// server load, and should catch up with exactly one immediate refresh the
// moment it's foregrounded again, not wait out its normal interval.
//
// Each poller keeps its own existing timer (setInterval or setTimeout
// recursion) unchanged; the pattern is: check `document.hidden` before
// doing the actual fetch (skip the network call while hidden, but leave
// the timer running so it doesn't need to be recreated), and call
// onTabVisible(refreshFn) once inside the same effect so exactly one
// extra refresh fires the instant the tab becomes visible again. No
// separate/duplicate timer is introduced by this — the existing interval
// keeps its own single clock.
export function onTabVisible(callback) {
  function handler() {
    if (!document.hidden) callback();
  }
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
