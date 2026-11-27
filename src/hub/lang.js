"use strict";

// The hub in the client's language: the main process tells it when the
// window opens (src/main/i18n.js). In Spanish this does nothing.
window.riteI18n.setLanguage(window.rite?.lang);
document.documentElement.lang = window.riteI18n.getLanguage();
window.riteI18n.watch(document.documentElement);
