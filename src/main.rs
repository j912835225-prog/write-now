#[cfg(feature = "verify")]
mod verify;
use muda::{
    CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu,
    accelerator::{Accelerator, Code, Modifiers},
};
use serde_json::{Value, json};
use std::{
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::WindowBuilder,
};
use wry::{DragDropEvent, WebView, WebViewBuilder};

#[derive(Debug)]
enum AppEvent {
    Ipc(String),
    Menu(String),
    Open(PathBuf),
}

/// 偏好、上次文件、未命名草稿都放在 ~/Library/Application Support/剧本/；验收构建不读不写
fn support_dir() -> Option<PathBuf> {
    if cfg!(feature = "verify") {
        return None;
    }
    let dir =
        PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support/Write Now");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}
fn draft_path() -> Option<PathBuf> {
    support_dir().map(|d| d.join("未命名草稿.fountain"))
}
fn drop_draft() {
    if let Some(p) = draft_path() {
        let _ = std::fs::remove_file(p);
    }
}
fn load_state() -> Value {
    support_dir()
        .and_then(|d| std::fs::read_to_string(d.join("state.json")).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}))
}
fn save_state(state: &Value) {
    if let Some(d) = support_dir() {
        let _ = atomic_save(&d.join("state.json"), &state.to_string());
    }
}

