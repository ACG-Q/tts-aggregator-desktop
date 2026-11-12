use mdns_sd::{ServiceDaemon, ServiceInfo};

const SERVICE_TYPE: &str = "_pulse-tts._tcp.local.";

pub struct MdnsRegistration {
    daemon: ServiceDaemon,
    fullname: String,
}

impl MdnsRegistration {
    pub fn register(device_name: &str, sid: &str, port: u16, nodes: usize) -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| format!("mDNS 初始化失败：{e}"))?;
        let instance = sanitize_instance(device_name);
        let host = format!("{}.local.", sanitize_host(device_name));
        let nodes_text = nodes.to_string();
        let props = [
            ("name", device_name),
            ("platform", "desktop"),
            ("v", "1"),
            ("sid", sid),
            ("nodes", nodes_text.as_str()),
        ];
        let info = ServiceInfo::new(SERVICE_TYPE, &instance, &host, "", port, &props[..])
            .map_err(|e| format!("mDNS 服务信息无效：{e}"))?
            .enable_addr_auto();
        let fullname = info.get_fullname().to_string();
        daemon
            .register(info)
            .map_err(|e| format!("mDNS 注册失败：{e}"))?;
        Ok(Self { daemon, fullname })
    }
}

impl Drop for MdnsRegistration {
    fn drop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

fn sanitize_instance(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-');
    if trimmed.is_empty() {
        "Pulse Desktop".into()
    } else {
        trimmed.to_string()
    }
}

fn sanitize_host(name: &str) -> String {
    sanitize_instance(name).to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_keeps_ascii_and_falls_back_for_chinese() {
        assert_eq!(sanitize_instance("书房的 电脑"), "Pulse Desktop");
        assert_eq!(sanitize_instance("Study PC"), "Study-PC");
    }
}
