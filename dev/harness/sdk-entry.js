import React from "react";
import { createRoot } from "react-dom/client";
window.__REACT__ = React;
window.__mount = (name) => {
  const C = window.__REG__[name];
  createRoot(document.getElementById("root")).render(React.createElement(C));
};
const utils = { cn: (...a) => a.filter(Boolean).join(" "), timeAgo: () => "", isoTimeAgo: () => "" };
window.__REG__ = {};
window.__HERMES_PLUGINS__ = { register: (n, c) => { window.__REG__[n] = c; }, registerSlot: () => {} };
window.__HERMES_PLUGIN_SDK__ = {
  React,
  hooks: { useState: React.useState, useEffect: React.useEffect, useCallback: React.useCallback, useMemo: React.useMemo, useRef: React.useRef, useContext: React.useContext, createContext: React.createContext },
  components: {},
  utils,
  fetchJSON: (url, init) => fetch(url, init).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
};
