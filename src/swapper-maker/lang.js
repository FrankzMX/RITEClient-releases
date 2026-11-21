"use strict";

// «Crear swapper» in the client's language (src/main/i18n.js). In Spanish this does nothing.
window.riteI18n.setLanguage(window.riteMaker?.lang);
document.documentElement.lang = window.riteI18n.getLanguage();
window.riteI18n.watch(document.documentElement);
