use block2::RcBlock;
use objc2_app_kit::{NSImage, NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob};
use objc2_foundation::{NSError, NSSize, NSString, NSURL};
use std::path::PathBuf;
use wry::{WebView, WebViewExtMacOS};

pub fn capture(view: &WebView, name: &str) {
    assert!(name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tmp/verification");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{name}.tiff"));
    let completion = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        assert!(error.is_null(), "snapshot failed");
        let image = unsafe { image.as_ref() }.expect("snapshot image");
        assert!(
            image
                .TIFFRepresentation()
                .unwrap()
                .writeToFile_atomically(&NSString::from_str(path.to_str().unwrap()), true)
        );
        println!("snapshot: {}", path.display());
    });
    unsafe {
        view.webview()
            .takeSnapshotWithConfiguration_completionHandler(None, &completion);
        if std::env::var_os("SCRIPT_VERIFY_PRINT").is_none() {
            return;
        }
        let info = NSPrintInfo::sharedPrintInfo();
        info.setPaperSize(NSSize::new(595.28, 841.89));
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);
        info.setJobDisposition(NSPrintSaveJob);
        let path = dir.join(format!("{name}.pdf"));
        let url = NSURL::fileURLWithPath(&NSString::from_str(path.to_str().unwrap()));
        info.dictionary().setObject_forKey(
            url.as_ref(),
            objc2::runtime::ProtocolObject::from_ref(NSPrintJobSavingURL),
        );
        let op = view.webview().printOperationWithPrintInfo(&info);
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(false);
        op.setCanSpawnSeparateThread(true);
        op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            &view.ns_window(),
            None,
            None,
            std::ptr::null_mut(),
        );
        println!("print: {}", path.display());
    }
}
