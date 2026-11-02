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
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Eintrag {
    pub pfad: String,
    #[serde(default)]
    pub regeln_von: Option<String>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Konfig {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub basis: Option<String>,
    #[serde(default)]
    pub projekte: BTreeMap<String, Eintrag>,
}

/// Projekt-Kennung wie in der Datenbank: 2–40 Zeichen, a–z, 0–9 und „-“, vorn kein „-“.
pub(crate) fn kennung_ok(k: &str) -> bool {
    let b = k.as_bytes();
    (2..=40).contains(&b.len())
        && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
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
}

/// Stand der Projektordner auf diesem PC (für Assistent, Verwaltung und Anbindungen). Nicht verknüpfte Projekte zeigen den Vorschlag <basis>\<kennung>.
#[tauri::command]
pub fn ws_ordner_stand(app: tauri::AppHandle, projekte: Vec<String>) -> Result<Stand, String> {
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
            let erreichbar = eintrag.is_some() && pfad.as_deref().map(echter_ordner).unwrap_or(false);
            ProjektStand {
                verknuepft: eintrag.is_some(),
                erreichbar,
                code: erreichbar && pfad.as_ref().map(|p| p.join("code").join(".git").exists()).unwrap_or(false),
                regeln: erreichbar && pfad.as_ref().map(|p| p.join("regeln").join("REGELN.md").is_file()).unwrap_or(false),
                pfad: pfad.map(|p| p.to_string_lossy().to_string()),
                projekt: id,
            }
        })
        .collect();
    Ok(Stand { basis, basis_da, projekte: liste })
}

/// Basis-Ordner (Projekte-Ordner auf der externen Festplatte) einmal je PC festlegen. Gibt den Pfad zurück (None = abgebrochen).
#[tauri::command]
pub async fn ws_ordner_basis_waehlen(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(p) = ordner_waehlen(&app, "Projekte-Ordner auf der externen Festplatte wählen")? else { return Ok(None) };
    let t = p.to_string_lossy().to_string();
    let mut k = laden(&app);
    k.version = 1;
    k.basis = Some(t.clone());
    speichern(&app, &k)?;
    Ok(Some(t))
}

/// Projektordner verknüpfen: <basis>\<kennung> (wird angelegt, wenn die Festplatte da ist) oder – mit eigener = true – einen anderen Ordner
/// über die Auswahl. regeln_von legt fest, woher die erste REGELN.md kommt (vorlage, leer oder Kennung eines anderen Projekts).
#[tauri::command]
pub async fn ws_ordner_verknuepfen(app: tauri::AppHandle, projekt: String, eigener: bool, regeln_von: Option<String>) -> Result<Option<String>, String> {
    if !kennung_ok(&projekt) {
        return Err("Ungültige Projekt-Kennung".into());
    }
    if let Some(r) = &regeln_von {
        if !regeln_von_ok(r) || *r == projekt {
            return Err("Ungültige Herkunft der Regeln".into());
        }
    }
    let mut k = laden(&app);
    let pfad = if eigener {
        match ordner_waehlen(&app, "Projektordner wählen")? {
            Some(p) => p,
            None => return Ok(None),
        }
    } else {
        let b = k.basis.clone().filter(|b| pfad_text_ok(b)).ok_or("Zuerst den Projekte-Ordner auf der Festplatte festlegen („Ordner wählen …“).")?;
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
    if !pfad_text_ok(&t) {
        return Err("Ungültiger Pfad".into());
    }
    let alt = k.projekte.get(&projekt).and_then(|e| e.regeln_von.clone());
    k.version = 1;
    k.projekte.insert(projekt, Eintrag { pfad: t.clone(), regeln_von: regeln_von.or(alt) });
    speichern(&app, &k)?;
    Ok(Some(t))
}

/// Feste Unterordner, die „Im Explorer öffnen“ zeigen darf.
const UNTERORDNER: &[&str] = &["code", "regeln", "konzept", "doku", "material", "sicherungen"];

/// Verknüpften Projektordner (oder einen festen Unterordner) im Explorer bzw. Finder öffnen – nie einen beliebigen Pfad.
#[tauri::command]
pub fn ws_ordner_oeffnen(app: tauri::AppHandle, projekt: String, unterordner: Option<String>) -> Result<(), String> {
    if !kennung_ok(&projekt) {
        return Err("Ungültige Projekt-Kennung".into());
    }
    let k = laden(&app);
    let e = k.projekte.get(&projekt).filter(|e| pfad_text_ok(&e.pfad)).ok_or("Für dieses Projekt ist auf diesem PC noch kein Projektordner verknüpft.")?;
    let mut p = PathBuf::from(&e.pfad);
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
    fn konfig_lesen() {
        let k: Konfig = serde_json::from_str(r#"{"basis":"/p","projekte":{"x1":{"pfad":"/p/x1"}}}"#).unwrap();
        assert_eq!(k.projekte.get("x1").unwrap().regeln_von, None);
        assert_eq!(k.basis.as_deref(), Some("/p"));
    }
}
