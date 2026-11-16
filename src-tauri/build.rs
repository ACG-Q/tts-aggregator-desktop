fn main() {
    // 图标被替换时需要重新嵌入 Windows 可执行文件资源，否则开发构建会沿用旧图标。
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
