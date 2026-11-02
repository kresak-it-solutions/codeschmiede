// Projektordner je Projekt (Entwurf 1.0 „Projektordner“, freigegeben von Gerhard 02.11.2026 07:04, docs/KONZEPT-PROJEKTORDNER.md).
//
// Alle Projekte liegen auf einer externen Festplatte. Der Basis-Ordner wird einmal je PC über die Ordner-Auswahl des Systems festgelegt,
// der Projektordner ist <basis>\<kennung> (oder ein anderer, per Auswahl verknüpfter Ordner). Gespeichert wird das NUR lokal in
// <App-Daten>/werkstatt/projektordner.json (dort liest es der Werkstatt-Dienst) – nie in der Datenbank, weil Pfade je PC verschieden sind.
//
// Sicherheit: Die Oberfläche (live geladen) kann KEINE Pfade übergeben. Pfade kommen nur aus der Ordner-Auswahl des Systems; die Oberfläche
// nennt nur die Projekt-Kennung (a–z, 0–9, „-“). „Im Explorer öffnen“ öffnet nur den verknüpften Ordner bzw. einen festen Unterordner davon.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Eintrag {
    pub pfad: String,
    #[serde(default)]
    pub regeln_von: Option<String>,
    /// Zufälliges Kennzeichen, steht auch in <Projektordner>/.codeschmiede-projekt.json – nur wenn beide passen, arbeitet die Werkstatt dort (N1)
    #[serde(default)]
    pub kennzeichen: Option<String>,
}

/// Kennungsdatei im Projektordner
const KENNUNGS_DATEI: &str = ".codeschmiede-projekt.json";
/// Nur ein Befehl zur Zeit ändert projektordner.json (N5)
static SPERRE: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Konfig {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub basis: Option<String>,
    #[serde(default)]
    pub projekte: BTreeMap<String, Eintrag>,
    /// Kennzeichen des Ordners für die globalen Regeln <basis>/Regeln (0.13.1) – steht auch in dessen Kennungsdatei
    #[serde(default)]
    pub global_kennzeichen: Option<String>,
}

/// Ordner für die globalen Regeln der ganzen Codeschmiede (0.13.1, Entscheidung Gerhard 02.11.2026 09:50/09:54): <basis>/Regeln
/// (z. B. D:\Codeschmiede\Regeln\REGELN.md, daneben die Projektordner). Die Kennung „regeln“ ist darum als Projekt-Kennung gesperrt
/// (Windows unterscheidet nicht nach Groß/Klein) – kein Projekt kann diesen Ordner belegen.
pub(crate) const GLOBAL: &str = "Regeln";
/// Kennung in der Kennungsdatei des Ordners (keine gültige Projekt-Kennung)
pub(crate) const GLOBAL_KENNUNG: &str = "_regeln";

/// <basis>/Regeln anlegen (nur echter Ordner, keine Verknüpfung) und die Kennungsdatei sichern. Gibt das Kennzeichen zurück.
fn global_anlegen(basis: &Path) -> Result<String, String> {
    if !echter_ordner(basis) {
        return Err("Festplatte fehlt – der Projekte-Ordner ist gerade nicht erreichbar.".into());
    }
    let g = basis.join(GLOBAL);
    match std::fs::symlink_metadata(&g) {
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => {}
        Ok(_) => return Err("An der Stelle von „Regeln“ liegt eine Datei oder Verknüpfung – bitte prüfen.".into()),
        Err(_) => std::fs::create_dir(&g).map_err(|e| format!("Ordner „Regeln“ konnte nicht angelegt werden: {e}"))?,
    }
    kennung_sichern(&g, GLOBAL_KENNUNG)
}

/// Liegt p im Ordner der globalen Regeln (oder ist er es)? Solche Ordner dürfen kein Projektordner sein (Schreibsperre der Werkstatt).
pub(crate) fn im_global(p: &Path, basis: Option<&str>) -> bool {
    match basis {
        Some(b) => {
            let g = Path::new(b).join(GLOBAL);
            let (a, z) = (p.to_string_lossy().to_lowercase(), g.to_string_lossy().to_lowercase());
            a == z || a.starts_with(&format!("{z}{}", std::path::MAIN_SEPARATOR)) || a.starts_with(&format!("{z}/"))
        }
        None => false,
    }
}

