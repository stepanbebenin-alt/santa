use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub name: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub theme: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Child {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub age: u32,
    pub weight: f32,
    pub episode: String,
    pub points48h: Vec<DiaryEntry>,
    pub reminders: Vec<Reminder>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub id: String,
    pub temp: f32,
    pub drink: Option<String>,
    pub med: Option<String>,
    pub note: String,
    pub hours_ago: f32,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub title: String,
    pub time: String,
    pub done: bool,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
    pub children: Vec<Child>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChildRequest {
    pub name: String,
    pub age: u32,
    pub weight: f32,
    pub episode: String,
}

#[derive(Debug, Deserialize)]
pub struct AddEntryRequest {
    pub temp: f32,
    pub drink: Option<String>,
    pub med: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddReminderRequest {
    pub title: String,
    pub time: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateThemeRequest {
    pub theme: String,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            message: None,
            data: Some(data),
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: Some(message.into()),
            data: None,
        }
    }
}
