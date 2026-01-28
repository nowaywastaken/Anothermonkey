export const GM_API_CODE = `
const ANMON_matchPattern = (function() {
  function patternToRegExp(pattern) {
    if (pattern === '<all_urls>') {
      return /^(https?|file|ftp):\\/\\/.*/;
    }
    const match = /^(https?|\\*|file|ftp):\\/\\/([^\\/]+)(\\/.*)$/.exec(pattern);
    if (!match) {
      throw new Error('Invalid match pattern: ' + pattern);
    }
    let [, scheme, host, path] = match;
    let re = '^' + (scheme === '*' ? 'https?' : scheme) + ':\\\\/\\\\/';
    if (host === '*') {
      re += '[^/]+';
    } else if (host.startsWith('*.')) {
      re += '[^/]+\\\\.' + host.substring(2).replace(/\\./g, '\\\\.');
    } else {
      re += host.replace(/\\./g, '\\\\.');
    }
    re += path.replace(/[?.+^${}()|[\\\\\\]]/g, '\\\\$&').replace(/\\\\\\*/g, '.*');
    re += '$';
    return new RegExp(re);
  }

  function matchPattern(pattern, url) {
    if (pattern === '*') return true;
    if (pattern === '<all_urls>') {
      return /^(https?|file|ftp):\\/\\/.*/.test(url);
    }
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regex = new RegExp(pattern.substring(1, pattern.length - 1));
        return regex.test(url);
      } catch (e) {
        console.error('Invalid regex pattern:', pattern, e);
        return false;
      }
    }
    if (pattern.includes('://')) {
      try {
        const regex = patternToRegExp(pattern);
        return regex.test(url);
      } catch (e) {
        // Fall through
      }
    }
    try {
      const reString = pattern.replace(/[?.+^${}()|[\\\\\\]]/g, '\\\\$&').replace(/\\*/g, '.*');
      const regex = new RegExp('^' + reString + '$');
      return regex.test(url);
    } catch (e) {
      console.error('Invalid glob pattern:', pattern, e);
      return false;
    }
  }
  return matchPattern;
})();

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
          console.error("GM API Error:", chrome.runtime.lastError);
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
          name: "Userscript", 
          version: "0.1"
      },
      scriptHandler: "AnotherMonkey",
      version: "0.1.0"
  };

  // GM_xmlhttpRequest
  window.GM_xmlhttpRequest = function(details) {
    const requestId = Math.random().toString(36).substring(2);
    const port = chrome.runtime.connect({ name: "GM_xmlhttpRequest" });
    
    port.onMessage.addListener((message) => {
        if (message.type === "progress" && details.onprogress) {
            details.onprogress(message.data);
        } else if (message.type === "load") {
            let responseData = message.response.responseText;
            
            if (message.response.isBinary && message.response.responseBase64) {
                const binaryString = atob(message.response.responseBase64);
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

            if (details.onload) {
                details.onload({
                    ...message.response,
                    response: responseData,
                    readyState: 4
                });
            }
            port.disconnect();
        } else if (message.type === "error") {
            if (details.onerror) details.onerror(message.error);
            port.disconnect();
        }
    });

    port.postMessage({ 
        action: "GM_xmlhttpRequest", 
        scriptId: SCRIPT_ID, 
        details: {
            method: details.method,
            url: details.url,
            headers: details.headers,
            data: details.data,
            binary: details.binary,
            timeout: details.timeout,
            context: details.context,
            responseType: details.responseType,
            anonymous: details.anonymous
        }, 
        requestId 
    });
      
    return {
        abort: () => {
            port.postMessage({ action: "abort" });
            port.disconnect();
        }
    };
  };

  // Value APIs (Sync using cache, Async updates background)
  window.GM_setValue = function(key, value) {
      valueCache[key] = value;
      sendMessage("GM_setValue", { key, value });
  };

  window.GM_getValue = function(key, defaultValue) {
      return valueCache.hasOwnProperty(key) ? valueCache[key] : defaultValue;
  };

  window.GM_deleteValue = function(key) {
      delete valueCache[key];
      sendMessage("GM_deleteValue", { key });
  };

  window.GM_listValues = function() {
      return Object.keys(valueCache);
  };

  // Style API
  window.GM_addStyle = function(css) {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
      return style;
  };

  // Resource APIs
  window.GM_getResourceText = function(name) {
      return resourceCache[name] ? resourceCache[name].content : null;
  };

  window.GM_getResourceURL = function(name) {
      if (!resourceCache[name]) return null;
      if (resourceCache[name].content) {
          const blob = new Blob([resourceCache[name].content]);
          return URL.createObjectURL(blob);
      }
      return resourceCache[name].url;
  };

  // Logging
  window.GM_log = function(message) {
    console.log("[%cGM_log%c] " + message, "color: #10b981; font-weight: bold", "");
  };

  // Notifications
  window.GM_notification = function(details, ondone) {
    if (typeof details === 'string') {
        details = { text: details };
    }
    sendMessage("GM_notification", { details }).then(ondone);
  };

  // Tabs
  window.GM_openInTab = function(url, options) {
    sendMessage("GM_openInTab", { url, options });
  };

  // Modern GM.* API
  window.GM = window.GM || {};
  window.GM.getValue = async (key, defaultValue) => window.GM_getValue(key, defaultValue);
  window.GM.setValue = async (key, value) => window.GM_setValue(key, value);
  window.GM.deleteValue = async (key) => window.GM_deleteValue(key);
  window.GM.listValues = async () => window.GM_listValues();
  window.GM.xmlHttpRequest = window.GM_xmlhttpRequest;
  window.GM.getResourceText = async (name) => window.GM_getResourceText(name);
  window.GM.getResourceURL = async (name) => window.GM_getResourceURL(name);
  window.GM.addStyle = (css) => window.GM_addStyle(css);
  window.GM.log = (message) => window.GM_log(message);
  window.GM.notification = (details, ondone) => window.GM_notification(details, ondone);
  window.GM.openInTab = (url, options) => window.GM_openInTab(url, options);
  window.GM.info = window.GM_info;

  // Menu Commands
  const menuCommandListeners = new Map();
  window.GM_registerMenuCommand = function(caption, onClick) {
     const id = Math.random().toString(36).substring(2);
     menuCommandListeners.set(id, onClick);
     sendMessage("GM_registerMenuCommand", { caption, id });
     return id;
  };

  // Background Messages Listener
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