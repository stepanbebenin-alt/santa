mod auth;
mod handlers;
mod models;
mod state;

use axum::{
    response::Html,
    routing::{delete, get, post, put},
    Router,
};
use state::AppState;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

// Встраиваем HTML внутрь бинарника, чтобы приложение работало автономно в один .exe файл!
const EMBEDDED_INDEX_HTML: &str = include_str!("../static/index.html");

async fn serve_index() -> Html<&'static str> {
    Html(EMBEDDED_INDEX_HTML)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState::new();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_routes = Router::new()
        // Аутентификация и профиль
        .route("/register", post(handlers::register))
        .route("/login", post(handlers::login))
        .route("/logout", post(handlers::logout))
        .route("/me", get(handlers::get_me))
        .route("/user/theme", put(handlers::update_theme))
        // Дети
        .route("/children", post(handlers::create_child))
        .route("/children/:id", delete(handlers::delete_child))
        // Записи дневника
        .route("/children/:id/entries", post(handlers::add_diary_entry))
        .route(
            "/children/:id/entries/:entry_id",
            delete(handlers::delete_diary_entry),
        )
        // Напоминания о лекарствах
        .route("/children/:id/reminders", post(handlers::add_reminder))
        .route(
            "/children/:id/reminders/:reminder_id/toggle",
            put(handlers::toggle_reminder),
        )
        .route(
            "/children/:id/reminders/:reminder_id",
            delete(handlers::delete_reminder),
        );

    let app = Router::new()
        .nest("/api", api_routes)
        .route("/", get(serve_index))
        .fallback(serve_index)
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("==========================================================");
    println!("🏥  PediaSense — Клинический дневник болезни (Rust & Axum)");
    println!("==========================================================");
    println!("⚡ Сервер успешно запущен!");
    println!("👉 Откройте в браузере: http://localhost:{}", port);
    println!("📱 В локальной сети:    http://127.0.0.1:{}", port);
    println!("==========================================================");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Не удалось запустить сервер на указанном порту");

    axum::serve(listener, app).await.unwrap();
}
