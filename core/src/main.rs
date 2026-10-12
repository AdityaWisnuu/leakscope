//! Reads one raw transaction hex per line on stdin (or file paths as args) and
//! writes one JSON object of public facts per line on stdout.

use std::io::{self, BufRead, Write};

fn emit(out: &mut impl Write, hex: &str) {
    let line = match leakscope_core::parse_hex(hex) {
        Ok(f) => serde_json::to_string(&f).unwrap(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    };
    writeln!(out, "{line}").unwrap();
}

fn main() {
    let out = io::stdout();
    let mut out = out.lock();
    let files: Vec<String> = std::env::args().skip(1).collect();
    if files.is_empty() {
        for line in io::stdin().lock().lines() {
            let line = line.unwrap();
            if !line.trim().is_empty() {
                emit(&mut out, &line);
            }
        }
    } else {
        for f in files {
            emit(&mut out, &std::fs::read_to_string(&f).expect("readable file"));
        }
    }
}
