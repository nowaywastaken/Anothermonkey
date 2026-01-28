import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  all_frames: false,
}

const main = () => {
  // Check if we are on a raw .user.js file
  if (
    document.contentType === "text/plain" ||
    document.contentType === "application/x-javascript" ||
    document.contentType === "text/javascript"
  ) {
    if (!location.pathname.endsWith(".user.js")) {
      return
    }

    // The content is in a <pre> tag in Firefox, or just in document.body for Chrome
    const code = document.body.textContent
    if (!code || !code.includes("==UserScript==")) {
      return
    }
    
    // Stop the page from rendering the raw text
    document.documentElement.innerHTML = `
        <style>
            body { background-color: #18181b; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
            .container { text-align: center; }
            .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
        <div class="container">
            <h1>AnotherMonkey</h1>
            <p>Redirecting to script installation...</p>
            <div class="loader"></div>
        </div>
    `;

    chrome.runtime.sendMessage({
      action: "open_install_dialog",
      code: code
    }).then(response => {
        if (response.success) {
            // Background script will open the new tab.
            // We can potentially close this tab if allowed, but for now we just wait.
            // window.close(); // This often fails due to security restrictions.
        }
    });
  }
}

// Since we run at document_start, we need to wait for the body to be available
const observer = new MutationObserver((mutations, obs) => {
    if (document.body) {
        main();
        obs.disconnect(); // We only need to run once
    }
});

observer.observe(document.documentElement, { childList: true });