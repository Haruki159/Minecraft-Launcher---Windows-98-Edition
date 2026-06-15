use std::process::Command;
use std::path::PathBuf;
use mc_launcher_core::prelude::*;

// Вспомогательная функция для определения нужной версии Java под версию Minecraft
fn get_java_version(mc_version: &str) -> u8 {
    let parts: Vec<&str> = mc_version.split('.').collect();
    if parts.len() >= 2 {
        if parts[0] == "1" {
            if let Ok(minor) = parts[1].parse::<u32>() {
                // Все версии начиная с 1.21 (и 1.20.5+) требуют Java 21
                if minor >= 21 {
                    return 21;
                }
                if minor == 20 && parts.len() >= 3 {
                    if let Ok(patch) = parts[2].parse::<u32>() {
                        if patch >= 5 {
                            return 21; 
                        }
                    }
                }
                // Версии от 1.17 до 1.20.4 требуют Java 17
                if minor >= 17 {
                    return 17;
                }
            }
        }
    }
    // Всё, что старше 1.17 (1.16.5, 1.12.2, 1.7.10 и т.д.), запускаем на Java 8
    8
}

#[tauri::command]
async fn launch_game(
    username: String,
    version: String,
    ram_gb: u32,
    width: u32,
    height: u32,
) -> std::result::Result<(), String> {
    let java_major_version = get_java_version(&version);

    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Не удалось получить текущую директорию: {}", e))?;

    let java_dir = current_dir.join("java");

    // Скачиваем/проверяем Java
    let java_bin_path = lighty_java::jre_downloader::jre_download(
        &java_dir,
        &lighty_java::JavaDistribution::Temurin,
        &java_major_version,
        |_, _| {} 
    )
    .await
    .map_err(|e| format!("Не удалось подготовить Java {}: {}", java_major_version, e))?;

    let launch_result = tauri::async_runtime::spawn_blocking(move || {
        let mc_dir = current_dir.join(".minecraft");
        let launcher = Launcher::new(mc_dir);

        let install = launcher.install(InstallRequest {
            minecraft_version: version.clone(),
            loader: None, 
            java: JavaInstallPolicy::Auto,
        }).map_err(|e| format!("Ошибка при подготовке файлов игры: {}", e))?;

        let version_json = launcher.load_version(&install.version_id)
            .map_err(|e| format!("Ошибка загрузки метаданных версии: {}", e))?;

        // Строим команду запуска, передавая кастомное разрешение
        let mut command = launcher.build_launch_command_from_version(
            &version_json,
            LaunchOptions {
                account: Account::offline(&username),
                java_executable: Some(java_bin_path),
                // Подставляем разрешение экрана из настроек
                custom_resolution: Some((width, height)),
                ..Default::default()
            },
        ).map_err(|e| format!("Ошибка генерации аргументов запуска: {}", e))?;

        // Очищаем любые старые аргументы памяти, чтобы они не конфликтовали
        command.args.retain(|arg| !arg.starts_with("-Xmx") && !arg.starts_with("-Xms"));
        
        // Добавляем наши выбранные в настройках лаунчера параметры памяти в самое начало JVM
        command.args.insert(0, format!("-Xmx{}G", ram_gb));
        command.args.insert(1, "-Xms512M".to_string()); // Стартовый объем (512 МБ)

        // Запускаем процесс Java
        Command::new(&command.executable)
            .args(&command.args)
            .current_dir(&command.working_dir)
            .spawn()
            .map_err(|e| format!("Не удалось запустить процесс Java: {}", e))?;

        Ok(())
    })
    .await
    .map_err(|e| format!("Аварийное завершение фонового потока: {}", e))?;

    launch_result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![launch_game])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}