use super::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn serve_once(
    status: u16,
    headers: &str,
    body: &str,
) -> (String, tokio::task::JoinHandle<String>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let response = format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n{headers}\r\n{body}", body.len());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = Vec::new();
        loop {
            let mut chunk = [0u8; 4096];
            let n = socket.read(&mut chunk).await.unwrap();
            assert!(n > 0);
            bytes.extend_from_slice(&chunk[..n]);
            if let Some(end) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
                let header = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                let size = header
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("content-length:")
                            .and_then(|s| s.trim().parse::<usize>().ok())
                    })
                    .unwrap_or_default();
                if bytes.len() >= end + 4 + size {
                    break;
                }
            }
        }
        socket.write_all(response.as_bytes()).await.unwrap();
        String::from_utf8(bytes).unwrap()
    });
    (url, server)
}

#[tokio::test]
async fn mineru_upload_wire_contains_all_parsing_options() {
    let (url, server) = serve_once(200, "", r#"{"code":0,"data":{"batch_id":"batch-1","file_urls":["https://example.invalid/upload"]}}"#).await;
    let client = MineruClient::new(url, "fixture-token");
    let formats = vec!["html".to_string()];
    let target = client
        .apply_upload_url(
            "scan.pdf",
            &MineruUploadOptions {
                is_ocr: true,
                enable_formula: false,
                enable_table: false,
                language: "en",
                page_ranges: "2-3",
                data_id: "scan",
                extra_formats: &formats,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(target.batch_id, "batch-1");
    let request = server.await.unwrap();
    assert!(request.starts_with("POST /api/v4/file-urls/batch "));
    let payload: Value = serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(
        payload,
        json!({"model_version":"vlm","language":"en",
        "enable_formula":false,"enable_table":false,"extra_formats":["html"],
        "files":[{"name":"scan.pdf","is_ocr":true,"page_ranges":"2-3","data_id":"scan"}]})
    );
}

#[tokio::test]
async fn mineru_query_preserves_http_business_errors_and_retry_after() {
    for (status, body, retryable, expected_code) in [
        (429, "upstream busy", true, None),
        (503, "upstream unavailable", true, None),
        (
            200,
            r#"{"code":-60009,"msg":"队列已满","trace_id":"trace-queue","data":[]}"#,
            true,
            Some("-60009"),
        ),
        (
            200,
            r#"{"code":"A0211","msg":"503 timeout","data":[]}"#,
            false,
            Some("A0211"),
        ),
        (200, r#"{"data":{}}"#, false, None),
        (200, "not json", false, None),
    ] {
        let (url, server) = serve_once(status, "Retry-After: 7\r\n", body).await;
        let client = MineruClient::new(url, "fixture-token");
        let err = client
            .query_batch_status("original-batch")
            .await
            .unwrap_err();
        let response = err
            .downcast_ref::<MineruResponseError>()
            .expect("typed provider error");
        assert_eq!(response.info.http_status, Some(status));
        assert_eq!(response.info.provider_code.as_deref(), expected_code);
        assert_eq!(response.retryable_query(), retryable);
        assert_eq!(response.retry_after_secs, Some(7));
        assert!(server
            .await
            .unwrap()
            .starts_with("GET /api/v4/extract-results/batch/original-batch "));
    }
}

#[tokio::test]
async fn mineru_query_accepts_numeric_and_string_success_codes() {
    for code in [json!(0), json!("0")] {
        let (url, server) = serve_once(200, "", &json!({"code":code,"data":{"state":"done","task_id":"task-1","full_zip_url":"https://example.invalid/result.zip"}}).to_string()).await;
        let task = MineruClient::new(url, "fixture-token")
            .query_task("task-1")
            .await
            .unwrap();
        assert_eq!(task.data.state, "done");
        server.await.unwrap();
    }
}