/// Projekt-Kennung wie in der Datenbank: 2–40 Zeichen, a–z, 0–9 und „-“, vorn kein „-“.
pub(crate) fn kennung_ok(k: &str) -> bool {
    let b = k.as_bytes();
    (2..=40).contains(&b.len())
        && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
        && !windows_name(k)
        && k != "regeln"   // <basis>/Regeln ist der Ordner der globalen Regeln (0.13.1)
}

/// Reservierte Namen von Windows (werden zu Ordnernamen, N4): con, prn, aux, nul, com0–9, lpt0–9
fn windows_name(k: &str) -> bool {
    matches!(k, "con" | "prn" | "aux" | "nul")
        || (k.len() == 4 && (k.starts_with("com") || k.starts_with("lpt")) && k.as_bytes()[3].is_ascii_digit())
}

/// Als Projekte-Ordner bzw. Projektordner ungeeignet (N5): Laufwerks- bzw. Systemwurzel, der Benutzerordner selbst, System- und
/// Programmordner (auch darin), Netzwerkpfade (\\Server\Freigabe). Gibt den Grund zurück.
pub(crate) fn ordner_ungeeignet(p: &Path) -> Option<&'static str> {
    let t = p.to_string_lossy().to_string();
    if t.starts_with("\\\\") || t.starts_with("//") {
        return Some("Netzwerkpfade sind nicht erlaubt – bitte einen Ordner auf der Festplatte wählen.");
    }
    // Wurzel: Laufwerk (E:\\) bzw. „/“ – am Mac ist auch /Volumes/<Platte> die Wurzel eines Datenträgers
    if p.parent().is_none() || p.components().count() <= 1 || (!cfg!(windows) && p.parent() == Some(Path::new("/Volumes"))) {
        return Some("Bitte nicht die Wurzel eines Laufwerks wählen, sondern einen Ordner darin (z. B. E:\\Projekte).");
    }
    let gleich = |a: &Path, b: &Path| a.to_string_lossy().to_lowercase().trim_end_matches(['\\', '/']) == b.to_string_lossy().to_lowercase().trim_end_matches(['\\', '/']);
    let darin = |a: &Path, b: &Path| {
        let (a, b) = (a.to_string_lossy().to_lowercase(), b.to_string_lossy().to_lowercase());
        let b = b.trim_end_matches(['\\', '/']).to_string();
        !b.is_empty() && (a == b || a.starts_with(&format!("{b}\\")) || a.starts_with(&format!("{b}/")))
    };
    for v in ["USERPROFILE", "HOME"] {
        if let Ok(h) = std::env::var(v) {
            if !h.is_empty() && gleich(p, Path::new(&h)) {
                return Some("Bitte nicht den Benutzerordner selbst wählen, sondern einen Ordner auf der externen Festplatte.");
            }
        }
    }
    let mut system: Vec<String> = ["SystemRoot", "windir", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "ProgramData", "APPDATA", "LOCALAPPDATA"]
        .iter()
        .filter_map(|v| std::env::var(v).ok())
        .collect();
    if !cfg!(windows) {
        system.extend(["/System", "/Library", "/Applications", "/usr", "/bin", "/sbin", "/etc", "/var", "/private", "/opt", "/dev", "/proc", "/boot"].iter().map(|s| s.to_string()));
        if let Ok(h) = std::env::var("HOME") {
            system.push(format!("{h}/Library"));
        }
    }
    if system.iter().any(|s| darin(p, Path::new(s))) {
        return Some("System- und Programmordner sind nicht erlaubt – bitte einen Ordner auf der externen Festplatte wählen.");
    }
    None
}

