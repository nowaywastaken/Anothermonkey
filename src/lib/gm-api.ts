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

  const SCRIPT_METADATA = typeof GM_SCRIPT_METADATA !== 'undefined' ? GM_SCRIPT_METADATA : {};
  const EXTENSION_VERSION = typeof GM_EXTENSION_VERSION !== 'undefined' ? GM_EXTENSION_VERSION : "0.0.0";

  // GM_info
  window.GM_info = {
      script: {
          ...SCRIPT_METADATA,
          id: SCRIPT_ID, // The ID is the generated UUID, not from metadata
          resources: Object.keys(resourceCache).map(name => ({
              name: name,
              url: resourceCache[name].url
          })),
          'run-at': SCRIPT_METADATA.runAt || 'document_idle',
      },
      scriptHandler: "AnotherMonkey",
      version: EXTENSION_VERSION // The extension's version
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

  // Notifications with full support for callbacks and buttons
  window.GM_notification = function(details, ondone) {
    const notificationId = Math.random().toString(36).substring(2);
    
    if (typeof details === 'string') {
        details = { text: details };
    }
    
    // Store callbacks for this notification
    if (details.onclick || details.ondone || (details.buttons && details.buttons.length > 0)) {
        window._gmNotificationCallbacks = window._gmNotificationCallbacks || {};
        window._gmNotificationCallbacks[notificationId] = {
            onclick: details.onclick,
            ondone: details.ondone,
            buttons: details.buttons,
            timeout: details.timeout
        };
    }
    
    sendMessage("GM_notification", { 
        details: {
            text: details.text,
            title: details.title,
            imageUrl: details.imageUrl,
            onclick: !!details.onclick,
            ondone: !!details.ondone,
            buttons: details.buttons ? details.buttons.map(b => ({ title: b.title })) : undefined,
            timeout: details.timeout,
            notificationId: notificationId
        } 
    }).then((response) => {
        if (response && response.error) {
            console.error("GM_notification error:", response.error);
        }
        if (ondone) ondone(response?.error);
    });
    
    return notificationId;
  };

  // Listen for notification events from background
  chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "GM_notificationClick" && message.notificationId) {
          const callbacks = window._gmNotificationCallbacks?.[message.notificationId];
          if (callbacks?.onclick) {
              try {
                  callbacks.onclick();
              } catch (e) {
                  console.error("Error in notification onclick handler:", e);
              }
          }
      }
      if (message.action === "GM_notificationButton" && message.notificationId && message.buttonIndex !== undefined) {
          const callbacks = window._gmNotificationCallbacks?.[message.notificationId];
          if (callbacks?.buttons?.[message.buttonIndex]?.onClick) {
              try {
                  callbacks.buttons[message.buttonIndex].onClick();
              } catch (e) {
                  console.error("Error in notification button handler:", e);
              }
          }
      }
      if (message.action === "GM_notificationClosed" && message.notificationId) {
          const callbacks = window._gmNotificationCallbacks?.[message.notificationId];
          if (callbacks?.ondone) {
              try {
                  callbacks.ondone();
              } catch (e) {
                  console.error("Error in notification ondone handler:", e);
              }
          }
          // Clean up callbacks
          if (window._gmNotificationCallbacks) {
              delete window._gmNotificationCallbacks[message.notificationId];
          }
      }
  });

  // Tabs
  window.GM_openInTab = function(url, options) {
    sendMessage("GM_openInTab", { url, options });
  };

  // GM_download
  window.GM_download = function(details) {
    const downloadId = Math.random().toString(36).substring(2);
    const port = chrome.runtime.connect({ name: "GM_download_" + downloadId });
    
    port.onMessage.addListener((message) => {
        if (message.type === "progress" && details.onprogress) {
            details.onprogress(message.data);
        } else if (message.type === "load") {
            if (details.onload) {
                details.onload(message.result);
            }
            port.disconnect();
        } else if (message.type === "error") {
            if (details.onerror) details.onerror(message.error);
            port.disconnect();
        }
    });

    port.postMessage({ 
        action: "GM_download", 
        scriptId: SCRIPT_ID, 
        details: {
            url: details.url,
            name: details.name,
            headers: details.headers,
            saveAs: details.saveAs
        },
        downloadId 
    });
      
    return {
        abort: () => {
            port.postMessage({ action: "abort", downloadId });
            port.disconnect();
        }
    };
  };

  // GM_cookie
  window.GM_cookie = function(action, details, callback) {
    const cookieId = Math.random().toString(36).substring(2);
    const port = chrome.runtime.connect({ name: "GM_cookie_" + cookieId });
    
    port.onMessage.addListener((message) => {
        if (message.type === "success") {
            if (callback) callback(null, message.result);
            port.disconnect();
        } else if (message.type === "error") {
            if (callback) callback(message.error, null);
            port.disconnect();
        }
    });

    port.postMessage({
        action: "GM_cookie",
        scriptId: SCRIPT_ID,
        cookieAction: action,
        details: {
            url: details.url,
            name: details.name,
            value: details.value,
            domain: details.domain,
            path: details.path,
            secure: details.secure,
            httpOnly: details.httpOnly,
            expirationDate: details.expirationDate,
            storeId: details.storeId
        },
        cookieId
    });
    
    return {
        abort: () => {
            port.disconnect();
        }
    };
  };

  // GM_setClipboard
  window.GM_setClipboard = function(text, type) {
      // Warn if non-text type is specified (modern browsers only support text/plain)
      if (type && type !== 'text') {
          console.warn("GM_setClipboard: Only 'text' type is supported in modern browsers");
      }
      
      // Use Clipboard API if available
      if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch((error) => {
              console.error("GM_setClipboard error:", error);
          });
      } else {
          // Fallback for older browsers using document.execCommand
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          textArea.style.top = '-9999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          try {
              const success = document.execCommand('copy');
              if (!success) {
                  console.error("GM_setClipboard: execCommand('copy') failed");
              }
          } catch (error) {
              console.error("GM_setClipboard error:", error);
          } finally {
              document.body.removeChild(textArea);
          }
      }
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
  window.GM.download = (details) => window.GM_download(details);
  window.GM.cookie = (action, details, callback) => window.GM_cookie(action, details, callback);
  window.GM.setClipboard = (text, type) => window.GM_setClipboard(text, type);
  window.GM.unregisterMenuCommand = (id) => window.GM_unregisterMenuCommand(id);
  window.GM.info = window.GM_info;

  // Menu Commands
  const menuCommandListeners = new Map();
  window.GM_registerMenuCommand = function(caption, onClick) {
     const id = Math.random().toString(36).substring(2);
     menuCommandListeners.set(id, onClick);
     sendMessage("GM_registerMenuCommand", { caption, id });
     return id;
  };

  window.GM_unregisterMenuCommand = function(id) {
      if (menuCommandListeners.has(id)) {
          menuCommandListeners.delete(id);
          sendMessage("GM_unregisterMenuCommand", { id });
      }
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

  // Record script run in background
  function recordScriptRun() {
    sendMessage("record_script_run", {});
  }

  // Record script error in background
  function recordScriptError() {
    sendMessage("record_script_error", {});
  }

  // Wrap script execution to record stats
  // The actual script code will be appended after this wrapper
  window._anmonRecordRun = recordScriptRun;
  window._anmonRecordError = recordScriptError;

  console.log("GM APIs injected for script:", SCRIPT_ID);
})();`;