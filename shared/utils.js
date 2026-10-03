/* shared/utils.js — Bristol Airport Flights App
   Small helpers used by both pages.
   Exposes: window.BrsUtils
*/
"use strict";

(function(){
  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Storage can throw (private windows, blocked site data, quota): never let that break the page.
  function safeGetLocal(key){ try { return localStorage.getItem(key); } catch { return null; } }
  function safeSetLocal(key, value){ try { localStorage.setItem(key, value); return true; } catch { return false; } }
  function safeGetSession(key){ try { return sessionStorage.getItem(key); } catch { return null; } }
  function safeSetSession(key, value){ try { sessionStorage.setItem(key, value); return true; } catch { return false; } }

  /** Flatten nested objects (and arrays, as [i]) into a dot-key map. */
  function flattenObject(obj, prefix = "", out = {}){
    if (obj == null) return out;
    if (typeof obj !== "object") { out[prefix || "value"] = obj; return out; }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => flattenObject(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out));
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") flattenObject(v, p, out);
      else out[p] = v;
    }
    return out;
  }

  /** First non-empty value among `paths` in a flattened map, or "". */
  function pickAny(flat, paths){
    for (const p of paths) {
      const v = flat[p];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  }

  window.BrsUtils = { escapeHtml, safeGetLocal, safeSetLocal, safeGetSession, safeSetSession, flattenObject, pickAny };
})();