/// Kurzform eines Pfads für die Oberfläche (N6): Laufwerk bzw. Datenträger und letzter Teil, ohne Benutzernamen.
pub(crate) fn kurz(p: &str) -> String {
    let teile: Vec<&str> = p.split(['\\', '/']).filter(|t| !t.is_empty()).collect();
    let Some(letzter) = teile.last() else { return p.to_string() };
    if cfg!(windows) || p.chars().nth(1) == Some(':') {
        let lw = teile.first().copied().unwrap_or("");
        if teile.len() <= 2 { return format!("{lw}\\{letzter}"); }
        return format!("{lw}\\…\\{letzter}");
    }
    if teile.first() == Some(&"Volumes") && teile.len() >= 2 {
        let platte = teile[1];
        if teile.len() <= 3 { return format!("/Volumes/{platte}/{letzter}"); }
        return format!("/Volumes/{platte}/…/{letzter}");
    }
    format!("…/{letzter}")
}

/// Kennungsdatei lesen: (kennung, id)
fn kennung_lesen(ordner: &Path) -> Option<(String, String)> {
    let p = ordner.join(KENNUNGS_DATEI);
    let m = std::fs::symlink_metadata(&p).ok()?;
    if !m.is_file() || m.len() > 4096 {
        return None;
    }
    let j: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(p).ok()?).ok()?;
    Some((j.get("kennung")?.as_str()?.to_string(), j.get("id")?.as_str()?.to_string()))
}

fn neues_kennzeichen() -> String {
    use rand::RngCore;
    let mut b = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Kennungsdatei anlegen bzw. übernehmen (Ordner wurde an einem anderen PC schon verknüpft). Fremdes Projekt → Fehler.
fn kennung_sichern(ordner: &Path, projekt: &str) -> Result<String, String> {
    if let Some((k, id)) = kennung_lesen(ordner) {
        if k != projekt {
            return Err(format!("Dieser Ordner gehört zum Projekt „{k}“ – bitte einen anderen wählen."));
        }
        if id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) {
            return Ok(id);
        }
    }
    if std::fs::symlink_metadata(ordner.join(KENNUNGS_DATEI)).map(|m| !m.is_file()).unwrap_or(false) {
        return Err("Im Ordner liegt an Stelle der Kennungsdatei etwas anderes – bitte prüfen.".into());
    }
    let id = neues_kennzeichen();
    let inhalt = serde_json::json!({ "kennung": projekt, "id": id, "hinweis": "Kennungsdatei der Codeschmiede – nicht löschen oder kopieren" });
    std::fs::write(ordner.join(KENNUNGS_DATEI), serde_json::to_string_pretty(&inhalt).unwrap()).map_err(|e| format!("Kennungsdatei konnte nicht geschrieben werden: {e}"))?;
    Ok(id)
}

/// Herkunft der ersten REGELN.md: Vorlage, leer oder ein anderes Projekt.
pub(crate) fn regeln_von_ok(r: &str) -> bool {
    r == "vorlage" || r == "leer" || kennung_ok(r)
}

/// Absoluter Pfad ohne Steuerzeichen, höchstens 400 Zeichen.
pub(crate) fn pfad_text_ok(p: &str) -> bool {
    !p.is_empty() && p.len() <= 400 && !p.chars().any(|c| c.is_control()) && Path::new(p).is_absolute()
}

/// Echter Ordner (keine Verknüpfung, keine Datei).
fn echter_ordner(p: &Path) -> bool {
    match std::fs::symlink_metadata(p) {
        Ok(m) => m.is_dir() && !m.file_type().is_symlink(),
        Err(_) => false,
    }
}

fn datei(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("werkstatt").join("projektordner.json"))
}

fn laden(app: &tauri::AppHandle) -> Konfig {
    datei(app)
        .ok()
        .and_then(|d| std::fs::read_to_string(d).ok())
        .and_then(|t| serde_json::from_str::<Konfig>(&t).ok())
        .unwrap_or_default()
}

