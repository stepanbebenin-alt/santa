use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Utc;
use uuid::Uuid;

use crate::auth::hash_password;
use crate::models::{Child, DiaryEntry, Reminder, User};

const DB_FILE_PATH: &str = "pediasense_data.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct PersistentData {
    pub users: HashMap<String, User>,
    pub users_by_username: HashMap<String, String>,
    pub sessions: HashMap<String, String>, // token -> user_id
    pub children: HashMap<String, Child>,
    pub children_by_user: HashMap<String, Vec<String>>,
}

pub struct AppState {
    pub data: RwLock<PersistentData>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn new() -> SharedState {
        let loaded = Self::load_from_disk();
        let state = Self {
            data: RwLock::new(loaded),
        };
        Arc::new(state)
    }

    fn load_from_disk() -> PersistentData {
        if Path::new(DB_FILE_PATH).exists() {
            if let Ok(content) = fs::read_to_string(DB_FILE_PATH) {
                if let Ok(data) = serde_json::from_str::<PersistentData>(&content) {
                    println!("📂 База данных успешно загружена из {}", DB_FILE_PATH);
                    return data;
                }
            }
        }

        println!("✨ Создана новая база данных с демонстрационными данными");
        Self::create_seed_data()
    }

    pub fn save_to_disk(data: &PersistentData) {
        if let Ok(json) = serde_json::to_string_pretty(data) {
            let _ = fs::write(DB_FILE_PATH, json);
        }
    }

    fn create_seed_data() -> PersistentData {
        let mut data = PersistentData::default();

        let demo_user_id = Uuid::new_v4().to_string();
        let demo_user = User {
            id: demo_user_id.clone(),
            username: "demo".to_string(),
            name: "Родитель (Демо)".to_string(),
            password_hash: hash_password("demo123"),
            theme: "dark".to_string(),
            created_at: Utc::now().to_rfc3339(),
        };

        let child1_id = Uuid::new_v4().to_string();
        let child1 = Child {
            id: child1_id.clone(),
            user_id: demo_user_id.clone(),
            name: "Лев".to_string(),
            age: 8,
            weight: 26.0,
            episode: "Кашель, 4-й день".to_string(),
            points48h: vec![
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.4,
                    drink: Some("150 мл".to_string()),
                    med: Some("Ибупрофен 10 мл".to_string()),
                    note: "Вечерний подъём температуры, сухой кашель".to_string(),
                    hours_ago: 40.0,
                    timestamp: "40 ч назад".to_string(),
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 37.8,
                    drink: Some("200 мл".to_string()),
                    med: None,
                    note: "Спал спокойно после жаропонижающего".to_string(),
                    hours_ago: 30.0,
                    timestamp: "30 ч назад".to_string(),
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.6,
                    drink: Some("100 мл".to_string()),
                    med: None,
                    note: "Приступы кашля днём, слабость".to_string(),
                    hours_ago: 21.0,
                    timestamp: "21 ч назад".to_string(),
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 39.1,
                    drink: Some("120 мл".to_string()),
                    med: Some("Ибупрофен 10 мл".to_string()),
                    note: "Ночной пик 39.1 °C, дан Ибупрофен 10 мл".to_string(),
                    hours_ago: 12.0,
                    timestamp: "12 ч назад".to_string(),
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.2,
                    drink: Some("150 мл".to_string()),
                    med: None,
                    note: "Температура снизилась, отдыхает".to_string(),
                    hours_ago: 8.0,
                    timestamp: "8 ч назад".to_string(),
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.2,
                    drink: Some("180 мл".to_string()),
                    med: None,
                    note: "Утренний замер, сохраняется кашель".to_string(),
                    hours_ago: 3.0,
                    timestamp: "3 ч назад".to_string(),
                },
            ],
            reminders: vec![
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Ибупрофен 10 мл (при t > 38.5 °C)".to_string(),
                    time: "Каждые 6–8 часов".to_string(),
                    done: true,
                },
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Теплое питье / регидрон (150 мл)".to_string(),
                    time: "Каждые 2 часа".to_string(),
                    done: false,
                },
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Визит педиатра с QR-отчётом".to_string(),
                    time: "Сегодня в 16:30".to_string(),
                    done: false,
                },
            ],
            created_at: Utc::now().to_rfc3339(),
        };

        let child2_id = Uuid::new_v4().to_string();
        let child2 = Child {
            id: child2_id.clone(),
            user_id: demo_user_id.clone(),
            name: "София".to_string(),
            age: 4,
            weight: 16.0,
            episode: "Температура, 2-й день".to_string(),
            points48h: vec![
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 37.5,
                    drink: Some("120 мл".to_string()),
                    med: None,
                    note: "Усталость после садика".to_string(),
                    hours_ago: 36.0,
                    timestamp: "36 ч назад".to_string(),
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 38.4,
                    drink: Some("100 мл".to_string()),
                    med: Some("Парацетамол 5 мл".to_string()),
                    note: "Ночная температура, дан Парацетамол".to_string(),
                    hours_ago: 24.0,
                    timestamp: "24 ч назад".to_string(),
                },
                DiaryEntry {
                    id: Uuid::new_v4().to_string(),
                    temp: 37.7,
                    drink: Some("150 мл".to_string()),
                    med: None,
                    note: "Спокойно играет".to_string(),
                    hours_ago: 1.0,
                    timestamp: "1 ч назад".to_string(),
                },
            ],
            reminders: vec![
                Reminder {
                    id: Uuid::new_v4().to_string(),
                    title: "Парацетамол 5 мл (по необходимости)".to_string(),
                    time: "Не чаще чем раз в 6 часов".to_string(),
                    done: true,
                },
            ],
            created_at: Utc::now().to_rfc3339(),
        };

        data.users.insert(demo_user_id.clone(), demo_user);
        data.users_by_username.insert("demo".to_string(), demo_user_id.clone());
        data.children.insert(child1_id.clone(), child1);
        data.children.insert(child2_id.clone(), child2);
        data.children_by_user.insert(demo_user_id.clone(), vec![child1_id, child2_id]);

        Self::save_to_disk(&data);
        data
    }
}
