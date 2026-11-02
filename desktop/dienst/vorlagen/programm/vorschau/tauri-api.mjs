// Für Programme mit Vite/React-Oberfläche (z. B. „Alles zusammen“: Web + PWA + Tauri aus einem Code):
// Bei VITE_CS_VORSCHAU=1 zeigen die Tauri-Pakete auf diese Datei (siehe vorschau/vite-alias.mjs) – dann laufen dieselben
// Aufrufe gegen die Nachbildung mit Beispieldaten. Im echten Programm (ohne VITE_CS_VORSCHAU) wird diese Datei nie gebaut.
import "./tauri-nachbildung.js";
import "./beispiele.js";

const t = () => globalThis.__TAURI__;
// @tauri-apps/api/core
export const invoke = (...a) => t().core.invoke(...a);
export const convertFileSrc = (p) => t().core.convertFileSrc(p);
export const isTauri = () => false;
// @tauri-apps/plugin-dialog
export const open = (o) => t().dialog.open(o);
export const save = (o) => t().dialog.save(o);
export const message = (m, o) => t().dialog.message(m, o);
export const ask = (m, o) => t().dialog.ask(m, o);
export const confirm = (m, o) => t().dialog.confirm(m, o);
// @tauri-apps/plugin-fs
export const readTextFile = (p) => t().fs.readTextFile(p);
export const readFile = (p) => t().fs.readFile(p);
export const writeTextFile = (p, x) => t().fs.writeTextFile(p, x);
export const writeFile = (p, x) => t().fs.writeFile(p, x);
export const exists = (p) => t().fs.exists(p);
export const remove = (p) => t().fs.remove(p);
export const mkdir = (p) => t().fs.mkdir(p);
export const readDir = (p) => t().fs.readDir(p);
// @tauri-apps/api/window, /webviewWindow
export const getCurrentWindow = () => t().window.getCurrentWindow();
export const getCurrentWebviewWindow = () => t().webviewWindow.getCurrentWebviewWindow();
// @tauri-apps/plugin-notification
export const isPermissionGranted = () => t().notification.isPermissionGranted();
export const requestPermission = () => t().notification.requestPermission();
export const sendNotification = (n) => t().notification.sendNotification(n);
// @tauri-apps/api/event
export const listen = (n, cb) => t().event.listen(n, cb);
export const once = (n, cb) => t().event.once(n, cb);
export const emit = (n, p) => t().event.emit(n, p);
// @tauri-apps/api/app
export const getVersion = () => t().app.getVersion();
export const getName = () => t().app.getName();