fn speichern(app: &tauri::AppHandle, k: &Konfig) -> Result<(), String> {
    let d = datei(app)?;
    if let Some(o) = d.parent() {
        std::fs::create_dir_all(o).map_err(|e| e.to_string())?;
    }
    let tmp = d.with_extension("json.neu");
    std::fs::write(&tmp, serde_json::to_string_pretty(k).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &d).map_err(|e| e.to_string())
}

/// Ordner über die Auswahl des Systems wählen (läuft nicht im Haupt-Thread: Befehle sind async).
fn ordner_waehlen(app: &tauri::AppHandle, titel: &str) -> Result<Option<PathBuf>, String> {
    let Some(f) = app.dialog().file().set_title(titel).blocking_pick_folder() else { return Ok(None) };
    let p = f.into_path().map_err(|e| e.to_string())?;
    let t = p.to_string_lossy().to_string();
    if !pfad_text_ok(&t) || !echter_ordner(&p) {
        return Err("Bitte einen echten Ordner wählen (keine Verknüpfung, kein Netzwerk-Kürzel).".into());
    }
    if let Some(grund) = ordner_ungeeignet(&p) {
        return Err(grund.into());
    }
    Ok(Some(p))
}

#[derive(Serialize)]
pub struct ProjektStand {
    projekt: String,
    pfad: Option<String>,
    verknuepft: bool,
    erreichbar: bool,
    code: bool,
    regeln: bool,
}

#[derive(Serialize)]
pub struct Stand {
    basis: Option<String>,
    basis_da: bool,
    projekte: Vec<ProjektStand>,
    /// Ordner der globalen Regeln: angelegt und Kennungsdatei passt / REGELN.md vorhanden
    global_da: bool,
    global_regeln: bool,
}

/// Stand der Projektordner auf diesem PC (für Assistent, Verwaltung und Anbindungen). Nicht verknüpfte Projekte zeigen den Vorschlag <basis>\<kennung>.
#[tauri::command]
pub async fn ws_ordner_stand(app: tauri::AppHandle, projekte: Vec<String>) -> Result<Stand, String> {
    if projekte.len() > 200 {
        return Err("Zu viele Projekte".into());
    }
    let k = laden(&app);
    let basis = k.basis.clone().filter(|b| pfad_text_ok(b));
    let basis_da = basis.as_deref().map(|b| echter_ordner(Path::new(b))).unwrap_or(false);
    let liste = projekte
        .into_iter()
        .filter(|id| kennung_ok(id))
        .map(|id| {
            let eintrag = k.projekte.get(&id).filter(|e| pfad_text_ok(&e.pfad));
            let pfad = eintrag.map(|e| PathBuf::from(&e.pfad)).or_else(|| basis.as_ref().map(|b| Path::new(b).join(&id)));
            // erreichbar = echter Ordner UND die Kennungsdatei passt (sonst steckt eine andere Festplatte)
            let erreichbar = eintrag.is_some()
                && pfad.as_deref().map(echter_ordner).unwrap_or(false)
                && pfad.as_deref().and_then(kennung_lesen).map(|(k, i)| k == id && Some(i) == eintrag.and_then(|e| e.kennzeichen.clone())).unwrap_or(false);
            ProjektStand {
                verknuepft: eintrag.is_some(),
                erreichbar,
                code: erreichbar && pfad.as_ref().map(|p| p.join("code").join(".git").exists()).unwrap_or(false),
                regeln: erreichbar && pfad.as_ref().map(|p| p.join("regeln").join("REGELN.md").is_file()).unwrap_or(false),
                pfad: pfad.map(|p| kurz(&p.to_string_lossy())),
                projekt: id,
            }
        })
        .collect();
    let g = basis.as_ref().map(|b| Path::new(b).join(GLOBAL));
    let global_da = g.as_deref().map(echter_ordner).unwrap_or(false)
        && g.as_deref().and_then(kennung_lesen).map(|(kk, i)| kk == GLOBAL_KENNUNG && Some(i) == k.global_kennzeichen.clone()).unwrap_or(false);
    // Die globale Regeldatei ist Regeln/CLAUDE.md (Gerhard 02.11.2026 09:55)
    let global_regeln = global_da && g.map(|p| p.join("CLAUDE.md").is_file()).unwrap_or(false);
    Ok(Stand { basis: basis.as_deref().map(kurz), basis_da, projekte: liste, global_da, global_regeln })
}

