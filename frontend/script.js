// Technical breakdown toggle
// Swaps the middle of the page between the resume and a technical
// writeup of how the site is actually built, without touching the
// header or footer. The swap fades out the old view, then fades in
// the new one, instead of just snapping - the actual fade timing
// lives in styles.css on #resume-view/#breakdown-view; FADE_MS below
// just needs to match that CSS transition duration so the JS knows
// when it's safe to actually swap which view is hidden.
//
// Clicking a section link (Education, Experience, etc.) while the
// breakdown is showing switches back to the resume first, then
// scrolls - otherwise the link would try to jump to a section that's
// currently hidden and nothing would visibly happen.

const FADE_MS = 300;

const breakdownToggle = document.getElementById("breakdown-toggle");
const resumeView = document.getElementById("resume-view");
const breakdownView = document.getElementById("breakdown-view");

// fades hideEl out, then (once that's finished) hides it, unhides
// showEl, and fades that in. afterShow is optional - anything passed
// in runs right after showEl becomes visible, which matters for the
// nav-link handler below since it needs to wait for the resume view
// to actually be back before it can scroll to a section in it.
function crossfadeViews(hideEl, showEl, afterShow) {
  hideEl.style.opacity = "0";

  window.setTimeout(function () {
    hideEl.hidden = true;
    hideEl.style.opacity = "";

    showEl.hidden = false;
    showEl.style.opacity = "0";
    void showEl.offsetWidth; // forces the browser to register opacity:0 first - skip this and it would just snap straight to 1 instead of fading in
    showEl.style.opacity = "1";

    if (afterShow) {
      afterShow();
    }
  }, FADE_MS);
}

function showResumeView(afterShow) {
  crossfadeViews(breakdownView, resumeView, afterShow);
  breakdownToggle.setAttribute("aria-pressed", "false");
  breakdownToggle.textContent = "Technical Breakdown";
}

function showBreakdownView() {
  crossfadeViews(resumeView, breakdownView);
  breakdownToggle.setAttribute("aria-pressed", "true");
  breakdownToggle.textContent = "Back to Resume";
}

