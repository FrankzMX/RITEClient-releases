"use strict";

// «Mis clips» in the client's language: the main process tells it when the
// window opens (src/main/i18n.js). In Spanish this does nothing.
window.riteI18n.setLanguage(window.riteViewer?.lang);
document.documentElement.lang = window.riteI18n.getLanguage();
window.riteI18n.watch(document.documentElement);