/// Basis-Ordner (Projekte-Ordner auf der externen Festplatte) einmal je PC festlegen. Gibt den Pfad zurück (None = abgebrochen).
#[tauri::command]
pub async fn ws_ordner_basis_waehlen(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(p) = ordner_waehlen(&app, "Projekte-Ordner auf der externen Festplatte wählen")? else { return Ok(None) };
    let t = p.to_string_lossy().to_string();
    let _sperre = SPERRE.lock().map_err(|_| "Gesperrt".to_string())?;
    let mut k = laden(&app);
    k.version = 1;
    k.basis = Some(t.clone());
    // Ordner der globalen Regeln gleich mit anlegen (0.13.1); scheitert das, bleibt der Projekte-Ordner trotzdem festgelegt
    k.global_kennzeichen = global_anlegen(&p).ok();
    speichern(&app, &k)?;
    Ok(Some(kurz(&t)))
}

/// Projektordner verknüpfen: <basis>\<kennung> (wird angelegt, wenn die Festplatte da ist) oder – mit eigener = true – einen anderen Ordner
/// über die Auswahl. regeln_von legt fest, woher die erste REGELN.md kommt (vorlage, leer oder Kennung eines anderen Projekts).
#[tauri::command]
pub async fn ws_ordner_verknuepfen(app: tauri::AppHandle, projekt: String, eigener: bool, regeln_von: Option<String>) -> Result<Option<String>, String> {
    // „_regeln“: Ordner der globalen Regeln per Klick anlegen – immer <basis>/Regeln, nie ein gewählter Ordner
    if projekt == GLOBAL_KENNUNG {
        if eigener || regeln_von.is_some() {
            return Err("Der Ordner der globalen Regeln liegt immer im Projekte-Ordner".into());
        }
        let b = laden(&app).basis.filter(|b| pfad_text_ok(b)).ok_or("Zuerst den Projekte-Ordner auf der Festplatte festlegen („Ordner wählen …“).")?;
        let kennzeichen = global_anlegen(Path::new(&b))?;
        let _sperre = SPERRE.lock().map_err(|_| "Gesperrt".to_string())?;
        let mut k = laden(&app);
        k.global_kennzeichen = Some(kennzeichen);
        speichern(&app, &k)?;
        return Ok(Some(kurz(&Path::new(&b).join(GLOBAL).to_string_lossy())));
    }
    if !kennung_ok(&projekt) {
        return Err("Ungültige Projekt-Kennung".into());
    }
    if let Some(r) = &regeln_von {
        if !regeln_von_ok(r) || *r == projekt {
            return Err("Ungültige Herkunft der Regeln".into());
        }
    }
    let pfad = if eigener {
        match ordner_waehlen(&app, "Projektordner wählen")? {
            Some(p) => p,
            None => return Ok(None),
        }
    } else {
        let b = laden(&app).basis.filter(|b| pfad_text_ok(b)).ok_or("Zuerst den Projekte-Ordner auf der Festplatte festlegen („Ordner wählen …“).")?;
        let basis = PathBuf::from(b);
        if !echter_ordner(&basis) {
            return Err("Festplatte fehlt – der Projekte-Ordner ist gerade nicht erreichbar.".into());
        }
        let z = basis.join(&projekt);
        match std::fs::symlink_metadata(&z) {
            Ok(m) if m.is_dir() && !m.file_type().is_symlink() => {}
            Ok(_) => return Err("An dieser Stelle liegt eine Datei oder Verknüpfung statt eines Ordners – bitte prüfen.".into()),
            Err(_) => std::fs::create_dir(&z).map_err(|e| format!("Projektordner konnte nicht angelegt werden: {e}"))?,
        }
        z
    };
    let t = pfad.to_string_lossy().to_string();
    if !pfad_text_ok(&t) || ordner_ungeeignet(&pfad).is_some() {
        return Err(ordner_ungeeignet(&pfad).unwrap_or("Ungültiger Pfad").into());
    }
    if im_global(&pfad, laden(&app).basis.as_deref()) {
        return Err("Im Ordner „Regeln“ (globale Regeln) darf kein Projektordner liegen – bitte einen anderen wählen.".into());
    }
    let kennzeichen = kennung_sichern(&pfad, &projekt)?;
    let _sperre = SPERRE.lock().map_err(|_| "Gesperrt".to_string())?;
    let mut k = laden(&app);
    let alt = k.projekte.get(&projekt).and_then(|e| e.regeln_von.clone());
    k.version = 1;
    k.projekte.insert(projekt, Eintrag { pfad: t.clone(), regeln_von: regeln_von.or(alt), kennzeichen: Some(kennzeichen) });
    speichern(&app, &k)?;
    Ok(Some(kurz(&t)))
}