breakdownToggle.addEventListener("click", function () {
  const alreadyShowingBreakdown = breakdownToggle.getAttribute("aria-pressed") === "true";

  if (alreadyShowingBreakdown) {
    showResumeView();
  } else {
    showBreakdownView();
  }

  // jump back to the top either way - staying scrolled halfway down
  // a section that just got swapped out would look broken
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// the "See the full technical breakdown" link inside the Cloud Resume
// Challenge project entry does the same thing as clicking the button
// in the nav bar - just re-trigger that button's own click rather
// than duplicating the show/scroll logic here
const viewBreakdownLink = document.getElementById("view-breakdown-link");
if (viewBreakdownLink) {
  viewBreakdownLink.addEventListener("click", function (event) {
    event.preventDefault();
    breakdownToggle.click();
  });
}

// the Education/Experience/Projects/Skills links in the nav bar only
// make sense from the resume view - switch back to it first if
// they're clicked while the breakdown is showing
document.querySelectorAll('.topbar-nav a[href^="#"]').forEach(function (link) {
  link.addEventListener("click", function (event) {
    if (breakdownView.hidden) {
      return; // already on the resume, nothing to do
    }
    event.preventDefault();
    const targetId = link.getAttribute("href").slice(1);
    // wait for the fade-back-to-resume to actually finish before
    // scrolling - the target section doesn't exist in the layout
    // (and scrollIntoView can't do anything useful) while it's
    // still mid-fade or hidden
    showResumeView(function () {
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
});


// Contact popup (business card)
// Clicking the Contact button in the nav bar shows/hides the little
// business-card panel next to it. Also closes if you click anywhere
// else on the page, or press Escape - otherwise it'd just sit open
// forever until you clicked the button again, which feels broken.

const contactToggle = document.getElementById("contact-toggle");
const contactCard = document.getElementById("contact-card");

function openContactCard() {
  contactCard.hidden = false;
  contactToggle.setAttribute("aria-expanded", "true");
  positionContactCard();
}

// Reads where the Contact button actually is on screen right now, and
// places the card directly under it - accounting for the button
// possibly being in a different spot depending on screen width. Also
// clamps the horizontal position so the card can never run off either
// edge of the viewport, instead of just anchoring blindly to the
// button and letting it overflow.
function positionContactCard() {
  const buttonRect = contactToggle.getBoundingClientRect();
  const cardRect = contactCard.getBoundingClientRect();
  const margin = 16; // minimum gap to leave between the card and the screen edge

  let left = buttonRect.right - cardRect.width; // default: right edge of the card lines up with the right edge of the button

  if (left + cardRect.width > window.innerWidth - margin) {
    left = window.innerWidth - cardRect.width - margin;
  }
  if (left < margin) {
    left = margin;
  }

  contactCard.style.left = left + "px";
  contactCard.style.top = (buttonRect.bottom + 8) + "px";
}

function closeContactCard() {
  contactCard.hidden = true;
  contactToggle.setAttribute("aria-expanded", "false");
}

contactToggle.addEventListener("click", function (event) {
  // stop this click from immediately bubbling up to the
  // document-level "click elsewhere closes it" listener below
  event.stopPropagation();

  if (contactCard.hidden) {
    openContactCard();
  } else {
    closeContactCard();
  }
});

// clicking anywhere outside the card closes it
document.addEventListener("click", function (event) {
  const clickedInsideCard = contactCard.contains(event.target);
  if (!contactCard.hidden && !clickedInsideCard) {
    closeContactCard();
  }
});

// pressing Escape closes it too, same as most popup menus
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !contactCard.hidden) {
    closeContactCard();
  }
});


// Visitor count tooltip - there are two instances of this (a desktop
// one in the hero, a mobile one in the fixed bottom bar - CSS shows
// only one at a time depending on screen width), so this is written
// as a reusable setup function instead of duplicating the same
// open/close/click-outside/Escape logic twice. Click to toggle, click
// elsewhere or press Escape to close - this used to be hover-only,
// but hover isn't really a thing on a phone, so both instances use
// tap/click, which works the same way on touch and mouse alike.

function setupVisitorTooltip(toggleEl, tooltipEl) {
  function open() {
    tooltipEl.hidden = false;
    toggleEl.setAttribute("aria-expanded", "true");
  }

  function close() {
    tooltipEl.hidden = true;
    toggleEl.setAttribute("aria-expanded", "false");
  }

  toggleEl.addEventListener("click", function (event) {
    event.stopPropagation();
    if (tooltipEl.hidden) {
      open();
    } else {
      close();
    }
  });

  document.addEventListener("click", function (event) {
    if (!tooltipEl.hidden && !toggleEl.contains(event.target)) {
      close();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !tooltipEl.hidden) {
      close();
    }
  });
}

const visitorBarToggle = document.getElementById("visitor-bar-toggle");
const visitorTooltipEl = document.getElementById("visitor-tooltip");
setupVisitorTooltip(visitorBarToggle, visitorTooltipEl);

const visitorDesktopToggle = document.getElementById("visitor-desktop-toggle");
const visitorTooltipDesktopEl = document.getElementById("visitor-tooltip-desktop");
setupVisitorTooltip(visitorDesktopToggle, visitorTooltipDesktopEl);


// Theme toggle
// The <html> tag gets a data-theme="light" attribute when light mode
// is on. There's a matching bit of inline script up in index.html's
// <head> that checks localStorage before the page even renders, so
// the site doesn't flash dark-then-light on reload.

const themeButton = document.getElementById("theme-toggle");

// the inline script in index.html's <head> already applied the saved
// theme before this file even loads (that's what avoids a flash of
// the wrong theme on page load) - this just syncs the switch's
// aria-checked to match whatever it decided, since that happens
// before the button exists to set it directly
themeButton.setAttribute(
  "aria-checked",
  document.documentElement.getAttribute("data-theme") === "light" ? "true" : "false"
);

// Whatever the visitor picks gets saved, so it's still their choice
// next time they load the page. If nothing's saved yet (first visit),
// the site just falls back to the dark theme that's already the
// default in styles.css.
themeButton.addEventListener("click", function () {
  // turn on the slow-transition class for a few seconds so all the
  // colors ease into their new values instead of just snapping - the
  // actual transition timing lives in styles.css, under
  // ".theme-transitioning *"
  document.documentElement.classList.add("theme-transitioning");
  window.setTimeout(function () {
    document.documentElement.classList.remove("theme-transitioning");
  }, 3000);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";

  if (isLight) {
    // switch back to dark mode
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
    themeButton.setAttribute("aria-checked", "false");
  } else {
    // switch to light mode
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
    themeButton.setAttribute("aria-checked", "true");
  }
});


// Visitor counter
//
// This used to fall back to the original REST counter (Part 3) while
// the WebSocket version was still being tested. Now that Part 8 is
// confirmed up and running, WebSocket is the only path actually in
// use - the REST code below is commented out rather than deleted, in
// case it's ever needed again as a backup.

const WEBSOCKET_URL = "[YOUR_WEBSOCKET_URL]"; // paste your real WebSocket URL here - carry over the value from your previous copy of this file if you already had one working

function isFilledIn(url) {
  // a placeholder still starts with "[YOUR_" - so this just checks
  // whether someone's actually replaced it with a real URL yet
  return Boolean(url) && !url.startsWith("[YOUR_");
}

// --- REST counter (Part 3) - commented out, kept only as a backup ---
//
// const API_URL = "[YOUR_API_GATEWAY_INVOKE_URL]";
//
// async function updateVisitorCountViaRest(counterSpan) {
//   try {
//     const response = await fetch(API_URL);
//
//     if (!response.ok) {
//       throw new Error("Server responded with status " + response.status);
//     }
//
//     const data = await response.json();
//     counterSpan.textContent = data.count;
//
//   } catch (error) {
//     console.error("Couldn't load the visitor count (REST):", error);
//     counterSpan.textContent = "—";
//   }
// }

// turns 1 into "1st", 2 into "2nd", 11 into "11th", 21 into "21st", etc.
// the 11/12/13 check exists because those break the normal 1/2/3 pattern -
// "11th" not "11st", same for 12th and 13th
function ordinalSuffix(n) {
  const lastDigit = n % 10;
  const lastTwoDigits = n % 100;

  if (lastDigit === 1 && lastTwoDigits !== 11) return n + "st";
  if (lastDigit === 2 && lastTwoDigits !== 12) return n + "nd";
  if (lastDigit === 3 && lastTwoDigits !== 13) return n + "rd";
  return n + "th";
}

// fills in the tooltip text with the current count, so it always
// matches whatever number is actually showing on screen - updates
// both the desktop and mobile versions, since only one is visible at
// a time (CSS handles that) but both should stay accurate regardless,
// in case the window gets resized across that breakpoint
function updateVisitorTooltip(count) {
  const message =
    "Congratulations, you're the " + ordinalSuffix(count) + " visitor!<br><br>" +
    "This number is pulled from an Amazon DynamoDB Stream, so if you open up a new page you can see the number update on both.";

  [visitorTooltipEl, visitorTooltipDesktopEl].forEach(function (tooltip) {
    if (tooltip) {
      tooltip.innerHTML = message;
    }
  });
}

function connectVisitorCounterViaWebSocket(counterSpans) {
  const socket = new WebSocket(WEBSOCKET_URL);

  // this fires whenever DBStreamProcessor pushes an updated count -
  // including counts triggered by OTHER visitors, not just this one
  socket.addEventListener("message", function (event) {
    try {
      const data = JSON.parse(event.data);
      counterSpans.forEach(function (span) {
        span.textContent = data.count;
      });
      updateVisitorTooltip(data.count);
    } catch (error) {
      console.error("Couldn't read the visitor count message:", error);
    }
  });

  socket.addEventListener("error", function (error) {
    console.error("Visitor counter connection error (WebSocket):", error);
    counterSpans.forEach(function (span) {
      span.textContent = "—";
    });
  });

  socket.addEventListener("close", function () {
    // not attempting to reconnect here on purpose, to keep this
    // simple for now - worth revisiting later if it turns out
    // connections drop more than expected. For now this just leaves
    // the last known count showing rather than clearing it.
    console.log("Visitor counter connection closed");
  });
}

function initVisitorCounter() {
  const counterSpans = [
    document.getElementById("visitor-count"),
    document.getElementById("visitor-count-desktop"),
  ].filter(Boolean); // drops any that aren't on the page for some reason

  if (counterSpans.length === 0) {
    return;
  }

  if (isFilledIn(WEBSOCKET_URL)) {
    connectVisitorCounterViaWebSocket(counterSpans);
  } else {
    // WebSocket isn't wired up yet. To bring back the REST fallback
    // instead, uncomment the block above and call
    // updateVisitorCountViaRest(counterSpan) here.
    counterSpans.forEach(function (span) {
      span.textContent = "—";
    });
  }
}

// run it once the page has loaded
document.addEventListener("DOMContentLoaded", initVisitorCounter);
