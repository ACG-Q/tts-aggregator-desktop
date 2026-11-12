use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_NODES: usize = 500;
pub const MAX_BODY_BYTES: usize = 1024 * 1024;
pub const CONFIRM_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncedNode {
    pub url: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "unknown")]
    pub health: String,
    #[serde(default = "unknown")]
    pub api_version: String,
    #[serde(default)]
    pub default_voice: String,
    #[serde(default)]
    pub voice_count: i64,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub keyless: Option<bool>,
}

fn unknown() -> String {
    "UNKNOWN".to_string()
}

impl SyncedNode {
    pub fn new(url: &str, label: &str) -> Self {
        Self {
            url: url.to_string(),
            label: label.to_string(),
            health: unknown(),
            api_version: unknown(),
            default_voice: String::new(),
            voice_count: 0,
            group: None,
            keyless: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PeerInfo {
    pub name: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub name: String,
    pub platform: String,
    pub v: u32,
    pub nodes: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SyncRequest {
    pub from: PeerInfo,
    #[serde(default)]
    pub nodes: Vec<SyncedNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub nodes: Vec<SyncedNode>,
    pub applied: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorBody {
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPayload {
    pub request_id: String,
    pub from: PeerInfo,
    pub nodes: Vec<SyncedNode>,
}

pub fn normalize_url(raw: &str) -> Option<String> {
    let s = raw.trim();
    let (scheme, rest) = if let Some(r) = strip_scheme(s, "http://") {
        ("http", r)
    } else if let Some(r) = strip_scheme(s, "https://") {
        ("https", r)
    } else {
        return None;
    };
    let rest = rest.split(['?', '#']).next().unwrap_or("");
    let (authority, path) = match rest.split_once('/') {
        Some((a, p)) => (a, p),
        None => (rest, ""),
    };
    let authority = authority.to_ascii_lowercase();
    if authority.is_empty() {
        return None;
    }
    let default_port = if scheme == "http" { ":80" } else { ":443" };
    let authority = authority.strip_suffix(default_port).unwrap_or(&authority);
    let path = path.trim_end_matches('/');
    Some(if path.is_empty() {
        format!("{scheme}://{authority}")
    } else {
        format!("{scheme}://{authority}/{path}")
    })
}

fn strip_scheme<'a>(s: &'a str, prefix: &str) -> Option<&'a str> {
    let head = s.get(..prefix.len())?;
    if head.eq_ignore_ascii_case(prefix) {
        Some(&s[prefix.len()..])
    } else {
        None
    }
}

/// 丢弃非法 URL，并把规范化后的结果去重（后出现的覆盖先出现的）。
pub fn sanitize_nodes(nodes: Vec<SyncedNode>) -> Vec<SyncedNode> {
    let mut map: Vec<(String, SyncedNode)> = Vec::new();
    for node in nodes {
        let Some(url) = normalize_url(&node.url) else {
            continue;
        };
        let item = SyncedNode {
            url: url.clone(),
            ..node
        };
        match map.iter_mut().find(|(k, _)| *k == url) {
            Some((_, slot)) => *slot = item,
            None => map.push((url, item)),
        }
    }
    map.into_iter().map(|(_, n)| n).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_default_port_and_trailing_slash() {
        assert_eq!(
            normalize_url("https://A.example.com:443/"),
            Some("https://a.example.com".into())
        );
        assert_eq!(
            normalize_url("http://a.example.com:80/tts/"),
            Some("http://a.example.com/tts".into())
        );
        assert_eq!(
            normalize_url("http://a.example.com:8080/"),
            Some("http://a.example.com:8080".into())
        );
    }

    #[test]
    fn normalize_rejects_non_http() {
        assert_eq!(normalize_url("ftp://a.example.com"), None);
        assert_eq!(normalize_url("a.example.com"), None);
        assert_eq!(normalize_url("   "), None);
    }

    #[test]
    fn sanitize_drops_invalid_and_dedupes_last_wins() {
        let nodes = vec![
            SyncedNode::new("https://a.example.com/", "旧"),
            SyncedNode::new("ftp://bad", "坏"),
            SyncedNode::new("https://A.example.com", "新"),
        ];
        let out = sanitize_nodes(nodes);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].label, "新");
        assert_eq!(out[0].url, "https://a.example.com");
    }
}
