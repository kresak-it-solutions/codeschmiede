fn main() {
    // Eigene Befehle des Programms – nur diese darf die Oberfläche aufrufen (siehe capabilities/web.json)
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "ws_check", "ws_start", "ws_token", "ws_stop", "ws_status", "ws_statuszeile", "ws_update_status", "ws_update_neustart",
        "ws_design_geraet", "ws_design_signieren",
        "ws_ordner_stand", "ws_ordner_basis_waehlen", "ws_ordner_verknuepfen", "ws_ordner_oeffnen",
        "ws_einlesen_quelle", "ws_einlesen_ziel",
    ])))
    .expect("tauri-build fehlgeschlagen");
}
