import type { PlasmoCSConfig } from "plasmo"
import { useEffect } from "react"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

const InstallDetector = () => {
  useEffect(() => {
    // This component detects if the current page is a raw .user.js file
    // that the browser has rendered as plain text inside a <pre> tag.

    if (
      document.body.childElementCount === 1 &&
      document.body.firstChild?.nodeName === "PRE"
    ) {
      const content = (document.body.firstChild as HTMLElement).innerText

      // If it looks like a userscript, send it to the background to open the install tab.
      if (
        content.includes("// ==UserScript==") &&
        content.includes("// ==/UserScript==")
      ) {
        chrome.runtime.sendMessage({
          action: "open_install_dialog",
          code: content
        })
      }
    }
  }, [])

  return null
}

export default InstallDetector
