"use strict";

function createToast() {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px; pointer-events: none; font: 14px/1.4 system-ui, sans-serif; }
    .toast { background: #14141c; color: #fff; border-left: 3px solid #f2b632; padding: 10px 14px; border-radius: 6px; box-shadow: 0 4px 16px #0008; opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s; }
    .toast.show { opacity: 1; transform: none; }
    .toast.error { border-left-color: #ff4d5e; }
  </style><div class="wrap"></div>`;
  document.documentElement.append(host);
  const wrap = root.querySelector(".wrap");

  return {
    show(message, type = "info") {
      const el = document.createElement("div");
      el.className = `toast ${type === "error" ? "error" : ""}`;
      el.textContent = String(message);
      wrap.append(el);
      requestAnimationFrame(() => el.classList.add("show"));
      setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 250);
      }, 3000);
    },
  };
}

module.exports = { createToast };
