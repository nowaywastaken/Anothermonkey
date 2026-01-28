export const GM_API_CODE = `
(function() {
  const SCRIPT_ID = typeof GM_SCRIPT_ID !== 'undefined' ? GM_SCRIPT_ID : "unknown";
  
  // Memory cache for synchronous access
  const valueCache = typeof GM_PRESET_VALUES !== 'undefined' ? GM_PRESET_VALUES : {};
  const resourceCache = typeof GM_PRESET_RESOURCES !== 'undefined' ? GM_PRESET_RESOURCES : {};

  // Prevent double injection
  if (window.GM_xmlhttpRequest) return;

  function sendMessage(action, data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ ...data, action, scriptId: SCRIPT_ID }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else if (response && response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // GM_info
  window.GM_info = {
      script: {
          id: SCRIPT_ID,
          name: "Userscript", // Should ideally be passed in metadata
          version: "0.1"
      },
      scriptHandler: "AnotherMonkey",
      version: "0.1.0"
  };

  // GM_xmlhttpRequest
  window.GM_xmlhttpRequest = function(details) {
    const requestId = Math.random().toString(36).substring(2);
    
    sendMessage("GM_xmlhttpRequest", { details, requestId })
      .then(response => {
        if (response && details.onload) {
            let responseData = response.responseText;
            
            if (response.isBinary && response.responseBase64) {
                const binaryString = atob(response.responseBase64);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                if (details.responseType === 'blob') {
                    responseData = new Blob([bytes]);
                } else if (details.responseType === 'arraybuffer') {
                    responseData = bytes.buffer;
                }
            }

            details.onload({
                status: response.status,
                statusText: response.statusText,
                responseText: response.responseText,
                response: responseData,
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
    valueCache[key] = value;
    return sendMessage("GM_setValue", { key, value });
  };

  // GM_getValue
  window.GM_getValue = function(key, defaultValue) {
    return valueCache[key] !== undefined ? valueCache[key] : defaultValue;
  };

  // GM_deleteValue
  window.GM_deleteValue = function(key) {
    delete valueCache[key];
    return sendMessage("GM_deleteValue", { key });
  };

  // GM_listValues
  window.GM_listValues = function() {
    return Object.keys(valueCache);
  };
  
  // GM_getResourceText
  window.GM_getResourceText = function(name) {
    return resourceCache[name] ? resourceCache[name].content : null;
  };

  // GM_getResourceURL
  window.GM_getResourceURL = function(name) {
    if (!resourceCache[name]) return null;
    // For now, return the original URL. 
    // Real Tampermonkey might return a blob URL if it was cached as binary.
    return resourceCache[name].url;
  };

  // GM_addStyle
  window.GM_addStyle = function(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

  // GM_setClipboard
  window.GM_setClipboard = function(data, info) {
    const input = document.createElement('textarea');
    input.value = data;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('GM_setClipboard failed:', err);
    }
    document.body.removeChild(input);
  };

  // Modern API
  window.GM = window.GM || {};
  window.GM.getValue = async (key, defaultValue) => window.GM_getValue(key, defaultValue);
  window.GM.setValue = async (key, value) => window.GM_setValue(key, value);
  window.GM.deleteValue = async (key) => window.GM_deleteValue(key);
  window.GM.listValues = async () => window.GM_listValues();
  window.GM.xmlHttpRequest = window.GM_xmlhttpRequest;
  window.GM.getResourceText = async (name) => window.GM_getResourceText(name);
  window.GM.getResourceURL = async (name) => window.GM_getResourceURL(name);
  window.GM.addStyle = (css) => window.GM_addStyle(css);
  window.GM.info = window.GM_info;

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