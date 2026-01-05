use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableData {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub file_type: String,
    pub file_path: String,
    pub json_format: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveRequest {
    pub file_path: String,
    pub file_type: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub json_format: String,
}

fn sanitize_json_string(content: &str) -> String {
    content
        .chars()
        .map(|c| {
            if c.is_control() && c != '\n' && c != '\r' && c != '\t' {
                ' '
            } else {
                c
            }
        })
        .collect()
}

fn parse_json(content: &str) -> Result<(Vec<String>, Vec<Vec<String>>, String), String> {
    let sanitized = sanitize_json_string(content);

    let value: Value =
        serde_json::from_str(&sanitized).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    match value {
        Value::Array(arr) => {
            if arr.is_empty() {
                return Ok((vec![], vec![], "array".to_string()));
            }

            let mut headers: Vec<String> = Vec::new();
            let mut rows: Vec<Vec<String>> = Vec::new();

            for item in &arr {
                if let Value::Object(obj) = item {
                    for key in obj.keys() {
                        if !headers.contains(key) {
                            headers.push(key.clone());
                        }
                    }
                }
            }

            for item in &arr {
                if let Value::Object(obj) = item {
                    let row: Vec<String> = headers
                        .iter()
                        .map(|h| obj.get(h).map(|v| value_to_string(v)).unwrap_or_default())
                        .collect();
                    rows.push(row);
                }
            }

            Ok((headers, rows, "array".to_string()))
        }
        Value::Object(obj) => {
            let headers = vec!["Key".to_string(), "Value".to_string()];
            let rows: Vec<Vec<String>> = obj
                .iter()
                .map(|(k, v)| vec![k.clone(), value_to_string(v)])
                .collect();
            Ok((headers, rows, "object".to_string()))
        }
        _ => Err("JSON must be an object or array".to_string()),
    }
}

fn parse_jsonl(content: &str) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let sanitized = sanitize_json_string(content);
    let mut headers: Vec<String> = Vec::new();
    let mut rows: Vec<Vec<String>> = Vec::new();

    for line in sanitized.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(line) {
            for key in obj.keys() {
                if !headers.contains(key) {
                    headers.push(key.clone());
                }
            }
        }
    }

    for line in sanitized.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(line) {
            let row: Vec<String> = headers
                .iter()
                .map(|h| obj.get(h).map(|v| value_to_string(v)).unwrap_or_default())
                .collect();
            rows.push(row);
        }
    }

    Ok((headers, rows))
}

fn parse_csv(content: &str) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(content.as_bytes());

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("Failed to read CSV headers: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|e| format!("Failed to read CSV row: {}", e))?;
        let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
        rows.push(row);
    }

    Ok((headers, rows))
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::Null => "".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        Value::Array(arr) => serde_json::to_string(arr).unwrap_or_default(),
        Value::Object(obj) => serde_json::to_string(obj).unwrap_or_default(),
    }
}

fn string_to_value(s: &str) -> Value {
    if s.is_empty() {
        return Value::Null;
    }

    if let Ok(v) = serde_json::from_str::<Value>(s) {
        return v;
    }

    if s == "true" {
        return Value::Bool(true);
    }
    if s == "false" {
        return Value::Bool(false);
    }

    if let Ok(n) = s.parse::<i64>() {
        return Value::Number(n.into());
    }
    if let Ok(n) = s.parse::<f64>() {
        if let Some(num) = serde_json::Number::from_f64(n) {
            return Value::Number(num);
        }
    }

    Value::String(s.to_string())
}

#[tauri::command]
fn load_file(file_path: String) -> Result<TableData, String> {
    let path = Path::new(&file_path);

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let content =
        fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let (headers, rows, json_format) = match extension.as_str() {
        "json" => {
            let (h, r, f) = parse_json(&content)?;
            (h, r, f)
        }
        "jsonl" => {
            let (h, r) = parse_jsonl(&content)?;
            (h, r, "array".to_string())
        }
        "csv" => {
            let (h, r) = parse_csv(&content)?;
            (h, r, "array".to_string())
        }
        _ => return Err(format!("Unsupported file type: {}", extension)),
    };

    Ok(TableData {
        headers,
        rows,
        file_type: extension,
        file_path,
        json_format,
    })
}

#[tauri::command]
fn save_file(request: SaveRequest) -> Result<(), String> {
    let path = Path::new(&request.file_path);

    match request.file_type.as_str() {
        "json" => {
            if request.json_format == "object"
                && request.headers.len() == 2
                && request.headers[0] == "Key"
                && request.headers[1] == "Value"
            {
                let mut obj = Map::new();
                for row in &request.rows {
                    let key = row.get(0).map(|s| s.as_str()).unwrap_or("");
                    let value = row.get(1).map(|s| s.as_str()).unwrap_or("");
                    if !key.is_empty() {
                        obj.insert(key.to_string(), string_to_value(value));
                    }
                }

                let json_str = serde_json::to_string_pretty(&obj)
                    .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

                fs::write(path, json_str).map_err(|e| format!("Failed to write file: {}", e))?;
            } else {
                let arr: Vec<Map<String, Value>> = request
                    .rows
                    .iter()
                    .map(|row| {
                        let mut obj = Map::new();
                        for (i, header) in request.headers.iter().enumerate() {
                            let value = row.get(i).map(|s| s.as_str()).unwrap_or("");
                            obj.insert(header.clone(), string_to_value(value));
                        }
                        obj
                    })
                    .collect();

                let json_str = serde_json::to_string_pretty(&arr)
                    .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

                fs::write(path, json_str).map_err(|e| format!("Failed to write file: {}", e))?;
            }
        }
        "jsonl" => {
            let mut file =
                fs::File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;

            for row in &request.rows {
                let mut obj = Map::new();
                for (i, header) in request.headers.iter().enumerate() {
                    let value = row.get(i).map(|s| s.as_str()).unwrap_or("");
                    obj.insert(header.clone(), string_to_value(value));
                }
                let line = serde_json::to_string(&obj)
                    .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
                writeln!(file, "{}", line).map_err(|e| format!("Failed to write line: {}", e))?;
            }
        }
        "csv" => {
            let mut writer = csv::Writer::from_path(path)
                .map_err(|e| format!("Failed to create CSV writer: {}", e))?;

            writer
                .write_record(&request.headers)
                .map_err(|e| format!("Failed to write headers: {}", e))?;

            for row in &request.rows {
                writer
                    .write_record(row)
                    .map_err(|e| format!("Failed to write row: {}", e))?;
            }

            writer
                .flush()
                .map_err(|e| format!("Failed to flush CSV: {}", e))?;
        }
        _ => return Err(format!("Unsupported file type: {}", request.file_type)),
    }

    Ok(())
}

#[tauri::command]
fn export_file(
    request: SaveRequest,
    export_path: String,
    export_type: String,
) -> Result<(), String> {
    let mut modified_request = request;
    modified_request.file_path = export_path;
    modified_request.file_type = export_type;
    modified_request.json_format = "array".to_string();
    save_file(modified_request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![load_file, save_file, export_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
