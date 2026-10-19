use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("File is too large: {0}")]
    TooLarge(String),
    #[error("I/O error: {0}")]
    Io(String),
    #[error("JSON error: {0}")]
    Json(String),
    #[error("Blender was not found. Configure the executable path in Preferences or Diagnostics.")]
    BlenderNotFound,
    #[error("Blender process failed: {0}")]
    Process(String),
    #[error("Operation timed out: {0}")]
    Timeout(String),
    #[error("Unsupported: {0}")]
    Unsupported(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        AppError::Json(value.to_string())
    }
}

impl From<base64::DecodeError> for AppError {
    fn from(value: base64::DecodeError) -> Self {
        AppError::InvalidInput(format!("Invalid base64 data: {value}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
