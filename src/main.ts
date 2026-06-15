import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const appWindow = getCurrentWindow();

// Вспомогательная функция для инициализации и загрузки настроек
function initSettings() {
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  const ramSelect = document.getElementById("settings-ram") as HTMLSelectElement;
  const widthInput = document.getElementById("settings-width") as HTMLInputElement;
  const heightInput = document.getElementById("settings-height") as HTMLInputElement;

  // Загружаем сохраненный никнейм
  usernameInput.value = localStorage.getItem("username") || "Player";

  // Настройки RAM (по умолчанию 2 ГБ)
  ramSelect.value = localStorage.getItem("ram") || "2";

  // Настройки экрана (по умолчанию 854х480)
  widthInput.value = localStorage.getItem("width") || "854";
  heightInput.value = localStorage.getItem("height") || "480";
}

// Загрузка версий Minecraft
async function loadVersions() {
  const versionSelect = document.getElementById("version-select") as HTMLSelectElement;
  const statusText = document.getElementById("status-text") as HTMLParagraphElement;
  const launchBtn = document.getElementById("btn-launch") as HTMLButtonElement;

  try {
    statusText.textContent = "Статус: Получение списка версий...";
    launchBtn.disabled = true;

    const response = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);
    const data = await response.json();

    versionSelect.innerHTML = "";
    const releases = data.versions.filter((v: any) => v.type === "release");

    releases.forEach((v: any) => {
      const option = document.createElement("option");
      option.value = v.id;
      option.textContent = v.id;
      versionSelect.appendChild(option);
    });

    statusText.textContent = "Статус: Готов к запуску";
    launchBtn.disabled = false;
  } catch (err) {
    statusText.textContent = "Ошибка: не удалось загрузить список версий";
    console.error(err);
    versionSelect.innerHTML = `
      <option value="1.20.4">1.20.4 (Локально)</option>
      <option value="1.16.5">1.16.5 (Локально)</option>
      <option value="1.12.2">1.12.2 (Локально)</option>
      <option value="1.7.10">1.7.10 (Локально)</option>
    `;
    launchBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Подгружаем списки и инициализируем сохраненные настройки
  loadVersions();
  initSettings();

  // Элементы главного окна
  const minimizeBtn = document.getElementById("btn-minimize");
  const closeBtn = document.getElementById("btn-close");
  const launchBtn = document.getElementById("btn-launch") as HTMLButtonElement;
  const settingsBtn = document.getElementById("btn-settings") as HTMLButtonElement;
  const usernameInput = document.getElementById("username") as HTMLInputElement;
  const versionSelect = document.getElementById("version-select") as HTMLSelectElement;
  const statusText = document.getElementById("status-text") as HTMLParagraphElement;

  // Элементы окна настроек
  const settingsWindow = document.getElementById("settings-window") as HTMLDivElement;
  const settingsClose = document.getElementById("settings-close") as HTMLButtonElement;
  const settingsOk = document.getElementById("settings-ok") as HTMLButtonElement;
  const settingsCancel = document.getElementById("settings-cancel") as HTMLButtonElement;
  const ramSelect = document.getElementById("settings-ram") as HTMLSelectElement;
  const widthInput = document.getElementById("settings-width") as HTMLInputElement;
  const heightInput = document.getElementById("settings-height") as HTMLInputElement;

  // Закрытие и сворачивание главного окна
  minimizeBtn?.addEventListener("click", () => appWindow.minimize());
  closeBtn?.addEventListener("click", () => appWindow.close());

  // === ЛОГИКА ОКНА НАСТРОЕК ===

  // Открытие окна настроек
  settingsBtn.addEventListener("click", () => {
    // Подгружаем актуальные сохраненные настройки перед показом окна
    initSettings();
    settingsWindow.style.display = "block";
  });

  // Закрытие без сохранения (кнопка крестик или Отмена)
  const closeSettingsWithoutSaving = () => {
    settingsWindow.style.display = "none";
  };
  settingsClose.addEventListener("click", closeSettingsWithoutSaving);
  settingsCancel.addEventListener("click", closeSettingsWithoutSaving);

  // Закрытие с сохранением (кнопка ОК)
  settingsOk.addEventListener("click", () => {
    // Сохраняем значения в локальное хранилище
    localStorage.setItem("ram", ramSelect.value);
    localStorage.setItem("width", widthInput.value);
    localStorage.setItem("height", heightInput.value);
    
    settingsWindow.style.display = "none";
  });

  // === ЗАПУСК ИГРЫ ===
  launchBtn?.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const version = versionSelect.value;

    if (!username) {
      statusText.textContent = "Статус: Ошибка! Введите никнейм";
      usernameInput.style.borderColor = "red";
      return;
    }
    usernameInput.style.borderColor = "";

    // Сохраняем введенный никнейм, чтобы не писать его при следующем запуске
    localStorage.setItem("username", username);

    // Считываем сохраненные настройки ОЗУ и Разрешения (или дефолты)
    const ramGb = parseInt(localStorage.getItem("ram") || "2");
    const width = parseInt(localStorage.getItem("width") || "854");
    const height = parseInt(localStorage.getItem("height") || "480");

    // Блокируем форму
    launchBtn.disabled = true;
    usernameInput.disabled = true;
    versionSelect.disabled = true;
    settingsBtn.disabled = true;
    
    launchBtn.textContent = "Скачивание...";
    statusText.textContent = `Статус: Подготовка версии ${version}...`;

    try {
      // Передаем все параметры (включая настройки RAM и экрана) в Rust
      await invoke("launch_game", { 
        username, 
        version, 
        ramGb, 
        width, 
        height 
      });
      statusText.textContent = "Статус: Игра успешно запущена!";
    } catch (error) {
      statusText.textContent = `Ошибка: ${error}`;
      console.error(error);
    } finally {
      // Разблокируем форму
      launchBtn.disabled = false;
      usernameInput.disabled = false;
      versionSelect.disabled = false;
      settingsBtn.disabled = false;
      launchBtn.textContent = "Запуск игры";
    }
  });
});