#[derive(Default)]
struct Document {
    path: Option<PathBuf>,
    text: String,
    dirty: bool,
    due: Option<Instant>,
}
impl Document {
    fn save(&mut self, as_new: bool) -> bool {
        let path = if as_new || self.path.is_none() {
            let mut dialog = rfd::FileDialog::new().add_filter("Fountain", &["fountain"]);
            if let Some(parent) = self.path.as_ref().and_then(|p| p.parent()) {
                dialog = dialog.set_directory(parent);
            }
            dialog
                .set_file_name(
                    self.path
                        .as_ref()
                        .and_then(|p| p.file_name())
                        .and_then(|s| s.to_str())
                        .unwrap_or("未命名.fountain"),
                )
                .save_file()
        } else {
            self.path.clone()
        };
        let Some(mut path) = path else {
            return false;
        };
        if path.extension().is_none() {
            path.set_extension("fountain");
        }
        match atomic_save(&path, &self.text) {
            Ok(()) => {
                if self.path.is_none() {
                    drop_draft();
                }
                self.path = Some(path);
                self.dirty = false;
                self.due = None;
                true
            }
            Err(e) => {
                error(&format!("未能保存，文本仍留在窗口中。\n{e}"));
                self.due = None;
                false
            }
        }
    }
    /// 未命名稿停笔 600ms 后写进草稿，崩溃或强退后下次启动还在
    fn keep_draft(&mut self) {
        self.due = None;
        if let Some(p) = draft_path() {
            if self.text.is_empty() {
                drop_draft();
            } else {
                let _ = atomic_save(&p, &self.text);
            }
        }
    }
    fn leave(&mut self) -> bool {
        if !self.dirty {
            return true;
        }
        if self.path.is_some() {
            return self.save(false);
        }
        if self.text.is_empty() {
            drop_draft();
            return true;
        }
        match rfd::MessageDialog::new()
            .set_title("未保存的剧本")
            .set_description("保存后再继续？")
            .set_buttons(rfd::MessageButtons::YesNoCancel)
            .show()
        {
            rfd::MessageDialogResult::Yes => self.save(false),
            rfd::MessageDialogResult::No => {
                drop_draft();
                true
            }
            _ => false,
        }
    }
}
fn atomic_save(path: &Path, text: &str) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or(Path::new("."));
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let temp = parent.join(format!(".{name}.{}.tmp", std::process::id()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    let result = (|| {
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_save_preserves_original_when_temp_is_occupied() {
        let dir = std::env::temp_dir().join(format!("script-paper-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sample.fountain");
        atomic_save(&path, "旧稿").unwrap();
        let temp = dir.join(format!(".sample.fountain.{}.tmp", std::process::id()));
        std::fs::write(&temp, "未恢复稿").unwrap();
        assert!(atomic_save(&path, "新稿").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "旧稿");
        assert_eq!(std::fs::read_to_string(&temp).unwrap(), "未恢复稿");
        std::fs::remove_file(temp).unwrap();
        atomic_save(&path, "新稿").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "新稿");
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn shelf_takes_scripts_not_notes() {
        let dir = std::env::temp_dir().join(format!("write-now-shelf-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let cases = [
            ("a.fountain", "随便", true),
            ("屋顶.txt", "\u{feff}标题\n\n1.外景.屋顶.日\n\n周宁", true),
            ("b.txt", "\n12、内景 客厅 夜\n", true),
            ("c.md", "INT. HOUSE - DAY\n", true),
            ("笔记.txt", "今天想到一个点子。\n1. 买菜", false),
            ("README.md", "# Write Now\n..说明", false),
            ("x.rtf", "INT. HOUSE", false),
        ];
        for (name, text, want) in cases {
            let p = dir.join(name);
            std::fs::write(&p, text).unwrap();
            assert_eq!(looks_like_script(&p), want, "{name}");
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
}
/// 导出对话框：默认放在稿子旁边，名字同稿
fn export_to(doc: &Document, label: &str, ext: &str) -> Option<PathBuf> {
    let stem = doc
        .path
        .as_ref()
        .and_then(|p| p.file_stem())
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "未命名".into());
    let mut dialog = rfd::FileDialog::new()
        .add_filter(label, &[ext])
        .set_file_name(format!("{stem}.{ext}"));
    if let Some(dir) = doc.path.as_ref().and_then(|p| p.parent()) {
        dialog = dialog.set_directory(dir);
    }
    dialog.save_file().map(|mut p| {
        if p.extension().is_none() {
            p.set_extension(ext);
        }
        p
    })
}
/// PDF 直接存文件，不经打印对话框；A4、边距交给 CSS 的 @page
fn export_pdf(view: &WebView, path: &Path) {
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob};
    use objc2_foundation::{NSCopying, NSSize, NSString, NSURL};
    use wry::WebViewExtMacOS;
    unsafe {
        let info = NSPrintInfo::sharedPrintInfo().copy();
        info.setPaperSize(NSSize::new(595.28, 841.89));
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);
        info.setJobDisposition(NSPrintSaveJob);
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        info.dictionary().setObject_forKey(
            url.as_ref(),
            objc2::runtime::ProtocolObject::from_ref(NSPrintJobSavingURL),
        );
        let op = view.webview().printOperationWithPrintInfo(&info);
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(true);
        op.setCanSpawnSeparateThread(true);
        op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            &view.ns_window(),
            None,
            None,
            std::ptr::null_mut(),
        );
    }
}
fn error(s: &str) {
    rfd::MessageDialog::new()
        .set_title("Write Now")
        .set_description(s)
        .set_level(rfd::MessageLevel::Error)
        .show();
}
fn load_into(webview: &WebView, text: &str) {
    let _ = webview.evaluate_script(&format!(
        "window.loadText({})",
        serde_json::to_string(text).unwrap()
    ));
}
fn open_path(doc: &mut Document, webview: &WebView, state: &mut Value, path: PathBuf) {
    if !doc.leave() {
        return;
    }
    match std::fs::read_to_string(&path) {
        Ok(text) => {
            load_into(webview, &text);
            state["last"] = json!(path.to_string_lossy());
            save_state(state);
            *doc = Document {
                path: Some(path),
                text,
                ..Default::default()
            };
        }
        Err(e) => error(&format!("未能打开 {}：{e}", path.display())),
    }
}
/// .fountain 都算；.txt .md 要开头 64KB 里有一行场次才算，免得笔记混进来
fn looks_like_script(p: &Path) -> bool {
    let ext = p
        .extension()
        .map(|x| x.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if ext == "fountain" {
        return true;
    }
    if ext != "txt" && ext != "md" {
        return false;
    }
    let mut buf = Vec::new();
    if std::fs::File::open(p)
        .and_then(|f| std::io::Read::read_to_end(&mut std::io::Read::take(f, 65536), &mut buf))
        .is_err()
    {
        return false;
    }
    String::from_utf8_lossy(&buf).lines().any(|l| {
        let s = l.trim().trim_start_matches('\u{feff}');
        let up = s.to_uppercase();
        let body = s.trim_start_matches(|c: char| c.is_ascii_digit());
        let numbered = body.len() < s.len()
            && body
                .trim_start()
                .strip_prefix(['.', '．', '、'])
                .map(str::trim_start)
                .is_some_and(|r| {
                    [
                        "内景", "外景", "日", "夜", "白天", "傍晚", "黄昏", "清晨", "凌晨",
                    ]
                    .iter()
                    .any(|w| r.starts_with(w))
                });
        ["INT.", "EXT.", "INT ", "EXT ", "INT/EXT", "I/E"]
            .iter()
            .any(|w| up.starts_with(w))
            || s.starts_with("内景")
            || s.starts_with("外景")
            || (s.starts_with('.') && !s.starts_with("..") && s.len() > 1)
            || numbered
    })
}
/// 左栏的剧本架：当前稿所在文件夹里的剧本，没有当前稿就看上次的文件夹
fn shelf(webview: &WebView, doc: &Document, state: &Value) {
    let dir = doc
        .path
        .as_ref()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .or_else(|| {
            state["last"]
                .as_str()
                .and_then(|p| Path::new(p).parent().map(Path::to_path_buf))
        });
    let mut files: Vec<PathBuf> = dir
        .and_then(|d| std::fs::read_dir(d).ok())
        .map(|r| {
            r.filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| {
                    looks_like_script(p)
                        && !p
                            .file_name()
                            .is_some_and(|n| n.to_string_lossy().starts_with('.'))
                })
                .collect()
        })
        .unwrap_or_default();
    if let Some(c) = &doc.path {
        if !files.contains(c) {
            files.push(c.clone());
        }
    }
    files.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
    let files: Vec<Value> = files
        .iter()
        .map(|p| {
            json!({
                "name": p.file_stem().unwrap_or_default().to_string_lossy(),
                "path": p.to_string_lossy(),
            })
        })
        .collect();
    let cur = doc.path.as_ref().map(|p| p.to_string_lossy().into_owned());
    let _ = webview.evaluate_script(&format!(
        "window.setShelf({})",
        json!({"files": files, "cur": cur})
    ));
}
fn key(code: Code, shift: bool) -> Option<Accelerator> {
    let m = if shift {
        Modifiers::SUPER | Modifiers::SHIFT
    } else {
        Modifiers::SUPER
    };
    Some(Accelerator::new(Some(m), code))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut state = load_state();
    let event_loop = EventLoopBuilder::<AppEvent>::with_user_event().build();
    let (w, h) = (
        state["width"].as_f64().unwrap_or(980.).clamp(480., 4000.),
        state["height"].as_f64().unwrap_or(800.).clamp(360., 3000.),
    );
    let window = WindowBuilder::new()
        .with_title("未命名 — Write Now")
        .with_inner_size(LogicalSize::new(w, h))
        .with_min_inner_size(LogicalSize::new(480., 360.))
        .build(&event_loop)?;

    let menu = Menu::new();
    let app = Submenu::new("Write Now", true);
    app.append_items(&[
        &PredefinedMenuItem::about(Some("关于 Write Now"), None),
        &PredefinedMenuItem::separator(),
        &PredefinedMenuItem::hide(Some("隐藏 Write Now")),
        &PredefinedMenuItem::hide_others(Some("隐藏其他")),
        &PredefinedMenuItem::show_all(Some("全部显示")),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("quit", "退出 Write Now", true, key(Code::KeyQ, false)),
    ])?;
    let file = Submenu::new("文件", true);
    file.append_items(&[
        &MenuItem::with_id("new", "新建", true, key(Code::KeyN, false)),
        &MenuItem::with_id("open", "打开…", true, key(Code::KeyO, false)),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("save", "保存", true, key(Code::KeyS, false)),
        &MenuItem::with_id("saveas", "另存为…", true, key(Code::KeyS, true)),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("cover", "封面", true, key(Code::KeyT, true)),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("pdf", "导出 PDF…", true, key(Code::KeyE, true)),
        &MenuItem::with_id("docx", "导出 Word…", true, None),
        &MenuItem::with_id("print", "打印…", true, key(Code::KeyP, false)),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("quit", "关闭", true, key(Code::KeyW, false)),
    ])?;
    let edit = Submenu::new("编辑", true);
    edit.append_items(&[
        &MenuItem::with_id("undo", "撤销", true, key(Code::KeyZ, false)),
        &MenuItem::with_id("redo", "重做", true, key(Code::KeyZ, true)),
        &PredefinedMenuItem::separator(),
        &PredefinedMenuItem::cut(Some("剪切")),
        &PredefinedMenuItem::copy(Some("拷贝")),
        &PredefinedMenuItem::paste(Some("粘贴")),
        &PredefinedMenuItem::select_all(Some("全选")),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("find", "查找…", true, key(Code::KeyF, false)),
        &MenuItem::with_id("findnext", "查找下一个", true, key(Code::KeyG, false)),
        &MenuItem::with_id("findprev", "查找上一个", true, key(Code::KeyG, true)),
    ])?;
    let layout_now = state["layout"].as_str().unwrap_or("zh").to_owned();
    let layouts: Vec<CheckMenuItem> = [("zh", "中文"), ("en", "English"), ("ja", "日本語")]
        .into_iter()
        .map(|(id, label)| CheckMenuItem::with_id(id, label, true, id == layout_now, None))
        .collect();
    let scenes = CheckMenuItem::with_id(
        "scenes",
        "侧栏常显",
        true,
        state["scenes"].as_bool().unwrap_or(false),
        key(Code::KeyL, true),
    );
    let layout = Submenu::new("排法", true);
    for item in &layouts {
        layout.append(item)?;
    }
    layout.append_items(&[
        &PredefinedMenuItem::separator(),
        &scenes,
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("zoomin", "放大", true, key(Code::Equal, false)),
        &MenuItem::with_id("zoomout", "缩小", true, key(Code::Minus, false)),
        &MenuItem::with_id("zoom0", "实际大小", true, key(Code::Digit0, false)),
    ])?;
    let win = Submenu::new("窗口", true);
    win.append_items(&[
        &PredefinedMenuItem::minimize(Some("最小化")),
        &PredefinedMenuItem::fullscreen(Some("进入全屏")),
    ])?;
    menu.append_items(&[&app, &file, &edit, &layout, &win])?;
    menu.init_for_nsapp();
    win.set_as_windows_menu_for_nsapp();

    let proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let _ = proxy.send_event(AppEvent::Menu(event.id.0));
    }));
    let html = include_str!("../ui/index.html")
        .replace("/*STYLE*/", include_str!("../ui/style.css"))
        .replace(
            "/*SCRIPT*/",
            &format!(
                "{}\n{}",
                include_str!("../ui/model.js"),
                include_str!("../ui/editor.js")
            ),
        );
    #[cfg(feature = "verify")]
    let html = html.replace(
        "</body>",
        &format!(
            "<script>{}</script></body>",
            format!(
                "const SAMPLES={};\n{}",
                serde_json::json!({
                    "chinese": include_str!("../samples/中文.fountain"),
                    "english": include_str!("../samples/English.fountain"),
                    "japanese": include_str!("../samples/日本語.fountain")
                }),
                include_str!("../tests/native.js")
            )
        ),
    );
    let prefs = json!({
        "layout": layout_now,
        "zoom": state["zoom"].as_f64().unwrap_or(1.),
        "scenes": state["scenes"].as_bool().unwrap_or(false),
    });
    let ipc = event_loop.create_proxy();
    let drop = event_loop.create_proxy();
    let webview = WebViewBuilder::new()
        .with_initialization_script(&format!("window.PREFS={prefs};"))
        .with_html(html)
        .with_incognito(true)
        .with_navigation_handler(|url| url == "about:blank")
        .with_drag_drop_handler(move |e| match e {
            DragDropEvent::Enter { paths, .. } => !paths.is_empty(),
            DragDropEvent::Drop { paths, .. } if !paths.is_empty() => {
                let _ = drop.send_event(AppEvent::Open(paths[0].clone()));
                true
            }
            _ => false,
        })
        .with_ipc_handler(move |request| {
            let _ = ipc.send_event(AppEvent::Ipc(request.body().clone()));
        })
        .build(&window)?;

    let mut doc = Document::default();
    #[cfg(feature = "verify")]
    {
        std::fs::create_dir_all(concat!(env!("CARGO_MANIFEST_DIR"), "/tmp/verification")).unwrap();
        doc.path = Some(PathBuf::from(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tmp/verification/autosave.fountain"
        )));
    }
    let mut ready = false;
    let mut pending: Vec<PathBuf> = vec![];
    let mut title = String::new();
    let mut shelved: Option<Option<PathBuf>> = None;

    event_loop.run(move |event, _, flow| {
        let mut action = None;
        let mut wanted: Option<PathBuf> = None;
        let mut bytes: Vec<u8> = Vec::new();
        match event {
            Event::Opened { urls } => {
                for p in urls.iter().filter_map(|u| u.to_file_path().ok()) {
                    if ready {
                        open_path(&mut doc, &webview, &mut state, p);
                    } else {
                        pending.push(p);
                    }
                }
            }
            Event::UserEvent(AppEvent::Open(p)) => open_path(&mut doc, &webview, &mut state, p),
            Event::UserEvent(AppEvent::Menu(id)) => {
                let _ = webview.evaluate_script(&format!(
                    "window.command({})",
                    serde_json::to_string(&id).unwrap()
                ));
            }
            Event::UserEvent(AppEvent::Ipc(s)) => {
                if let Ok(v) = serde_json::from_str::<Value>(&s) {
                    #[cfg(feature = "verify")]
                    if v["verify"].is_string() {
                        let name = v["verify"].as_str().unwrap();
                        if name == "done" {
                            assert_eq!(
                                std::fs::read_to_string(doc.path.as_ref().unwrap()).unwrap(),
                                doc.text,
                                "autosave mismatch"
                            );
                            println!("autosave: passed");
                            println!("{}", v);
                            std::fs::write(
                                concat!(
                                    env!("CARGO_MANIFEST_DIR"),
                                    "/tmp/verification/results.json"
                                ),
                                v.to_string(),
                            )
                            .unwrap();
                            assert!(
                                v["results"]
                                    .as_array()
                                    .unwrap()
                                    .iter()
                                    .all(|r| r.get("error").is_none()
                                        && r.get("ok").is_none_or(|ok| ok == true)),
                                "native checks failed"
                            );
                            *flow = ControlFlow::Exit;
                        } else {
                            verify::capture(&webview, name);
                        }
                        return;
                    }
                    if let Some(p) = v.get("prefs").filter(|p| p.is_object()) {
                        let l = p["layout"].as_str().unwrap_or("zh");
                        for item in &layouts {
                            item.set_checked(item.id().0 == l);
                        }
                        scenes.set_checked(p["scenes"].as_bool().unwrap_or(false));
                        for k in ["layout", "zoom", "scenes"] {
                            state[k] = p[k].clone();
                        }
                        save_state(&state);
                    }
                    if let Some(text) = v["text"].as_str() {
                        if text != doc.text {
                            doc.text = text.into();
                            doc.dirty = true;
                            doc.due = Some(Instant::now() + Duration::from_millis(600));
                        }
                    }
                    action = v["action"].as_str().map(str::to_owned);
                    wanted = v["path"].as_str().map(PathBuf::from);
                    bytes = v["bytes"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|b| b.as_u64().map(|b| b as u8))
                                .collect()
                        })
                        .unwrap_or_default();
                }
            }
            Event::WindowEvent {
                event: WindowEvent::Focused(true),
                ..
            } => shelved = None,
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                let _ = webview.evaluate_script("window.command('quit')");
            }
            _ => {}
        }
        if let Some(action) = action {
            match action.as_str() {
                "ready" if !ready => {
                    ready = true;
                    // 启动：先找回未存的草稿，再开 Finder 递来的文件，都没有就开上次的稿
                    let draft = draft_path().and_then(|p| std::fs::read_to_string(p).ok());
                    if let Some(text) = draft.filter(|t| !t.is_empty()) {
                        load_into(&webview, &text);
                        doc = Document {
                            text,
                            dirty: true,
                            ..Default::default()
                        };
                    } else if pending.is_empty() {
                        if let Some(p) = state["last"].as_str().map(PathBuf::from) {
                            if p.is_file() {
                                pending.push(p);
                            }
                        }
                    }
                    for p in std::mem::take(&mut pending) {
                        open_path(&mut doc, &webview, &mut state, p);
                    }
                }
                "quit" => {
                    if doc.leave() {
                        let size = window.inner_size().to_logical::<f64>(window.scale_factor());
                        state["width"] = json!(size.width);
                        state["height"] = json!(size.height);
                        save_state(&state);
                        *flow = ControlFlow::Exit;
                        return;
                    }
                }
                "save" => {
                    doc.save(false);
                }
                "saveas" => {
                    doc.save(true);
                }
                "new" => {
                    if doc.leave() {
                        doc = Document::default();
                        load_into(&webview, "");
                        state["last"] = Value::Null;
                        save_state(&state);
                    }
                }
                "open" => {
                    if let Some(path) = rfd::FileDialog::new()
                        .add_filter("剧本", &["fountain", "txt", "md"])
                        .pick_file()
                    {
                        open_path(&mut doc, &webview, &mut state, path);
                    }
                }
                "openfile" => {
                    if let Some(p) = wanted.filter(|p| Some(p) != doc.path.as_ref()) {
                        open_path(&mut doc, &webview, &mut state, p);
                    }
                }
                "print" => {
                    if let Err(e) = webview.print() {
                        error(&format!("未能打开系统打印对话框：{e}"));
                    }
                }
                "pdf" => {
                    if let Some(path) = export_to(&doc, "PDF", "pdf") {
                        export_pdf(&webview, &path);
                    }
                }
                "docx" => {
                    if let Some(path) = export_to(&doc, "Word", "docx") {
                        if let Err(e) = std::fs::write(&path, &bytes) {
                            error(&format!("未能写出 {}：{e}", path.display()));
                        }
                    }
                }
                _ => {}
            }
            if matches!(action.as_str(), "save" | "saveas") && doc.path.is_some() {
                let last = json!(doc.path.as_ref().unwrap().to_string_lossy());
                if state["last"] != last {
                    state["last"] = last;
                    save_state(&state);
                }
            }
        }
        if ready && shelved.as_ref() != Some(&doc.path) {
            shelf(&webview, &doc, &state);
            shelved = Some(doc.path.clone());
        }
        if doc.dirty && doc.due.is_some_and(|t| Instant::now() >= t) {
            if doc.path.is_some() {
                doc.save(false);
            } else {
                doc.keep_draft();
            }
        }
        let name = doc
            .path
            .as_ref()
            .and_then(|p| p.file_name())
            .and_then(|p| p.to_str())
            .unwrap_or("未命名");
        let next = format!("{}{} — Write Now", name, if doc.dirty { " ·" } else { "" });
        if next != title {
            window.set_title(&next);
            title = next;
        }
        if *flow != ControlFlow::Exit {
            *flow = match doc.due {
                Some(t) => ControlFlow::WaitUntil(t),
                None => ControlFlow::Wait,
            };
        }
    });
}
