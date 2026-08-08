// ===== Contact popup (business card) =====
// Clicking the Contact button in the nav bar shows/hides the little
// business-card panel next to it. Also closes if you click anywhere
// else on the page, or press Escape - otherwise it'd just sit open
// forever until you clicked the button again, which feels broken.

const contactToggle = document.getElementById("contact-toggle");
const contactCard = document.getElementById("contact-card");

function openContactCard() {
  contactCard.hidden = false;
  contactToggle.setAttribute("aria-expanded", "true");
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


// ===== Theme toggle =====
// The <html> tag gets a data-theme="light" attribute when light mode
// is on. There's a matching bit of inline script up in index.html's
// <head> that checks localStorage before the page even renders, so
// the site doesn't flash dark-then-light on reload.

const themeButton = document.getElementById("theme-toggle");

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
  } else {
    // switch to light mode
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  }
});


// ===== Visitor counter =====
//
// This site currently supports TWO ways of showing the visitor count,
// on purpose, during the transition to the real-time WebSocket
// version (Part 8 of GUIDE.md):
//
//   - REST (the original, Part 3) - one-shot fetch(), only updates
//     on page load/refresh
//   - WebSocket (the new one, Part 8) - stays connected, updates
//     live if someone else visits while you're looking at the page
//
// Whichever URL below is actually filled in gets used - WebSocket
// wins if both are set, since that's the upgrade. Once the WebSocket
// path is fully tested and working, the REST constant/function (and
// the matching backend/src/app.py + VisitorCountFunction/
// VisitorCountApi in template.yaml) can all be deleted as a cleanup
// step - this fallback logic can come out at the same time.

const API_URL = "[YOUR_API_GATEWAY_INVOKE_URL]"; // REST endpoint from Part 3 - if you already filled this in before, keep that value here
const WEBSOCKET_URL = "[YOUR_WEBSOCKET_URL]"; // WebSocket endpoint from Part 8 - fill in once it's deployed and tested

function isFilledIn(url) {
  // a placeholder still starts with "[YOUR_" - so this just checks
  // whether someone's actually replaced it with a real URL yet
  return Boolean(url) && !url.startsWith("[YOUR_");
}

async function updateVisitorCountViaRest(counterSpan) {
  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Server responded with status " + response.status);
    }

    const data = await response.json();
    counterSpan.textContent = data.count;

  } catch (error) {
    console.error("Couldn't load the visitor count (REST):", error);
    counterSpan.textContent = "—";
  }
}

function connectVisitorCounterViaWebSocket(counterSpan) {
  const socket = new WebSocket(WEBSOCKET_URL);

  // this fires whenever DBStreamProcessor pushes an updated count -
  // including counts triggered by OTHER visitors, not just this one
  socket.addEventListener("message", function (event) {
    try {
      const data = JSON.parse(event.data);
      counterSpan.textContent = data.count;
    } catch (error) {
      console.error("Couldn't read the visitor count message:", error);
    }
  });

  socket.addEventListener("error", function (error) {
    console.error("Visitor counter connection error (WebSocket):", error);
    counterSpan.textContent = "—";
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
  const counterSpan = document.getElementById("visitor-count");

  // if for some reason that element isn't on the page, just stop here
  if (!counterSpan) {
    return;
  }

  if (isFilledIn(WEBSOCKET_URL)) {
    connectVisitorCounterViaWebSocket(counterSpan);
  } else if (isFilledIn(API_URL)) {
    updateVisitorCountViaRest(counterSpan);
  } else {
    // neither backend is wired up yet
    counterSpan.textContent = "—";
  }
}

// run it once the page has loaded
document.addEventListener("DOMContentLoaded", initVisitorCounter);
