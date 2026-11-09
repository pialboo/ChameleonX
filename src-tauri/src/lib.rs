use std::os::windows::process::CommandExt;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
struct BackendState {
    child: Arc<Mutex<Option<Child>>>,
    is_quitting: Arc<Mutex<bool>>,
}

#[tauri::command]
fn window_control(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        match action.as_str() {
            "minimize" => {
                let _ = window.minimize();
            }
            "maximize" => {
                if let Ok(maximized) = window.is_maximized() {
                    if maximized {
                        let _ = window.unmaximize();
                    } else {
                        let _ = window.maximize();
                    }
                }
            }
            "close" | "hide" => {
                let _ = window.hide();
            }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = open::that(&url);
    }
    Ok(())
}

fn find_backend_executable() -> Option<std::path::PathBuf> {
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(current_dir) = current_exe.parent() {
            // 1. Packaged sidecar binary placed in same folder as chameleonx.exe
            let candidate1 = current_dir.join("chameleon-backend.exe");
            if candidate1.exists() {
                return Some(candidate1);
            }

            // 2. Packaged sidecar binary in resources/
            let candidate2 = current_dir.join("resources").join("chameleon-backend.exe");
            if candidate2.exists() {
                return Some(candidate2);
            }
        }
    }

    // 3. Local build/dev binary in src-tauri/binaries/chameleon-backend-x86_64-pc-windows-msvc.exe
    let candidate3 = std::path::Path::new("src-tauri")
        .join("binaries")
        .join("chameleon-backend-x86_64-pc-windows-msvc.exe");
    if candidate3.exists() {
        return Some(candidate3.to_path_buf());
    }

    // 4. Dist-backend binary: dist-backend/chameleon-backend.exe
    let candidate4 = std::path::Path::new("dist-backend")
        .join("chameleon-backend.exe");
    if candidate4.exists() {
        return Some(candidate4.to_path_buf());
    }

    None
}

fn start_backend_if_needed(child_holder: Arc<Mutex<Option<Child>>>) {
    // Check if backend on 127.0.0.1:19888 is already running
    if std::net::TcpStream::connect("127.0.0.1:19888").is_ok() {
        println!("[ChameleonX] Backend already active on port 19888.");
        return;
    }

    // Priority 1: Standalone sidecar binary (No external Node.js required!)
    if let Some(backend_bin) = find_backend_executable() {
        println!("[ChameleonX] Spawning standalone backend sidecar: {}", backend_bin.display());
        let mut cmd = Command::new(&backend_bin);
        cmd.stdin(std::process::Stdio::piped());
        cmd.creation_flags(CREATE_NO_WINDOW);

        #[cfg(not(debug_assertions))]
        if let Ok(appdata) = std::env::var("APPDATA") {
            let data_dir = std::path::PathBuf::from(&appdata).join("ChameleonX").join("data");
            cmd.env("CHAMELEON_DATA_DIR", data_dir.to_string_lossy().to_string());
        }

        match cmd.spawn() {
            Ok(child) => {
                println!("[ChameleonX] Standalone backend sidecar process started (PID: {})", child.id());
                let mut guard = child_holder.lock().unwrap();
                *guard = Some(child);
                return;
            }
            Err(e) => {
                eprintln!("[ChameleonX] Failed to spawn sidecar binary, falling back to node: {}", e);
            }
        }
    }

    // Priority 2: Fallback to local node if binary not yet built
    let default_dir = std::path::PathBuf::from(".");
    let current_exe = std::env::current_exe().unwrap_or_default();
    let current_dir = current_exe.parent().unwrap_or(&default_dir);

    let standalone_script = current_dir.join("electron").join("backend").join("standalone.cjs");
    let dev_script = std::path::Path::new("electron").join("backend").join("standalone.cjs");

    let script_path = if standalone_script.exists() {
        standalone_script
    } else if dev_script.exists() {
        dev_script
    } else {
        std::path::PathBuf::from("electron/backend/standalone.cjs")
    };

    println!("[ChameleonX] Spawning backend fallback: node {}", script_path.display());

    let mut cmd = Command::new("node");
    cmd.arg(&script_path);
    cmd.stdin(std::process::Stdio::piped());
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(not(debug_assertions))]
    if let Ok(appdata) = std::env::var("APPDATA") {
        let data_dir = std::path::PathBuf::from(&appdata).join("ChameleonX").join("data");
        cmd.env("CHAMELEON_DATA_DIR", data_dir.to_string_lossy().to_string());
    }

    match cmd.spawn() {
        Ok(child) => {
            println!("[ChameleonX] Backend child process started (PID: {})", child.id());
            let mut guard = child_holder.lock().unwrap();
            *guard = Some(child);
        }
        Err(e) => {
            eprintln!("[ChameleonX] Failed to spawn backend process: {}", e);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_state = BackendState::default();
    let child_holder = backend_state.child.clone();
    let is_quitting = backend_state.is_quitting.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![window_control, open_external])
        .setup(move |app| {
            let handle = app.handle();

            // 1. Start backend process
            start_backend_if_needed(child_holder.clone());

            // 2. Build Tray Menu
            let item_show = MenuItem::with_id(handle, "show", "🦎 顯示 ChameleonX 主視窗", true, None::<&str>)?;
            let item_minimize = MenuItem::with_id(handle, "minimize", "縮小至工具列", true, None::<&str>)?;
            let item_hide = MenuItem::with_id(handle, "hide", "隱藏至系統匣", true, None::<&str>)?;
            let item_quit = MenuItem::with_id(handle, "quit", "🛑 完全退出 ChameleonX", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                handle,
                &[
                    &item_show,
                    &item_minimize,
                    &item_hide,
                    &item_quit,
                ],
            )?;

            // 3. Create Tray Icon
            let app_handle_for_tray = handle.clone();
            let is_quitting_for_tray = is_quitting.clone();
            let child_for_tray = child_holder.clone();

            if let Some(tray_icon) = app.default_window_icon().cloned() {
                let _tray = TrayIconBuilder::new()
                    .icon(tray_icon)
                    .tooltip("ChameleonX 指紋瀏覽器 (運行中)")
                    .menu(&tray_menu)
                    .on_menu_event(move |app, event| {
                        match event.id.as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.unminimize();
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "minimize" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.minimize();
                                }
                            }
                            "hide" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.hide();
                                }
                            }
                            "quit" => {
                                *is_quitting_for_tray.lock().unwrap() = true;
                                if let Ok(mut guard) = child_for_tray.lock() {
                                    if let Some(mut child) = guard.take() {
                                        // Drop stdin to signal graceful exit to backend
                                        drop(child.stdin.take());
                                        // Allow up to 800ms for backend to stop all running browser profiles
                                        let start = std::time::Instant::now();
                                        while start.elapsed() < std::time::Duration::from_millis(800) {
                                            if let Ok(Some(_)) = child.try_wait() {
                                                break;
                                            }
                                            std::thread::sleep(std::time::Duration::from_millis(50));
                                        }
                                        let _ = child.kill();
                                    }
                                }
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(move |_tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = app_handle_for_tray.get_webview_window("main") {
                                if let Ok(visible) = window.is_visible() {
                                    if visible {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.unminimize();
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        }
                    })
                    .build(handle)?;
            }

            // 4. Intercept window close to minimize to tray instead of quitting
            if let Some(window) = app.get_webview_window("main") {
                let is_quitting_for_close = is_quitting.clone();
                let win_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let quitting = *is_quitting_for_close.lock().unwrap();
                        if !quitting {
                            api.prevent_close();
                            let _ = win_clone.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
