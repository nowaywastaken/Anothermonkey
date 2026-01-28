import type { PlasmoCSConfig } from "plasmo"
import { useEffect } from "react"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

const InstallDetector = () => {
  useEffect(() => {
    // Basic detection for .user.js files
    if (window.location.pathname.endsWith(".user.js")) {
        // Chrome displays text files in a <pre> usually
        const content = document.body.innerText;
        
        // Simple check for metadata block
        if (content.includes("// ==UserScript==") && content.includes("// ==/UserScript==")) {
             chrome.runtime.sendMessage({ 
                 action: "open_install_dialog", 
                 code: content 
             });
        }
    }
  }, [])

  return null
}

export default InstallDetector