/// Feste Unterordner, die „Im Explorer öffnen“ zeigen darf.
const UNTERORDNER: &[&str] = &["code", "regeln", "konzept", "doku", "material", "sicherungen", "setup"];

/// Verknüpften Projektordner (oder einen festen Unterordner) im Explorer bzw. Finder öffnen – nie einen beliebigen Pfad.
#[tauri::command]
pub fn ws_ordner_oeffnen(app: tauri::AppHandle, projekt: String, unterordner: Option<String>) -> Result<(), String> {
    if projekt == GLOBAL_KENNUNG {
        // Ordner der globalen Regeln: nur <basis>/Regeln mit passender Kennungsdatei, ohne Unterordner
        let k = laden(&app);
        let b = k.basis.filter(|b| pfad_text_ok(b)).ok_or("Zuerst den Projekte-Ordner auf der Festplatte festlegen.")?;
        let g = Path::new(&b).join(GLOBAL);
        if unterordner.is_some() || !echter_ordner(&g) || kennung_lesen(&g).map(|(kk, i)| kk != GLOBAL_KENNUNG || Some(i) != k.global_kennzeichen).unwrap_or(true) {
            return Err("Der Ordner der globalen Regeln ist nicht erreichbar – Festplatte angesteckt? Sonst „Ordner anlegen“.".into());
        }
        return app.opener().open_path(g.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string());
    }
    if !kennung_ok(&projekt) {
        return Err("Ungültige Projekt-Kennung".into());
    }
    let k = laden(&app);
    let e = k.projekte.get(&projekt).filter(|e| pfad_text_ok(&e.pfad)).ok_or("Für dieses Projekt ist auf diesem PC noch kein Projektordner verknüpft.")?;
    let mut p = PathBuf::from(&e.pfad);
    if kennung_lesen(&p).map(|(k, i)| k != projekt || Some(i) != e.kennzeichen).unwrap_or(true) {
        return Err("Der Ordner gehört nicht (mehr) zu diesem Projekt oder die Festplatte fehlt – bitte neu verknüpfen.".into());
    }
    if let Some(u) = unterordner {
        if !UNTERORDNER.contains(&u.as_str()) {
            return Err("Unbekannter Unterordner".into());
        }
        p = p.join(u);
    }
    if !echter_ordner(&p) {
        return Err("Ordner nicht erreichbar – ist die Festplatte angesteckt?".into());
    }
    app.opener().open_path(p.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kennungen() {
        assert!(kennung_ok("trainer-to-go"));
        assert!(kennung_ok("codeschmiede"));
        assert!(kennung_ok("a1"));
        assert!(!kennung_ok("a"));
        assert!(!kennung_ok("-x"));
        assert!(!kennung_ok("Gross"));
        assert!(!kennung_ok("../x"));
        assert!(!kennung_ok("a\\b"));
        assert!(!kennung_ok(&"a".repeat(41)));
        for n in ["con", "nul", "aux", "prn", "com1", "lpt9"] {
            assert!(!kennung_ok(n), "{n}");
        }
        assert!(kennung_ok("com") && kennung_ok("console") && kennung_ok("lpt10"));
        // Ordner der globalen Regeln ist nie eine Projekt-Kennung (0.13.1)
        assert!(!kennung_ok(GLOBAL) && !kennung_ok("regeln") && !kennung_ok(GLOBAL_KENNUNG) && !regeln_von_ok("regeln"));
        assert!(kennung_ok("regeln-x") && kennung_ok("meine-regeln"));
        assert!(regeln_von_ok("vorlage") && regeln_von_ok("leer") && regeln_von_ok("trainer-to-go"));
        assert!(!regeln_von_ok("../boese") && !regeln_von_ok(""));
    }

    #[test]
    fn pfade() {
        assert!(!pfad_text_ok(""));
        assert!(!pfad_text_ok("relativ/ordner"));
        assert!(!pfad_text_ok(&format!("/{}", "a".repeat(400))));
        assert!(!pfad_text_ok("/a\nb"));
        if cfg!(windows) {
            assert!(pfad_text_ok("E:\\Projekte"));
        } else {
            assert!(pfad_text_ok("/Volumes/Platte/Projekte"));
        }
    }

    #[test]
    fn ungeeignete_ordner_und_kurzform() {
        if cfg!(windows) {
            assert!(ordner_ungeeignet(Path::new("E:\\")).is_some());
            assert!(ordner_ungeeignet(Path::new("\\\\server\\freigabe")).is_some());
            assert!(ordner_ungeeignet(Path::new("E:\\Projekte")).is_none());
        } else {
            assert!(ordner_ungeeignet(Path::new("/")).is_some());
            assert!(ordner_ungeeignet(Path::new("/usr/local/x")).is_some());
            assert!(ordner_ungeeignet(Path::new("//server/x")).is_some());
            assert!(ordner_ungeeignet(Path::new("/Volumes/Platte/Projekte")).is_none());
            assert!(ordner_ungeeignet(Path::new("/Volumes/Platte")).is_some());
            if let Ok(h) = std::env::var("HOME") {
                assert!(ordner_ungeeignet(Path::new(&h)).is_some());
            }
            assert_eq!(kurz("/Volumes/Platte/Projekte/trainer-to-go"), "/Volumes/Platte/…/trainer-to-go");
            assert_eq!(kurz("/home/gerhard/Projekte/x"), "…/x");
        }
        assert_eq!(kurz("E:\\Projekte"), "E:\\Projekte");
        assert_eq!(kurz("E:\\Daten\\Projekte\\trainer-to-go"), "E:\\…\\trainer-to-go");
    }

    #[test]
    fn global_ordner() {
        let b = if cfg!(windows) { "E:\\Projekte" } else { "/Volumes/Platte/Projekte" };
        let g = Path::new(b).join(GLOBAL);
        assert!(im_global(&g, Some(b)));
        assert!(im_global(&g.join("x"), Some(b)));
        assert!(!im_global(&Path::new(b).join("codeschmiede"), Some(b)));
        assert!(!im_global(&Path::new(b).join("Regeln2"), Some(b)));
        assert!(im_global(&Path::new(b).join("regeln").join("x"), Some(b)));   // Groß/Klein egal (Windows)
        assert!(!im_global(&g, None));
        let k: Konfig = serde_json::from_str(r#"{"basis":"/p","projekte":{},"global_kennzeichen":"0123456789abcdef0123456789abcdef"}"#).unwrap();
        assert_eq!(k.global_kennzeichen.as_deref(), Some("0123456789abcdef0123456789abcdef"));
    }

    #[test]
    fn konfig_lesen() {
        let k: Konfig = serde_json::from_str(r#"{"basis":"/p","projekte":{"x1":{"pfad":"/p/x1"}}}"#).unwrap();
        assert_eq!(k.projekte.get("x1").unwrap().regeln_von, None);
        assert_eq!(k.basis.as_deref(), Some("/p"));
    }
}
