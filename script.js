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
// AWS setup checklist - do these in order, then fill in API_URL below.
// (Full instructions for each one are in GUIDE.md, Part 3.)
//
//   1. Create the DynamoDB table that stores the count
//      -> handled automatically when you run "sam deploy" -
//         it's defined in backend/template.yaml
//
//   2. Deploy the Lambda function that reads/increments the count
//      -> also handled by "sam deploy", code is in backend/src/app.py
//
//   3. Deploy API Gateway so the browser has a URL to call
//      -> also created by "sam deploy" - after it finishes, look for
//         "ApiUrl" in the terminal output (or in the CloudFormation
//         console under your stack's Outputs tab)
//
//   4. Copy that URL and paste it in below, replacing the placeholder

const API_URL = "https://kw0e1hbf6l.execute-api.us-east-1.amazonaws.com/prod/count"; // <- paste your API Gateway URL here once step 3 above is done

async function updateVisitorCount() {
  const counterSpan = document.getElementById("visitor-count");

  // if for some reason that element isn't on the page, just stop here
  if (!counterSpan) {
    return;
  }

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Server responded with status " + response.status);
    }

    const data = await response.json();
    counterSpan.textContent = data.count;

  } catch (error) {
    // most likely cause: API_URL above still says the placeholder text,
    // or the backend hasn't been deployed yet
    console.error("Couldn't load the visitor count:", error);
    counterSpan.textContent = "—";
  }
}

// run it once the page has loaded
document.addEventListener("DOMContentLoaded", updateVisitorCount);
