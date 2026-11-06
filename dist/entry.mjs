import './compat.mjs';
globalThis.mentraProduction=true;
const {installMobileShell}=await import('./mobile.mjs');
installMobileShell();
await import('./bootstrap.mjs');
