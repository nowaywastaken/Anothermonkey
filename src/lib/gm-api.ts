export const GM_API_CODE = `
(function() {
  const SCRIPT_ID = document.currentScript?.dataset?.scriptId || (typeof GM_SCRIPT_ID !== 'undefined' ? GM_SCRIPT_ID : "unknown");

  // Prevent double injection
  if (window.GM_xmlhttpRequest) return;

  function sendMessage(action, data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ ...data, action, scriptId: SCRIPT_ID }, (response) => {
        if (chrome.runtime.lastError) {
          // Ignore errors for fire-and-forget or if background is busy
          // reject(chrome.runtime.lastError);
          resolve(null);
        } else if (response && response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // GM_xmlhttpRequest
  window.GM_xmlhttpRequest = function(details) {
    const requestId = Math.random().toString(36).substring(2);
    
    sendMessage("GM_xmlhttpRequest", { details, requestId })
      .then(response => {
        if (response && details.onload) {
            details.onload({
                status: response.status,
                statusText: response.statusText,
                responseText: response.responseText,
                readyState: 4,
                responseHeaders: response.responseHeaders,
                finalUrl: response.finalUrl
            });
        }
      })
      .catch(err => {
        if (details.onerror) details.onerror(err);
      });
      
    return {
        abort: () => sendMessage("GM_xhrAbort", { requestId })
    };
  };

  // GM_setValue
  window.GM_setValue = function(key, value) {
    return sendMessage("GM_setValue", { key, value });
  };

  // GM_getValue
  window.GM_getValue = function(key, defaultValue) {
    console.warn("GM_getValue is async in this implementation. Use await GM.getValue(key).");
    return sendMessage("GM_getValue", { key, defaultValue }).then(res => res && res.value !== undefined ? res.value : defaultValue);
  };
  
  // GM.getValue (Modern API)
  window.GM = window.GM || {};
  window.GM.getValue = window.GM_getValue;
  window.GM.setValue = window.GM_setValue;
  window.GM.xmlHttpRequest = window.GM_xmlhttpRequest;

  // GM_registerMenuCommand
  const menuCommandListeners = new Map();
  window.GM_registerMenuCommand = function(caption, onClick) {
     const id = Math.random().toString(36).substring(2);
     menuCommandListeners.set(id, onClick);
     sendMessage("GM_registerMenuCommand", { caption, id });
     return id;
  };

  // Listen for menu command clicks from background
  chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "GM_menuCommandClicked" && message.id) {
          const listener = menuCommandListeners.get(message.id);
          if (listener) {
              try {
                  listener();
              } catch (e) {
                  console.error("Error in menu command handler:", e);
              }
          }
      }
  });

  console.log("GM APIs injected for script:", SCRIPT_ID);
})();
`;