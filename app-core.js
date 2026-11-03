
function isSpecialAgentRole(role) {
  const r = (role || (window.state && window.state.userRole) || '').trim();
  return r === 'Спецагент Санты' || r === 'Агент';
}
window.isSpecialAgentRole = isSpecialAgentRole;

// ============================================================================
// PWA STANDALONE & NATIVE FULLSCREEN APP ENGINE (WITHOUT BROWSER SEARCH BAR)
// ============================================================================
let deferredPwaInstallPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPwaInstallPrompt = e;
    const androidBox = document.getElementById('androidPwaBox');
    if (androidBox) androidBox.classList.remove('hidden');
  });
}

window.isAppStandalone = function () {
  return (
    (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true) ||
    (typeof window !== 'undefined' && window.matchMedia && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches
    )) ||
    (typeof window !== 'undefined' && window.location && window.location.search.includes('standalone=true'))
  );
};

window.checkPwaInstallState = function () {
  const isStandalone = window.isAppStandalone();
  const banner = document.getElementById('pwaHomeBanner');
  const pwaBtn = document.getElementById('pwaHeaderBtn');
  const dismissed = localStorage.getItem('santa_pwa_banner_dismissed') === 'true';

  if (isStandalone) {
    if (banner) banner.classList.add('hidden');
    if (pwaBtn) pwaBtn.classList.add('hidden');
  } else {
    if (pwaBtn) pwaBtn.classList.remove('hidden');
    if (banner && !dismissed) {
      banner.classList.remove('hidden');
    }
  }
};

window.openPwaInstallModal = function () {
  const modal = document.getElementById('pwaInstallModal');
  if (modal) modal.classList.remove('hidden');
};

window.closePwaInstallModal = function () {
  if (typeof window.smoothCloseModal === 'function') {
    window.smoothCloseModal('pwaInstallModal');
  } else {
    const modal = document.getElementById('pwaInstallModal');
    if (modal) modal.classList.add('hidden');
  }
};

window.dismissPwaBanner = function () {
  const banner = document.getElementById('pwaHomeBanner');
  if (banner) banner.classList.add('hidden');
  try {
    localStorage.setItem('santa_pwa_banner_dismissed', 'true');
  } catch (e) {}
};

window.triggerAndroidPwaInstall = async function () {
  if (deferredPwaInstallPrompt) {
    deferredPwaInstallPrompt.prompt();
    const { outcome } = await deferredPwaInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      window.dismissPwaBanner();
      window.closePwaInstallModal();
      if (typeof window.showToast === 'function') {
        window.showToast('Установка начата', 'Приложение добавляется на ваш рабочий стол!', 'success');
      }
    }
    deferredPwaInstallPrompt = null;
  } else {
    if (typeof window.showToast === 'function') {
      window.showToast(
        'Установка в Chrome',
        'Нажмите меню ⋮ в браузере -> «Установить приложение» / «Добавить на главный экран»',
        'info'
      );
    }
  }
};

window.toggleBrowserFullscreen = function () {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      if (typeof window.showToast === 'function') {
        window.showToast(
          'Полноэкранный режим',
          'На iPhone: нажмите «Поделиться» ➔ «На экран \"Домой\"» для запуска без строки поиска!',
          'info'
        );
      }
    });
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
  window.closePwaInstallModal();
};


// ============================================================================
// OFFLINE QUEUE & AUTO-SYNC ENGINE (FOR STORE BASEMENTS & COLD STORAGE)
// ============================================================================
const SANTA_OFFLINE_QUEUE_KEY = 'santa_offline_signals_queue';

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(SANTA_OFFLINE_QUEUE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(q) {
  try {
    localStorage.setItem(SANTA_OFFLINE_QUEUE_KEY, JSON.stringify(q));
  } catch (e) {
    console.warn('LocalStorage quota exceeded for offline queue');
  }
}

window.enqueueOfflineReport = function (reportEntry, missionSync) {
  const q = getOfflineQueue();
  q.push({
    id: reportEntry.id,
    timestamp: Date.now(),
    report: reportEntry,
    missionSync: missionSync
  });
  saveOfflineQueue(q);
  window.updateOfflineSyncUI();
};

window.syncOfflineQueue = async function () {
  if (!navigator.onLine) return;
  const q = getOfflineQueue();
  if (q.length === 0) return;

  const total = q.length;
  let synced = 0;
  const remaining = [];

  for (const item of q) {
    try {
      await window.syncWithServer({ newReport: item.report, missionUpdate: item.missionSync });
      synced++;
    } catch (e) {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  window.updateOfflineSyncUI();

  if (synced > 0) {
    if (typeof window.playSound === 'function') window.playSound('success');
    if (typeof window.showToast === 'function') {
      window.showToast(
        'Связь восстановлена! 📶',
        `Синхронизировано ${synced} из ${total} офлайн-сигналов с начислением баллов!`,
        'success'
      );
    }
  }
};

window.updateOfflineSyncUI = function () {
  const offlineBar = document.getElementById('offlineStatusBar');
  const offlineText = document.getElementById('offlineStatusText');
  if (!offlineBar) return;
  const q = getOfflineQueue();

  if (!navigator.onLine) {
    offlineBar.classList.remove('hidden');
    if (offlineText) {
      offlineText.textContent = q.length > 0
        ? `Вы не в сети • Сохранено ${q.length} сигналов офлайн (отправятся при сети)`
        : 'Вы не в сети • Приложение работает в автономном режиме';
    }
  } else if (q.length > 0) {
    offlineBar.classList.remove('hidden');
    if (offlineText) {
      offlineText.textContent = `Синхронизация ${q.length} сохранённых сигналов...`;
    }
    window.syncOfflineQueue();
  } else {
    offlineBar.classList.add('hidden');
  }
};

window.addEventListener('online', () => {
  if (typeof window.updateOfflineSyncUI === 'function') window.updateOfflineSyncUI();
  if (typeof window.checkPwaInstallState === 'function') window.checkPwaInstallState();
  if (typeof window.syncOfflineQueue === 'function') window.syncOfflineQueue();
});
window.addEventListener('offline', () => {
  if (typeof window.updateOfflineSyncUI === 'function') window.updateOfflineSyncUI();
});

// ============================================================================
// GLOBAL SEARCH ACROSS ALL 5 BRANDS
// ============================================================================
window.handleGlobalChecklistSearch = function () {
  const inputEl = document.getElementById('globalChecklistSearchInput');
  const clearBtn = document.getElementById('clearGlobalSearchBtn');
  const container = document.getElementById('globalSearchResultsContainer');
  const brandsGrid = document.getElementById('brandTabsGrid');
  if (!inputEl || !container) return;

  const q = inputEl.value.trim().toLowerCase();
  if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);

  if (!q) {
    container.classList.add('hidden');
    container.innerHTML = '';
    if (brandsGrid) brandsGrid.classList.remove('hidden');
    return;
  }

  if (brandsGrid) brandsGrid.classList.add('hidden');
  container.classList.remove('hidden');

  const matches = [];
  Object.entries(window.BRAND_CONFIG || {}).forEach(([bKey, cfg]) => {
    cfg.categories.forEach(cat => {
      cat.items.forEach(item => {
        if (item.label.toLowerCase().includes(q) || cat.title.toLowerCase().includes(q)) {
          matches.push({
            brandKey: bKey,
            brandName: cfg.name,
            brandHex: cfg.headerBg,
            categoryTitle: cat.title,
            item
          });
        }
      });
    });
  });

  const escapeHtml = str => String(str || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

  if (matches.length === 0) {
    container.innerHTML = `
      <div class="bg-white p-6 rounded-[24px] text-center shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-2 border border-slate-100">
        <div class="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-base">
          <i class="fa-solid fa-magnifying-glass"></i>
        </div>
        <div class="text-xs font-bold text-slate-700">Ничего не найдено по запросу «${escapeHtml(q)}»</div>
        <div class="text-[11px] text-slate-400">Попробуйте ввести: сыр, касса, ценник, рыба, хлеб, чек...</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="px-1 flex items-center justify-between text-[11px] font-bold text-slate-400">
      <span>Найдено ${matches.length} ${matches.length === 1 ? 'проблема' : 'проблем'}:</span>
      <button onclick="clearGlobalSearch()" class="text-[#009FE3] hover:underline font-extrabold">Сбросить</button>
    </div>
    <div class="space-y-1.5">
      ${matches.slice(0, 25).map(m => `
        <button onclick="openIssueReportModal('${m.brandKey}', '${m.item.id}')" class="w-full bg-white p-3 rounded-[20px] shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md transition active:scale-[0.99] flex items-center justify-between gap-3 text-left border border-slate-100 group">
          <div class="flex items-center gap-2.5 overflow-hidden">
            <span class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] shadow-xs" style="background-color: ${m.item.critical ? '#E11D48' : m.brandHex};">
              <i class="fa-solid ${m.item.critical ? 'fa-bolt' : m.item.isOther ? 'fa-pen' : 'fa-camera'}"></i>
            </span>
            <div class="overflow-hidden">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="px-2 py-0.2 rounded-md text-[9px] font-black text-white shrink-0" style="background-color: ${m.brandHex};">${m.brandName}</span>
                <span class="text-[10px] font-bold text-slate-400 truncate">${m.categoryTitle}</span>
              </div>
              <div class="text-xs font-bold text-slate-800 group-hover:text-[#009FE3] transition-colors leading-snug mt-0.5 line-clamp-2">
                ${escapeHtml(m.item.label)}
              </div>
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-full font-black text-[10px] text-white shadow-xs" style="background-color: ${m.item.critical ? '#E11D48' : m.brandHex};">
              +${m.item.points}
            </span>
            <i class="fa-solid fa-chevron-right text-slate-300 text-[10px] group-hover:text-slate-600 transition-colors"></i>
          </div>
        </button>
      `).join('')}
    </div>
  `;
};

window.clearGlobalSearch = function () {
  const inputEl = document.getElementById('globalChecklistSearchInput');
  if (inputEl) inputEl.value = '';
  window.handleGlobalChecklistSearch();
};

// ============================================================================
// EXPRESS 1-TAP SIGNAL HANDLER
// ============================================================================
function openExpressReportModal(brandKey) {
  const activeKey = brandKey || (window.state && window.state.activeBrand) || 'santa';
  const cfg = (window.BRAND_CONFIG && window.BRAND_CONFIG[activeKey]) || (window.BRAND_CONFIG && window.BRAND_CONFIG.santa) || { name: 'Санта Ритейл' };

  window.currentModalPayload = {
    type: 'claim',
    typeLabel: 'Экспресс-сигнал (+1 б.)',
    critical: false,
    brandName: cfg.name || 'Санта Ритейл',
    categoryTitle: 'Экспресс-контроль витрины',
    title: 'Экспресс-сигнал: оперативный контроль торговой точки',
    points: 1,
    hint: 'Сфотографируйте нарушение, полку или витрину — ИИ проверит снимок и зафиксирует экспресс-сигнал.',
    voiceSample: 'Экспресс-проверка: зафиксировано оперативное замечание в торговом зале.'
  };

  showReportModalUI();

  const commentInput = document.getElementById('reportCommentInput');
  if (commentInput && !commentInput.value.trim()) {
    commentInput.value = 'Экспресс-контроль витрины и зала';
  }

  const expressBanner = document.getElementById('expressSignalBanner');
  if (expressBanner) expressBanner.classList.remove('hidden');
  const expressText = document.getElementById('expressDetectedBrandText');
  if (expressText) expressText.textContent = cfg.name || 'Санта Ритейл';

  if (typeof showToast === 'function') {
    showToast('⚡ Экспресс-сигнал', 'Сделайте снимок — ИИ проверит витрину и зафиксирует сигнал.', 'info');
  }
}

function submitExpressReport() {
  const reportModal = document.getElementById('reportModal');
  const isModalOpen = reportModal && !reportModal.classList.contains('hidden');

  if (!isModalOpen || !window.currentModalPayload) {
    openExpressReportModal();
    return;
  }

  const commentInput = document.getElementById('reportCommentInput');
  if (commentInput && !commentInput.value.trim()) {
    const payload = window.currentModalPayload;
    commentInput.value = (payload && payload.title) ? `Экспресс: ${payload.title}` : 'Экспресс-контроль: витрина подтверждена по фото';
  }

  // Если живая камера работает, но снимок еще не сделан — автоматически захватываем кадр
  const videoEl = document.getElementById('reportLiveVideo');
  if (!window.mediaCaptured && window.reportMediaStream && videoEl && videoEl.readyState >= 2) {
    if (typeof triggerInAppCapture === 'function') {
      triggerInAppCapture();
    }
  }

  if (typeof window.autoTriggerAiAnalysis === 'function') {
    window.autoTriggerAiAnalysis(0);
  }
  setTimeout(() => {
    window.submitReport(false);
  }, 120);
}

window.openExpressReportModal = openExpressReportModal;
window.submitExpressReport = submitExpressReport;

window.toggleClaimBrandDropdown = function (forceState) {
  const tabs = document.getElementById('claimModalBrandTabs');
  if (!tabs) return;
  if (typeof forceState === 'boolean') {
    tabs.classList.toggle('hidden', !forceState);
  } else {
    tabs.classList.toggle('hidden');
  }
};

// ============================================================================
// МОДУЛЬ 3: ЯДРО ПРИЛОЖЕНИЯ (ЧИСТЫЙ СТАРТ С НУЛЯ: 0 БАЛЛОВ, 0 КРАСНЫХ ЛИСТОВ,
//           0 ЧУЖИХ РЕЙТИНГОВ), УПРАВЛЕНИЕ КРАСНЫМИ ЛИСТАМИ, МИССИЯМИ,
//           РЕЙТИНГОМ И СИНХРОНИЗАЦИЯ МЕЖДУ ТЕЛЕФОНАМИ (ПОЛЬЗОВАТЕЛЬ + ДИРЕКТОР)
// ============================================================================

const STORAGE_KEY = 'santa_radar_v3_zero_state';

// Удаляем старый кэш прошлых версий, где были вписаны 41 балл и демо-данные
try {
  localStorage.removeItem('santa_radar_v2_clean_state');
} catch (e) {}

function createZeroDefaultState() {
  return {
    userId: 'u_' + Math.random().toString(36).slice(2, 10),
    appTitleMode: 'Скажи Санте', // Можно переключать между «Скажи Санте» и «Санта.Радар»
    onboarded: false,
    userName: '',
    userPhone: '',
    userEmail: '',
    userPassword: '',
    faceIdEnabled: false,
    userDivision: '',
    favoriteStore: '',
    currentStoreName: '',
    userRole: '',
    lastGpsLat: 53.9022,
    lastGpsLng: 27.5501,
    activeBrand: 'santa',
    activeTab: 'home',
    missionFilter: 'all',
    // НАСТРОЙКИ ИНТЕРФЕЙСА, ТЕМЫ И КАМЕРЫ:
    theme: 'light',
    largeTextMode: false,
    soundEnabled: true,
    vibrationEnabled: true,
    watermarkEnabled: true,
    defaultCameraFacing: 'environment',
    // ВСЕ ДАННЫЕ ПОСЛЕ ВХОДА С НУЛЯ:
    points: 0,
    hardMissionsDone: 0,
    falseStrikes: 0,
    legitStreak: 0,
    dailyStoreReports: 0,
    missionsBanned: false,
    claimTariffCut: false,
    accountQuarantined: false,
    openCategoryIndex: 0,
    favMissionStatus: 'available',
    missions: JSON.parse(JSON.stringify(window.CLEAN_DEFAULT_MISSIONS || [])),
    stopList: [],       // 0 красных листов при старте!
    participants: {},   // 0 предзаполненных чужих людей в рейтинге!
    history: [],        // 0 отчетов при старте!
    customStores: []
  };
}

window.state = loadState();
window.currentModalPayload = null;
window.activeRecallContext = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = Object.assign(createZeroDefaultState(), parsed);
      // Обновляем устаревшее название «Хардкорная миссия» -> «Сложная миссия» и обогащаем деталями из CLEAN_DEFAULT_MISSIONS
      if (Array.isArray(merged.missions)) {
        const defaultsMap = {};
        (window.CLEAN_DEFAULT_MISSIONS || []).forEach(dm => { defaultsMap[dm.id] = dm; });
        merged.missions.forEach(m => {
          if (m.diffLabel && m.diffLabel.includes('Хардкор')) {
            m.diffLabel = '🔴 Сложная миссия';
          }
          const def = defaultsMap[m.id];
          if (def) {
            m.title = def.title;
            m.description = def.description;
            m.duration = def.duration;
            m.photoGuide = def.photoGuide;
            m.tasks = def.tasks;
          }
        });
        (window.CLEAN_DEFAULT_MISSIONS || []).forEach(dm => {
          if (!merged.missions.some(x => x.id === dm.id)) {
            merged.missions.push(JSON.parse(JSON.stringify(dm)));
          }
        });
      }
      return merged;
    }
  } catch (e) {}
  return createZeroDefaultState();
}

// Универсальный определитель фирменного цвета бренда Холдинга Санта
window.getBrandHexByName = function (name) {
  const s = String(name || '').toLowerCase();
  if (s.includes('бремор') || s === 'bremor') return '#003865';
  if (s.includes('савушкин') || s === 'savushkin') return '#008A3C';
  if (s.includes('рест') || s === 'rest') return '#B24A32';
  if (s.includes('отел') || s.includes('эрмитаж') || s === 'hotels') return '#6A1A24';
  return '#009FE3'; // Санта Ритейл по умолчанию
};

// Отрисовка фирменных цветных бейджей бренда (поддерживает составные бренды через + или /)
window.renderBrandColoredBadges = function (brandStr) {
  const parts = String(brandStr || 'Санта Ритейл').split(/[+/]/).map(x => x.trim()).filter(Boolean);
  return parts.map(part => {
    const hex = window.getBrandHexByName(part);
    return `<span style="background-color: ${hex}; color: #ffffff;" class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold inline-flex items-center shadow-sm">${part}</span>`;
  }).join(' ');
};

function saveState() {
  try {
    if (window.state.onboarded && window.state.userName) {
      window.state.participants[window.state.userId] = {
        id: window.state.userId,
        name: window.state.userName,
        division: window.state.userDivision || 'Холдинг Санта',
        role: window.state.userRole || 'Наблюдатель',
        favoriteStore: window.state.favoriteStore || '',
        points: window.state.points,
        strikes: window.state.falseStrikes,
        hardMissions: window.state.hardMissionsDone || 0,
        updatedAt: Date.now()
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(window.state));
  } catch (e) {}
}
window.saveState = saveState;

// Легкое окно сброса в 0 (без принудительного выброса на тяжелую анкету)
window.resetToCleanOnboarding = function () {
  const modal = document.getElementById('lightResetModal');
  if (modal) {
    modal.classList.remove('hidden');
  } else {
    window.confirmQuickZeroReset(false);
  }
};

function closeLightResetModal() {
  window.smoothCloseModal('lightResetModal');
};

window.confirmQuickZeroReset = function (openProfileAfter) {
  closeLightResetModal();
  const prevName = window.state.userName || 'Сотрудник';
  const prevPhone = window.state.userPhone || '';
  const prevEmail = window.state.userEmail || '';
  const prevPass = window.state.userPassword || '';
  const prevDiv = window.state.userDivision || 'Санта Ритейл';
  const prevRole = window.state.userRole || 'Наблюдатель';
  const prevStore = window.state.favoriteStore || window.state.currentStoreName || 'Санта • Минск, пр. Победителей, 65';
  const prevSettings = window.state.settings ? { ...window.state.settings } : undefined;

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('santa_radar_v2_clean_state');
  } catch (e) {}

  window.state = createZeroDefaultState();
  if (prevSettings) window.state.settings = prevSettings;

  if (!openProfileAfter) {
    // Оставляем текущий профиль и пароль активными, обнуляя все баллы, историю, миссии и красные листы
    window.state.onboarded = true;
    window.state.userName = prevName;
    window.state.userPhone = prevPhone;
    window.state.userEmail = prevEmail;
    window.state.userPassword = prevPass;
    window.state.userDivision = prevDiv;
    window.state.userRole = prevRole;
    window.state.favoriteStore = prevStore;
    window.state.currentStoreName = prevStore;
  } else {
    // Полный сброс профиля и пароля для новой регистрации
    window.state.onboarded = false;
    window.state.userPassword = '';
    window.isSessionAuthenticated = false;
  }

  saveState();

  if (mqttClient && mqttClient.connected) {
    try {
      mqttClient.publish(MQTT_TOPIC, JSON.stringify({
        senderId: window.state.userId,
        resetTimestamp: Date.now(),
        participants: window.state.participants || {},
        stopList: [],
        customStores: [],
        customMissions: [],
        missionLocks: {}
      }), { qos: 0, retain: true });
    } catch (e) {}
  }

  syncWithServer({ action: 'reset_all' });
  closeRecallBanner();
  closeStoreSwitcherModal();
  selectBrand('santa');
  switchMainTab('home');
  updateAllUI();
  playSound('success');

  if (openProfileAfter) {
    openOnboardingModal();
  } else {
    showToast('Сброшено до 0', 'Баллы, история, миссии и Красные листы обнулены.', 'success');
  }
};

// --- ПОЛНОЕ БЕЗВОЗВРАТНОЕ УДАЛЕНИЕ ПРОФИЛЯ СОТРУДНИКА ---
window.openDeleteProfileModal = function () {
  const modal = document.getElementById('deleteProfileConfirmModal');
  const labelEl = document.getElementById('deleteProfileTargetLabel');
  if (labelEl) {
    const nm = window.state.userName || 'Текущий профиль';
    const sub = window.state.userPhone || window.state.userEmail || window.state.userDivision || 'На этом устройстве';
    labelEl.textContent = `${nm} (${sub})`;
  }
  if (modal) {
    modal.classList.remove('hidden');
  }
};

function closeDeleteProfileModal() {
  window.smoothCloseModal('deleteProfileConfirmModal');
};

window.confirmDeleteUserProfileCompletely = function () {
  closeDeleteProfileModal();
  closeLightResetModal();

  const deletedUserId = window.state.userId;
  const remainingParticipants = { ...(window.state.participants || {}) };
  if (deletedUserId && remainingParticipants[deletedUserId]) {
    delete remainingParticipants[deletedUserId];
  }

  // Полная очистка всех ключей хранилища
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('santa_radar_v2_clean_state');
  } catch (e) {}

  // Создаем абсолютно чистый профиль с новым ID и пустыми персональными данными
  window.state = createZeroDefaultState();
  window.state.participants = remainingParticipants;
  window.state.onboarded = false;
  window.state.userName = '';
  window.state.userPhone = '';
  window.state.userEmail = '';
  window.state.userPassword = '';
  window.state.faceIdEnabled = false;
  window.isSessionAuthenticated = false;
  window.isEditingProfileMode = false;

  saveState();

  // Оповещаем облачный канал MQTT и локальный сервер об удалении участника из рейтинга
  if (mqttClient && mqttClient.connected) {
    try {
      mqttClient.publish(MQTT_TOPIC, JSON.stringify({
        senderId: window.state.userId,
        deletedUserId,
        updatedAt: Date.now(),
        participants: remainingParticipants
      }), { qos: 0, retain: true });
    } catch (e) {}
  }

  syncWithServer({ action: 'delete_user', deletedUserId });
  closeRecallBanner();
  closeStoreSwitcherModal();
  selectBrand('santa');
  switchMainTab('home');
  updateAllUI();
  playSound('error');

  // Открываем стартовое окно сразу на чистой вкладке «Регистрация»
  openOnboardingModal(false);
  switchAuthModalTab('register');
  showToast('🗑️ Профиль полностью удалён', 'Все персональные данные, пароль и баллы стерты с устройства и из рейтинга.', 'info');
};

// --- СИНХРОНИЗАЦИЯ МЕЖДУ ТЕЛЕФОНАМИ (СЕРВЕР + ОБЛАЧНЫЙ LIVE-КАНАЛ WSS ДЛЯ СТАТИЧЕСКОГО ХОСТИНГА) ---
window.serverMeta = { ips: [], port: 3000 };
let mqttClient = null;
const MQTT_TOPIC = 'santa_radar_rb_v3_sync_channel_2026/shared_state';

function initCloudRealtimeSync() {
  if (typeof mqtt === 'undefined') return;
  try {
    mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'sr_' + Math.random().toString(16).slice(2, 10),
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 4000
    });

    mqttClient.on('connect', () => {
      mqttClient.subscribe(MQTT_TOPIC, { qos: 0 });
    });

    mqttClient.on('message', (topic, message) => {
      if (topic !== MQTT_TOPIC) return;
      try {
        const data = JSON.parse(message.toString());
        if (!data) return;
        if (data.resetTimestamp && data.resetTimestamp > (window.lastResetTs || 0)) {
          window.lastResetTs = data.resetTimestamp;
          return;
        }
        if (data.senderId === window.state.userId) return;
        applySharedDbToLocal(data);
      } catch (e) {}
    });
  } catch (e) {}
}

function broadcastCloudState() {
  if (!mqttClient || !mqttClient.connected) return;
  try {
    const compactPayload = {
      senderId: window.state.userId,
      updatedAt: Date.now(),
      participants: window.state.participants || {},
      stopList: window.state.stopList || [],
      customStores: (window.state.customStores || []).slice(0, 30),
      customMissions: (window.state.missions || []).filter(m => String(m.id).startsWith('m_custom_')),
      missionLocks: {}
    };
    (window.state.missions || []).forEach(m => {
      if (m.status === 'booked' || m.status === 'completed') {
        compactPayload.missionLocks[m.id] = {
          status: m.status,
          byUserId: window.state.userId,
          byUserName: window.state.userName || 'Сотрудник'
        };
      }
    });
    mqttClient.publish(MQTT_TOPIC, JSON.stringify(compactPayload), { qos: 0, retain: true });
  } catch (e) {}
}

window.getBackendApiUrl = function () {
  if (window.SANTA_BACKEND_URL) return window.SANTA_BACKEND_URL.replace(/\/+$/, '');
  const saved = localStorage.getItem('santa_render_backend_url');
  if (saved) return saved.replace(/\/+$/, '');
  return '';
};

window.syncWithServer = async function (extraPayload = {}) {
  broadcastCloudState();
  try {
    const body = { ...extraPayload };
    if (window.state.onboarded && window.state.userName) {
      body.participant = {
        id: window.state.userId,
        name: window.state.userName,
        division: window.state.userDivision || 'Холдинг Санта',
        role: window.state.userRole || 'Наблюдатель',
        favoriteStore: window.state.favoriteStore || '',
        points: window.state.points,
        strikes: window.state.falseStrikes,
        hardMissions: window.state.hardMissionsDone || 0
      };
    }
    const apiUrl = (window.getBackendApiUrl ? window.getBackendApiUrl() : '') + '/api/sync';
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.ok && data.db) {
      applySharedDbToLocal(data.db);
    }
  } catch (e) {
    // Работает автономно или через облачный WSS-канал на статическом хостинге
  }
};

window.pollServerState = async function () {
  try {
    const apiUrl = (window.getBackendApiUrl ? window.getBackendApiUrl() : '') + '/api/state';
    const res = await fetch(apiUrl);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.ok) {
      if (data.serverIps) window.serverMeta = { ips: data.serverIps, port: data.port || 3000 };
      if (data.db) applySharedDbToLocal(data.db);
    }
  } catch (e) {}
};

function applySharedDbToLocal(db) {
  let changed = false;

  // Если кто-то удалил свой профиль — убираем его из локального списка участников рейтинга
  if (db.deletedUserId && window.state.participants && window.state.participants[db.deletedUserId]) {
    delete window.state.participants[db.deletedUserId];
    changed = true;
  }

  // Синхронизируем участников рейтинга
  if (db.participants && typeof db.participants === 'object') {
    const prevCount = Object.keys(window.state.participants || {}).length;
    window.state.participants = { ...window.state.participants, ...db.participants };
    if (db.deletedUserId && window.state.participants[db.deletedUserId]) {
      delete window.state.participants[db.deletedUserId];
    }
    if (Object.keys(window.state.participants).length !== prevCount) changed = true;
  }

  // Синхронизируем Красные листы (Стоп-лист)
  if (Array.isArray(db.stopList)) {
    if (JSON.stringify(db.stopList) !== JSON.stringify(window.state.stopList)) {
      window.state.stopList = db.stopList;
      changed = true;
    }
  }

  // Синхронизируем пользовательские магазины
  if (Array.isArray(db.customStores)) {
    db.customStores.forEach(cs => {
      if (!window.state.customStores.some(x => x.name === cs.name)) {
        window.state.customStores.unshift(cs);
        changed = true;
      }
    });
  }

  // Синхронизируем созданные миссии и брони
  if (Array.isArray(db.customMissions)) {
    db.customMissions.forEach(cm => {
      if (!window.state.missions.some(m => m.id === cm.id)) {
        window.state.missions.unshift(cm);
        changed = true;
      }
    });
  }

  if (db.missionLocks && typeof db.missionLocks === 'object') {
    window.state.missions.forEach(m => {
      const lock = db.missionLocks[m.id];
      if (lock) {
        if (lock.status === 'available') {
          if (m.status !== 'available') {
            m.status = 'available';
            m.lockedBy = '';
            changed = true;
          }
        } else if (lock.byUserId === window.state.userId) {
          if (m.status !== lock.status) {
            m.status = lock.status;
            changed = true;
          }
        } else {
          const newSt = 'locked_other';
          if (m.status !== newSt) {
            m.status = newSt;
            m.lockedBy = `${lock.byUserName || 'Сотрудник'} (${lock.status === 'completed' ? 'выполнил' : 'забронировал'})`;
            changed = true;
          }
        }
      }
    });
  }

  if (changed) {
    saveState();
    updateAllUI();
  }
}

// --- ОТРИСОВКА ВСЕГО ИНТЕРФЕЙСА ---
function updateAllUI() {
  const displayName = window.state.userName || 'Сотрудник';
  const displayDiv = window.state.userDivision || 'Холдинг Санта';
  const activeStore = window.state.currentStoreName || window.state.favoriteStore || 'Санта • Минск, пр. Победителей, 9';

  const headerStoreEl = document.getElementById('headerActiveStoreName');
  if (headerStoreEl) headerStoreEl.textContent = activeStore;

  if (typeof window.updateOfflineSyncUI === 'function') window.updateOfflineSyncUI();

  // Собираем реальный список участников рейтинга (с нуля!)
  saveState();
  const participantsMap = window.state.participants || {};
  const allPlayers = Object.values(participantsMap).map(p => ({
    ...p,
    isUser: p.id === window.state.userId
  }));

  // Если пользователь еще не залогинен или один — показываем только его с 0 баллов
  if (allPlayers.length === 0 && window.state.userName) {
    allPlayers.push({
      id: window.state.userId,
      name: window.state.userName,
      division: displayDiv,
      role: window.state.userRole || 'Наблюдатель',
      points: window.state.points,
      strikes: window.state.falseStrikes,
      hardMissions: window.state.hardMissionsDone || 0,
      isUser: true
    });
  }

  allPlayers.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.strikes !== b.strikes) return a.strikes - b.strikes;
    return (b.hardMissions || 0) - (a.hardMissions || 0);
  });

  const userIdx = allPlayers.findIndex(p => p.isUser);
  const userRank = userIdx >= 0 ? userIdx + 1 : 1;
  const totalParticipants = allPlayers.length;

  // Название приложения («Скажи Санте» или «Санта.Радар»)
  const appTitle = window.state.appTitleMode || 'Скажи Санте';
  const headerTitleEl = document.getElementById('headerAppTitleText');
  if (headerTitleEl) headerTitleEl.textContent = appTitle;
  const splashTitleEl = document.getElementById('splashAppTitle');
  if (splashTitleEl) splashTitleEl.textContent = appTitle;
  const onbTitleEl = document.getElementById('onbModalTitleText');
  if (onbTitleEl) onbTitleEl.textContent = appTitle;
  document.title = `${appTitle} — Контроль качества`;

  // Шапка (с поддержкой отрицательного баланса в минусе)
  const ptsVal = Number(window.state.points) || 0;
  const headerPtsEl = document.getElementById('headerPointsVal');
  if (headerPtsEl) {
    headerPtsEl.textContent = ptsVal;
    headerPtsEl.className = ptsVal < 0
      ? 'text-base font-black text-rose-600 leading-none'
      : 'text-base font-black text-slate-900 leading-none';
  }
  const revPts = document.getElementById('homeRevolutPoints');
  if (revPts) revPts.textContent = ptsVal;
  const revRank = document.getElementById('homeRevolutRank');
  if (revRank) {
    revRank.textContent = ptsVal < 0
      ? 'В минусе (штраф)'
      : ptsVal === 0
      ? '0 баллов • Старт'
      : `#${userRank} место • ${window.state.userRole || 'Наблюдатель'}`;
  }
  const roleVal = window.state.userRole || 'Наблюдатель';
  const msRoleEl = document.getElementById('missionsRoleStatusText');
  if (msRoleEl) msRoleEl.textContent = roleVal;
  document.getElementById('roleHeaderBadge').innerHTML = `<span>${roleVal}</span><i class="fa-solid fa-repeat text-[8px] opacity-80"></i>`;
  document.getElementById('headerUserSubtitle').textContent = window.state.userName
    ? `${window.state.userName} • ${window.state.userDivision}`
    : 'Мониторинг качества сети «Санта»';
  document.getElementById('headerRankText').textContent = ptsVal < 0
    ? 'В минусе (штраф)'
    : ptsVal === 0
    ? '0 баллов'
    : `#${userRank} место`;
  const gpsStoreEl = document.getElementById('currentGpsStoreText');
  if (gpsStoreEl) gpsStoreEl.textContent = activeStore;
  const scGps = document.getElementById('scannerGpsStamp');
  if (scGps) scGps.textContent = `GPS: ${activeStore}`;

  // Плашка гонки на главной
  const homeDiffEl = document.getElementById('homeBannerLeaderDiff');
  if (homeDiffEl) {
    if (ptsVal < 0) {
      const topPts = (allPlayers[0] && allPlayers[0].points > 0) ? allPlayers[0].points : 0;
      const needed = (topPts - ptsVal) + 1;
      homeDiffEl.innerHTML = `<span class="text-rose-600 font-extrabold">⚠️ Баланс в минусе (${ptsVal} б.) • До лидера: +${needed} б.</span>`;
    } else if (ptsVal === 0 && totalParticipants <= 1) {
      homeDiffEl.textContent = 'У вас 0 баллов • Начните проверку';
    } else if (userRank === 1 && ptsVal > 0) {
      homeDiffEl.innerHTML = `<span class="text-emerald-600 font-extrabold">🥇 Вы на 1-м месте (${ptsVal} б.)</span>`;
    } else {
      const leaderPoints = allPlayers[0] ? allPlayers[0].points : 0;
      const needed = Math.max(1, (leaderPoints - ptsVal) + 1);
      homeDiffEl.textContent = `До лидера: +${needed} б. • У вас ${ptsVal} б.`;
    }
  }

  // Карточки во вкладке iPhone
  document.getElementById('lbUserRankCard').textContent = totalParticipants > 0
    ? `#${userRank} из ${totalParticipants}`
    : '0 участн.';
  const lbScoreEl = document.getElementById('lbUserScoreCard');
  if (lbScoreEl) {
    lbScoreEl.textContent = ptsVal;
    if (lbScoreEl.parentElement) {
      lbScoreEl.parentElement.className = ptsVal < 0
        ? 'text-xs font-extrabold text-rose-400 mt-0.5'
        : 'text-xs font-extrabold text-emerald-400 mt-0.5';
    }
  }

  const isExplorer = !isSpecialAgentRole(window.state.userRole);
  const navMissionsBtn = document.getElementById('navBtn-missions');
  if (navMissionsBtn) {
    navMissionsBtn.classList.remove('hidden');
  }

  const navStopListBtn = document.getElementById('navBtn-stoplist');
  if (navStopListBtn) {
    navStopListBtn.classList.remove('hidden');
  }

  // Продуманная 5-ступенчатая система доверия (Trust Score 0%..100%) и наказаний для Наблюдателя и Спецагента Санты
  const strikes = Math.max(0, Number(window.state.falseStrikes) || 0);
  const trustPct = Math.max(0, 100 - strikes * 20);
  const legitStreak = Number(window.state.legitStreak) || 0;

  const strikesEl = document.getElementById('strikesCounterText');
  if (strikesEl) {
    strikesEl.textContent = `${strikes} / 5`;
    strikesEl.className = strikes >= 3
      ? 'font-extrabold text-rose-600 mt-0.5'
      : strikes > 0
      ? 'font-extrabold text-amber-600 mt-0.5'
      : 'font-extrabold text-slate-800 mt-0.5';
  }

  const trustBadge = document.getElementById('trustScoreBadge');
  const trustTierEl = document.getElementById('trustTierTitleText');
  const trustBarFill = document.getElementById('trustScoreBarFill');
  const rehabLabel = document.getElementById('rehabStreakLabel');
  const tariffEl = document.getElementById('dailyLimitText');
  const roleSanctionHdr = document.getElementById('roleSanctionHeaderLabel');
  const missionAccess = document.getElementById('missionAccessText');
  const banBar = document.getElementById('banResetBar');
  const banBarText = document.getElementById('banResetBarText');

  if (roleSanctionHdr) {
    roleSanctionHdr.textContent = isExplorer ? 'Статус Наблюдателя' : 'Статус Спецагента Санты';
  }
  if (rehabLabel) {
    rehabLabel.textContent = strikes > 0
      ? `Реабилитация: ${legitStreak % 2}/2 честных (-1 страйк)`
      : `Серия честных: ${legitStreak} подр.`;
  }
  if (trustBarFill) {
    trustBarFill.style.width = `${trustPct}%`;
    trustBarFill.className = trustPct >= 80
      ? 'h-full rounded-full bg-emerald-500 transition-all duration-500'
      : trustPct >= 60
      ? 'h-full rounded-full bg-amber-500 transition-all duration-500'
      : 'h-full rounded-full bg-rose-600 transition-all duration-500';
  }

  if (strikes >= 5 || window.state.accountQuarantined) {
    // 5/5 страйков -> 0% доверия -> Полный карантин для обеих ролей
    if (trustBadge) {
      trustBadge.textContent = 'Доверие: 0% (Карантин)';
      trustBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-600 text-white shrink-0';
    }
    if (trustTierEl) trustTierEl.textContent = '⛔ Карантин анти-фрода • Приём новых отчётов заморожен';
    if (tariffEl) {
      tariffEl.textContent = 'Заморожен (0 б.)';
      tariffEl.className = 'font-extrabold text-rose-600 mt-0.5';
    }
    if (missionAccess) {
      missionAccess.textContent = 'Карантин (блок)';
      missionAccess.className = 'font-extrabold text-rose-600 mt-0.5';
    }
  } else if (strikes >= 3) {
    // 3/5 или 4/5 страйков -> 40% или 20% доверия -> Штрафной режим!
    if (trustBadge) {
      trustBadge.textContent = `Доверие: ${trustPct}% (Штраф)`;
      trustBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 shrink-0';
    }
    if (trustTierEl) {
      trustTierEl.textContent = isExplorer
        ? '🔴 Штрафной тариф Наблюдателя • Сигналы +2 б. урезаны до +1 б.'
        : '🔴 Штрафной режим Агента • Миссии закрыты и тариф урезан до +1 б.';
    }
    if (tariffEl) {
      tariffEl.textContent = 'Штраф: макс +1 б.';
      tariffEl.className = 'font-extrabold text-rose-600 mt-0.5';
    }
    if (missionAccess) {
      missionAccess.textContent = isExplorer ? 'Урезан тариф -50%' : 'Миссии закрыты';
      missionAccess.className = 'font-extrabold text-rose-600 mt-0.5';
    }
  } else if (strikes === 2) {
    // 2/5 страйков -> 60% доверия -> Жёлтый контроль (-1 балл)
    if (trustBadge) {
      trustBadge.textContent = 'Доверие: 60% (Контроль)';
      trustBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 shrink-0';
    }
    if (trustTierEl) trustTierEl.textContent = '🟠 Повышенный контроль ИИ • Списан штраф -1 балл';
    if (tariffEl) {
      tariffEl.textContent = '100% (+1..+2 б.)';
      tariffEl.className = 'font-extrabold text-amber-600 mt-0.5';
    }
    if (missionAccess) {
      missionAccess.textContent = isExplorer ? 'На контроле (-1 б.)' : 'Активен (контроль)';
      missionAccess.className = 'font-extrabold text-amber-600 mt-0.5';
    }
  } else if (strikes === 1) {
    // 1/5 страйков -> 80% доверия -> Первое предупреждение (0 б.)
    if (trustBadge) {
      trustBadge.textContent = 'Доверие: 80%';
      trustBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 shrink-0';
    }
    if (trustTierEl) trustTierEl.textContent = '🟡 1-е предупреждение анти-фрода • Следующий фейк: -1 балл';
    if (tariffEl) {
      tariffEl.textContent = `100% (сдано: ${window.state.dailyStoreReports})`;
      tariffEl.className = 'font-extrabold text-emerald-600 mt-0.5';
    }
    if (missionAccess) {
      missionAccess.textContent = 'Предупреждение';
      missionAccess.className = 'font-extrabold text-amber-600 mt-0.5';
    }
  } else {
    // 0/5 страйков -> 100% доверия -> Эталонная репутация
    if (trustBadge) {
      trustBadge.textContent = 'Доверие: 100%';
      trustBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 shrink-0';
    }
    if (trustTierEl) trustTierEl.textContent = '🟢 Эталонная репутация • Полный тариф баллов (+1..+2 б.)';
    if (tariffEl) {
      tariffEl.textContent = `100% (сдано: ${window.state.dailyStoreReports})`;
      tariffEl.className = 'font-extrabold text-emerald-600 mt-0.5';
    }
    if (missionAccess) {
      missionAccess.textContent = 'Без ограничений';
      missionAccess.className = 'font-extrabold text-emerald-600 mt-0.5';
    }
  }

  if (banBar) {
    if (strikes > 0) {
      banBar.classList.remove('hidden');
      if (banBarText) {
        if (strikes >= 5) {
          banBarText.textContent = `⛔ Карантин (5/5 фейков): приём отчётов заморожен, счёт ${ptsVal} б.`;
        } else if (strikes >= 3) {
          banBarText.textContent = isExplorer
            ? `Штрафной режим (${strikes}/5 фейков): сигналы урезаны до +1 б., счёт ${ptsVal} б.`
            : `Штрафной режим (${strikes}/5 фейков): миссии закрыты, счёт ${ptsVal} б.`;
        } else {
          banBarText.textContent = `Анти-фрод: ${strikes}/5 страйков (Доверие ${trustPct}%) • Баланс: ${ptsVal} б.`;
        }
      }
    } else {
      banBar.classList.add('hidden');
    }
  }

  // Индикатор забронированных миссий
  const hasBooked = window.state.favMissionStatus === 'booked' || window.state.missions.some(m => m.status === 'booked');
  const dot = document.getElementById('bookedMissionDot');
  if (dot) dot.classList.toggle('hidden', !hasBooked);

  // Счетчик Красных листов (Стоп-листа) на нижней панели (скрыт, когда 0!)
  const stopCount = (window.state.stopList || []).length;
  const stopBadge = document.getElementById('navStopListCountBadge');
  if (stopBadge) {
    stopBadge.textContent = stopCount;
    stopBadge.classList.toggle('hidden', stopCount === 0);
  }

  renderBrandChecklists();
  renderMissionsTab();
  renderStopListTab();
  renderLeaderboardTab(allPlayers);
  renderHistoryList();
  if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
};

// Универсальная функция мягкого анимированного перехода для любых экранов, вкладок и модальных окон
const ALL_TRANSITION_CLASSES = [
  'smooth-view-enter',
  'smooth-modal-enter',
  'animate-slideDown',
  'view-push-enter',
  'view-push-leave',
  'view-pop-enter',
  'view-pop-leave',
  'view-crossfade-leave'
];

window.cleanViewInlineLock = function (el) {
  if (!el) return;
  if (el._leaveTimer) {
    clearTimeout(el._leaveTimer);
    el._leaveTimer = null;
  }
  el.classList.remove(...ALL_TRANSITION_CLASSES);
  el.style.position = '';
  el.style.top = '';
  el.style.left = '';
  el.style.width = '';
  el.style.zIndex = '';
  el.style.pointerEvents = '';
  el.style.transform = '';
  el.style.filter = '';
  el.style.webkitTransform = '';
  el.style.webkitFilter = '';
};

window.triggerSmoothViewTransition = function (el, isModal, customEnterClass) {
  if (!el) return;
  window.cleanViewInlineLock(el);
  const cls = isModal ? 'smooth-modal-enter' : (customEnterClass || 'smooth-view-enter');
  void el.offsetWidth;
  el.classList.add(cls);
  el._leaveTimer = setTimeout(() => {
    window.cleanViewInlineLock(el);
  }, 320);
};

// Надежный и плавный переход между экранами и вкладками без абсолютного позиционирования и поломки скролла
window.smoothCrossfadeElements = function (fromEl, toEl, direction) {
  if (!toEl) return;
  if (fromEl === toEl) {
    window.cleanViewInlineLock(toEl);
    toEl.classList.remove('hidden');
    return;
  }

  // 1. Скрываем предыдущий элемент (в нормальном потоке документа)
  if (fromEl) {
    window.cleanViewInlineLock(fromEl);
    fromEl.classList.add('hidden');
  }

  // 2. Показываем целевой элемент
  window.cleanViewInlineLock(toEl);
  toEl.classList.remove('hidden');

  // 3. Мгновенно сбрасываем скролл контейнера наверх БЕЗ сброса overflowY
  const vp = document.getElementById('mainViewport');
  if (vp) {
    vp.scrollTop = 0;
  }

  // 4. Легкая анимация плавного появления
  toEl.classList.add('smooth-view-enter');
  toEl._leaveTimer = setTimeout(() => {
    window.cleanViewInlineLock(toEl);
  }, 220);
};

window.smoothCloseModal = function (modalId) {
  const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!modal || modal.classList.contains('hidden')) return;
  if (modal._closeTimer) clearTimeout(modal._closeTimer);
  modal.classList.add('modal-closing');
  modal._closeTimer = setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('modal-closing');
    modal._closeTimer = null;
  }, 250);
};

// --- ВЫБОР И ПЕРЕКЛЮЧЕНИЕ АКТИВНОГО БРЕНДА ХОЛДИНГА САНТА ---
function selectBrand(brandKey) {
  if (!window.BRAND_CONFIG[brandKey]) brandKey = 'santa';
  window.state.activeBrand = brandKey;
  window.state.openCategoryIndex = 0;
  saveState();

  const cfg = window.BRAND_CONFIG[brandKey];
  const header = document.getElementById('appHeader');
  if (header) header.style.backgroundColor = cfg.headerBg;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', cfg.headerBg);

  const hIcon = document.getElementById('headerBrandIcon');
  if (hIcon) hIcon.className = `fa-solid ${cfg.icon} text-white text-sm`;
  const logoUrl = cfg.logoUrl || (window.SANTA_BRAND_LOGOS && window.SANTA_BRAND_LOGOS[brandKey]) || (window.SANTA_BRAND_LOGOS && window.SANTA_BRAND_LOGOS.santa) || 'assets/logos/santa_retail.png';
  const headerLogoImg = document.getElementById('headerBrandLogoImg');
  if (headerLogoImg) headerLogoImg.src = logoUrl;
  const activeLogoImg = document.getElementById('activeBrandLogoImg');
  if (activeLogoImg) activeLogoImg.src = logoUrl;
  const homeIcon = document.getElementById('headerHomeIcon');
  if (homeIcon) homeIcon.style.color = cfg.headerBg;

  Object.keys(window.BRAND_CONFIG).forEach(key => {
    const btn = document.getElementById(`brandBtn-${key}`);
    if (!btn) return;
    btn.style.backgroundColor = '';
  });

  const pagePill = document.getElementById('activeBrandPagePill');
  if (pagePill) pagePill.style.backgroundColor = cfg.headerBg;

  const titleEl = document.getElementById('activeBrandTitle');
  if (titleEl) {
    titleEl.textContent = cfg.name;
    titleEl.style.color = '#ffffff';
  }
  const badgeEl = document.getElementById('activeBrandBadge');
  if (badgeEl) {
    badgeEl.textContent = cfg.badge;
  }
  const subEl = document.getElementById('activeBrandSubtitle');
  if (subEl) subEl.textContent = cfg.subtitle;

  renderBrandChecklists();
}
window.selectBrand = selectBrand;

// --- ПЕРЕХОД МЕЖДУ ЭКРАНОМ 5 БРЕНДОВ И СТРАНИЦЕЙ ВЫБОРА СИГНАЛА ---
function openBrandClaimsPage(brandKey) {
  selectBrand(brandKey);
  const hub = document.getElementById('homeBrandsHub');
  const page = document.getElementById('homeBrandClaimsPage');
  if (hub) hub.classList.add('hidden');
  if (page) page.classList.remove('hidden');

  const backHomeBtn = document.getElementById('headerBackHomeBtn');
  if (backHomeBtn) {
    backHomeBtn.classList.remove('hidden');
    backHomeBtn.classList.add('flex');
  }

  const vp = document.getElementById('mainViewport');
  if (vp) {
    vp.scrollTop = 0;
  }
}
window.openBrandClaimsPage = openBrandClaimsPage;

function backToBrandsHub(silentReset) {
  const hub = document.getElementById('homeBrandsHub');
  const page = document.getElementById('homeBrandClaimsPage');
  if (page) page.classList.add('hidden');
  if (hub) hub.classList.remove('hidden');

  const header = document.getElementById('appHeader');
  if (header) header.style.backgroundColor = '#009FE3';
  const hIcon = document.getElementById('headerBrandIcon');
  if (hIcon) hIcon.className = 'fa-solid fa-cart-shopping text-white text-sm';
  const headerLogoImg = document.getElementById('headerBrandLogoImg');
  const defaultSantaLogo = (window.SANTA_BRAND_LOGOS && window.SANTA_BRAND_LOGOS.santa) || 'assets/logos/santa_retail.png';
  if (headerLogoImg) headerLogoImg.src = defaultSantaLogo;
  const homeIcon = document.getElementById('headerHomeIcon');
  if (homeIcon) homeIcon.style.color = '#009FE3';

  const backHomeBtn = document.getElementById('headerBackHomeBtn');
  if (backHomeBtn && window.state.activeTab === 'home') {
    backHomeBtn.classList.add('hidden');
    backHomeBtn.classList.remove('flex');
  }

  const vp = document.getElementById('mainViewport');
  if (vp) {
    vp.scrollTop = 0;
  }
};

function navigateHomeFull() {
  switchMainTab('home');
  backToBrandsHub();
}
window.navigateHomeFull = navigateHomeFull;

window.clearChecklistSearch = function () {
  document.getElementById('checklistSearchInput').value = '';
  renderBrandChecklists();
};

function toggleCategoryAccordion(idx) {
  const nextIdx = (window.state.openCategoryIndex === idx) ? -1 : idx;
  window.state.openCategoryIndex = nextIdx;

  // Плавное раскрытие/сворачивание через CSS Grid без резкой перерисовки DOM
  const allGrids = document.querySelectorAll('[id^="catAccGrid-"]');
  if (allGrids.length > 0) {
    allGrids.forEach(gridEl => {
      const gIdx = parseInt(gridEl.getAttribute('data-acc-idx'), 10);
      const iconEl = document.getElementById(`catAccIcon-${gIdx}`);
      if (gIdx === nextIdx) {
        gridEl.classList.add('open');
        if (iconEl) iconEl.classList.add('rotate-180');
      } else {
        gridEl.classList.remove('open');
        if (iconEl) iconEl.classList.remove('rotate-180');
      }
    });
    return;
  }
  renderBrandChecklists();
};

function renderBrandChecklists() {
  const cfg = window.BRAND_CONFIG[window.state.activeBrand];
  if (!cfg) return;
  const searchEl = document.getElementById('checklistSearchInput');
  const query = (searchEl ? searchEl.value : '').trim().toLowerCase();
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.classList.toggle('hidden', query.length === 0);

  const container = document.getElementById('checklistsContainer');
  if (!container) return;
  let html = '';

  cfg.categories.forEach((cat, cIdx) => {
    const filteredItems = cat.items.filter(item =>
      !query || item.label.toLowerCase().includes(query) || cat.title.toLowerCase().includes(query)
    );
    if (filteredItems.length === 0) return;

    const isOpen = query.length > 0 || window.state.openCategoryIndex === cIdx;

    html += `
      <div class="bg-white rounded-[22px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-300">
        <button onclick="toggleCategoryAccordion(${cIdx})" class="w-full py-3 px-3.5 text-left flex items-center justify-between gap-3 hover:bg-slate-50/60 transition">
          <div class="flex items-center gap-3 overflow-hidden">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 text-white shadow-sm" style="background-color: ${cfg.headerBg};">
              <i class="fa-solid ${cat.icon}"></i>
            </div>
            <span class="text-[13px] font-bold text-slate-900 tracking-tight truncate">${cat.title}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[11px] font-semibold text-slate-400">${filteredItems.length}</span>
            <div class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
              <i id="catAccIcon-${cIdx}" class="fa-solid fa-chevron-down text-slate-400 text-[10px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}"></i>
            </div>
          </div>
        </button>

        <div id="catAccGrid-${cIdx}" data-acc-idx="${cIdx}" class="smooth-accordion-grid ${isOpen ? 'open' : ''}">
          <div class="smooth-accordion-inner divide-y divide-slate-100/80 px-2 pb-1.5">
            ${filteredItems.map(item => `
              <button onclick="openIssueReportModal('${cfg.id}', '${item.id}')" class="w-full py-2.5 px-2.5 rounded-xl text-left hover:bg-slate-50 active:scale-[0.99] transition flex items-center justify-between gap-3 group">
                <div class="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] text-white shadow-sm" style="background-color: ${item.critical ? '#E11D48' : cfg.headerBg};">
                    <i class="fa-solid ${item.critical ? 'fa-bolt' : item.isOther ? 'fa-pen' : 'fa-camera'}"></i>
                  </div>
                  <span class="text-xs font-semibold text-slate-800 group-hover:text-slate-950 leading-snug min-w-0 flex-1 break-words">
                    ${item.label}
                  </span>
                </div>
                <div class="shrink-0">
                  <span style="${item.points === 2 ? 'background-color:#E11D48;color:#fff;' : `background-color:${cfg.headerBg};color:#fff;`}" class="px-2.5 py-0.5 rounded-full font-extrabold text-[11px] shadow-sm">
                    +${item.points}
                  </span>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  });

  if (!html) {
    html = `<div class="p-6 text-center bg-white rounded-[22px] shadow-sm text-xs text-slate-400">
      Ничего не найдено. Выберите пункт <strong>«Другое»</strong> в любой категории (+1 балл).
    </div>`;
  }

  container.innerHTML = html;
};

// --- МОДАЛЬНОЕ ОКНО СЪЕМКИ ДОКАЗАТЕЛЬСТВА И ОТПРАВКИ ОТЧЕТА ---
function openIssueReportModal(brandKey, itemId) {
  const cfg = window.BRAND_CONFIG[brandKey];
  let foundItem = null;
  let foundCatTitle = 'Контроль качества';
  cfg.categories.forEach(c => {
    c.items.forEach(it => {
      if (it.id === itemId) {
        foundItem = it;
        foundCatTitle = c.title.replace(/^\d+\.\s*/, '');
      }
    });
  });
  if (!foundItem) return;

  window.currentModalPayload = {
    type: 'claim',
    typeLabel: foundItem.critical ? 'Критический сигнал (+2 б.)' : 'Базовый сигнал (+1 б.)',
    critical: Boolean(foundItem.critical),
    brandName: cfg.name,
    categoryTitle: foundCatTitle,
    title: foundItem.label,
    points: foundItem.points,
    hint: foundItem.hint,
    voiceSample: foundItem.voiceSample
  };
  showReportModalUI();
};

window.openScannedProductClaim = function (barcode, productName) {
  const activeBrandCfg = window.BRAND_CONFIG[window.state.activeBrand] || window.BRAND_CONFIG.santa;
  window.currentModalPayload = {
    type: 'claim',
    typeLabel: 'Сигнал по штрихкоду (+1 б.)',
    critical: false,
    brandName: activeBrandCfg.name,
    categoryTitle: `Скан штрихкода [${barcode}]`,
    title: `Товар [${barcode}] ${productName}: замечание по качеству/выкладке`,
    points: 1,
    hint: 'Сфотографируйте товар на полке или его упаковку/ценник и опишите проблему голосом или текстом.',
    voiceSample: `По товару ${productName} (штрихкод ${barcode}) зафиксировано замечание на полке.`
  };
  showReportModalUI();
};

window.openMissionReportModal = function (missionId) {
  const activeFavStore = window.state.favoriteStore || window.state.currentStoreName || 'Ваша точка';
  if (missionId === 'fav_mission') {
    window.currentModalPayload = {
      type: 'fav_mission',
      typeLabel: 'Персональная миссия (+2 б.)',
      critical: false,
      missionId: 'fav_mission',
      brandName: window.state.userDivision || 'Санта Ритейл',
      categoryTitle: 'Любимый магазин сотрудника',
      title: `Миссия в любимом магазине (${activeFavStore}): Проверка витрины`,
      points: 2,
      hint: 'Снимите фото или 5-сек видео витрины и ценников в вашем любимом магазине.',
      voiceSample: 'Выполнена проверка в моем любимом магазине: акционные позиции проверены, температура в норме.'
    };
  } else {
    const m = window.state.missions.find(x => x.id === missionId);
    if (!m) return;
    const targetMissionStore = (m.id && m.id.startsWith('m_custom_')) ? m.store : activeFavStore;
    window.currentModalPayload = {
      type: 'mission',
      typeLabel: `${m.diffLabel || 'Целевая миссия'} (+${m.points} б.)`,
      critical: m.points >= 4,
      missionId: m.id,
      difficulty: m.difficulty,
      brandName: m.brand,
      categoryTitle: m.diffLabel || 'Эксклюзивная миссия',
      title: m.title,
      points: m.points,
      hint: `Эксклюзивная миссия (+${m.points} балла): Снимите фото или 5-сек панорамное видео секции по чек-листу.`,
      voiceSample: `Миссия выполнена по чек-листу в точке ${targetMissionStore}. Все позиции проверены, фото приложено.`
    };
  }
  showReportModalUI();
};

// Переключение вкладки бренда прямо внутри окна оформления сигнала
window.selectClaimModalBrand = function (brandName) {
  if (!window.currentModalPayload) return;
  window.currentModalPayload.brandName = brandName;
  const hex = window.getBrandHexByName(brandName);

  const modalHeader = document.getElementById('reportModalHeader');
  if (modalHeader) modalHeader.style.backgroundColor = hex;

  const submitBtn = document.getElementById('submitLegitBtn');
  if (submitBtn) submitBtn.style.backgroundColor = hex;

  const headerTypeEl = document.getElementById('modalHeaderTypeLabel');
  if (headerTypeEl) {
    headerTypeEl.textContent = `${window.currentModalPayload.typeLabel || 'Сигнал по качеству'} • ${brandName}`;
  }

  const claimTypePill = document.getElementById('claimTypePill');
  if (claimTypePill) {
    claimTypePill.style.backgroundColor = hex;
    claimTypePill.style.color = '#ffffff';
    claimTypePill.textContent = brandName;
  }

  const brandBadge = document.getElementById('modalSelectedBrandBadge');
  if (brandBadge) brandBadge.style.backgroundColor = hex;
  const brandNameEl = document.getElementById('modalSelectedBrandName');
  if (brandNameEl) brandNameEl.textContent = brandName;
  const brandLogoEl = document.getElementById('modalSelectedBrandLogo');
  if (brandLogoEl && window.BRAND_CONFIG) {
    const brandKey = Object.keys(window.BRAND_CONFIG).find(k => window.BRAND_CONFIG[k].name === brandName) || 'santa';
    brandLogoEl.src = (window.SANTA_BRAND_LOGOS && window.SANTA_BRAND_LOGOS[brandKey]) || (window.SANTA_BRAND_LOGOS && window.SANTA_BRAND_LOGOS.santa) || 'assets/logos/santa_retail.png';
  }

  document.querySelectorAll('.claim-brand-tab').forEach(btn => {
    const bName = btn.getAttribute('data-claim-brand');
    const bHex = window.getBrandHexByName(bName);
    btn.style.backgroundColor = bHex;
    btn.style.color = '#ffffff';
    const shortName = bName.replace('Санта ', '');
    const isMatch = brandName.toLowerCase().includes(bName.toLowerCase()) || bName.toLowerCase().includes(brandName.toLowerCase());
    if (isMatch) {
      btn.innerHTML = `<i class="fa-solid fa-check text-[8px]"></i><span>${shortName}</span>`;
      btn.className = `claim-brand-tab py-1.5 px-1.5 rounded-xl text-white font-extrabold text-[10px] text-center truncate transition flex items-center justify-center gap-1 shadow-md ring-2 ring-slate-900 scale-[1.02]`;
    } else {
      btn.innerHTML = `<span>${shortName}</span>`;
      btn.className = `claim-brand-tab py-1.5 px-1.5 rounded-xl text-white font-bold text-[10px] text-center truncate transition flex items-center justify-center gap-1 opacity-75 hover:opacity-100`;
    }
  });
};

function showReportModalUI() {
  resetCapturedMediaUI();
  window.capturedAudioDataUrl = null;
  document.getElementById('reportCommentInput').value = '';
  const audioPrev = document.getElementById('recordedAudioPreviewBox');
  if (audioPrev) audioPrev.classList.add('hidden');

  const payload = window.currentModalPayload;
  const strikes = Math.max(0, Number(window.state.falseStrikes) || 0);
  const isExplorer = !isSpecialAgentRole(window.state.userRole);
  const isClaimType = payload.type !== 'mission' && payload.type !== 'fav_mission';
  const isTariffCut = strikes >= 3 && isClaimType && payload.points >= 2;
  const effectivePts = isTariffCut ? 1 : payload.points;

  const badge = document.getElementById('modalPointBadge');
  if (isTariffCut) {
    badge.textContent = `+1 б. (штраф с +${payload.points})`;
    badge.className = `shrink-0 px-2.5 py-0.5 rounded-full font-black text-xs shadow-sm bg-rose-100 text-rose-800`;
  } else {
    badge.textContent = `+${effectivePts} ${effectivePts === 1 ? 'балл' : 'балла'}`;
    badge.className = `shrink-0 px-2.5 py-0.5 rounded-full font-black text-xs shadow-sm bg-white text-slate-900`;
  }

  document.getElementById('modalIssueTitle').textContent = payload.title;
  document.getElementById('modalPhotoGuideline').textContent = payload.hint;

  const submitBtnText = document.getElementById('submitLegitBtnText');
  if (strikes >= 5 || window.state.accountQuarantined) {
    submitBtnText.textContent = `⛔ Карантин (5/5 страйков) — Снимите в Рейтинге`;
  } else if (isTariffCut) {
    submitBtnText.textContent = `Отправить (${payload.brandName} • +1 балл [Урезан тариф])`;
  } else {
    submitBtnText.textContent = `Отправить (${payload.brandName} • +${effectivePts} ${effectivePts === 1 ? 'балл' : 'балла'})`;
  }

  // Настраиваем подпись кнопки теста анти-фрода по текущей ступени (1..5)
  const fakeBtnText = document.getElementById('submitFakeBtnText');
  if (fakeBtnText) {
    const nextStrike = strikes + 1;
    if (nextStrike === 1) {
      fakeBtnText.textContent = 'Тест анти-фрода: Ложный отчёт (Страйк 1/5 • 0 б. предупреждение)';
    } else if (nextStrike === 2) {
      fakeBtnText.textContent = 'Тест анти-фрода: Ложный отчёт (Страйк 2/5 • Штраф -1 балл в минус)';
    } else if (nextStrike === 3) {
      fakeBtnText.textContent = isExplorer
        ? 'Тест анти-фрода: Ложный отчёт (Страйк 3/5 • -2 б. + Урезка тарифа)'
        : 'Тест анти-фрода: Ложный отчёт (Страйк 3/5 • -2 б. + Блок миссий)';
    } else if (nextStrike === 4) {
      fakeBtnText.textContent = 'Тест анти-фрода: Ложный отчёт (Страйк 4/5 • Штраф -2 балла в минус)';
    } else {
      fakeBtnText.textContent = `Тест анти-фрода: Ложный отчёт (Страйк ${nextStrike}/5 • -3 б. + Карантин)`;
    }
  }

  const activeStore = window.state.currentStoreName || window.state.favoriteStore || 'Магазин РБ';
  const catLabelEl = document.getElementById('claimCategoryLabel');
  if (catLabelEl) catLabelEl.textContent = payload.categoryTitle || 'Контроль качества';
  const storeLabelEl = document.getElementById('claimStoreLabel');
  if (storeLabelEl) storeLabelEl.textContent = activeStore;
  const issueFullEl = document.getElementById('claimIssueFullLabel');
  if (issueFullEl) issueFullEl.textContent = payload.title;
  const sevBadge = document.getElementById('claimSeverityBadge');
  if (sevBadge) {
    if (payload.type === 'mission' || payload.type === 'fav_mission') {
      sevBadge.textContent = `Миссия (+${payload.points} б.)`;
      sevBadge.className = 'shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-100 text-amber-900';
    } else if (isTariffCut) {
      sevBadge.textContent = `Штрафной тариф (+1 б. вместо +${payload.points} б.)`;
      sevBadge.className = 'shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-rose-100 text-rose-700';
    } else if (payload.critical || payload.points >= 2) {
      sevBadge.textContent = `Критический (+${payload.points} б.)`;
      sevBadge.className = 'shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-rose-100 text-rose-700';
    } else {
      sevBadge.textContent = `Базовый (+${payload.points} б.)`;
      sevBadge.className = 'shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-emerald-100 text-emerald-800';
    }
  }

  selectClaimModalBrand(payload.brandName || 'Санта Ритейл');

  const nowStr = new Date().toLocaleTimeString('ru-RU');
  document.getElementById('modalWatermarkTime').textContent = new Date().toLocaleDateString('ru-RU') + ' ' + nowStr;
  document.getElementById('modalWatermarkGps').textContent = `GPS: ${activeStore}`;

  setMediaMode('photo');
  document.getElementById('reportModal').classList.remove('hidden');
  startReportCamera();
  if (typeof window.resetSignalAgentsForNewSignal === 'function') window.resetSignalAgentsForNewSignal();
}

function closeReportModal() {
  stopReportCamera();
  window.smoothCloseModal('reportModal');
};

window.setMediaMode = function (mode) {
  window.currentMediaMode = mode;
  const photoBtn = document.getElementById('mediaModePhotoBtn');
  const videoBtn = document.getElementById('mediaModeVideoBtn');
  const actionText = document.getElementById('captureActionBtnText');

  if (mode === 'photo') {
    if (photoBtn) photoBtn.className = 'flex-1 py-1.5 px-2 rounded-xl text-center font-extrabold text-[11px] transition-all bg-white text-slate-900 shadow-sm flex items-center justify-center gap-1.5';
    if (videoBtn) videoBtn.className = 'flex-1 py-1.5 px-2 rounded-xl text-center font-bold text-[11px] text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5';
    if (!window.mediaCaptured && actionText) actionText.textContent = 'Сделать снимок';
  } else {
    if (videoBtn) videoBtn.className = 'flex-1 py-1.5 px-2 rounded-xl text-center font-extrabold text-[11px] transition-all bg-white text-slate-900 shadow-sm flex items-center justify-center gap-1.5';
    if (photoBtn) photoBtn.className = 'flex-1 py-1.5 px-2 rounded-xl text-center font-bold text-[11px] text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-1.5';
    if (!window.mediaCaptured && actionText) actionText.textContent = 'Записать видео 5 сек';
  }
};

window.submitReport = function (isFakeTest) {
  if (!window.currentModalPayload) return;

  const isExplorer = !isSpecialAgentRole(window.state.userRole);

  // Если аккаунт на карантине (5/5 страйков, доверие 0%), обычные отчеты заморожены до снятия карантина
  if (!isFakeTest && ((Number(window.state.falseStrikes) || 0) >= 5 || window.state.accountQuarantined)) {
    playSound('error');
    showToast(
      '⛔ Аккаунт на карантине (5/5 страйков)',
      'Приём новых отчётов заморожен из-за 0% доверия. Перейдите во вкладку «Рейтинг» и нажмите «Снять страйки».',
      'error'
    );
    return;
  }

  // Если сотрудник еще не нажал "Сделать снимок", а живая камера открыта — автоматически захватываем кадр с камеры при отправке!
  const videoEl = document.getElementById('reportLiveVideo');
  if (!window.mediaCaptured && window.reportMediaStream && videoEl && videoEl.readyState >= 2) {
    triggerInAppCapture();
  }

  // ИИ-агенты проверяют ясность и понятность сигнала перед отправкой
  let aiClarityScore = null;
  if (!isFakeTest && typeof window.aiAgentsGateCheck === 'function') {
    const gate = window.aiAgentsGateCheck();
    if (!gate.ok) return;
    aiClarityScore = gate.score;
  }

  const storeName = window.state.currentStoreName || window.state.favoriteStore || 'Магазин по GPS';
  const commentVal = (document.getElementById('reportCommentInput').value || '').trim();
  const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isFakeTest) {
    playSound('error');
    window.state.falseStrikes = (Number(window.state.falseStrikes) || 0) + 1;
    window.state.legitStreak = 0;
    const s = window.state.falseStrikes;

    let penalty = 0;
    let toastTitle = `Анти-Фрод: Страйк ${s}/5`;
    let msg = '';

    if (s === 1) {
      penalty = 0;
      msg = `1-е предупреждение ИИ («Ложный = 0»). Доверие снижено до 80%. Следующий ложный отчёт спишет -1 балл (даже в минус)!`;
    } else if (s === 2) {
      penalty = 1;
      // Баллы честно уходят в минус (без Math.max(0, ...))!
      window.state.points = (Number(window.state.points) || 0) - penalty;
      msg = `2-й ложный отчёт! Списан штраф -1 балл (ваш счёт: ${window.state.points} б., доверие 60%).`;
    } else if (s === 3) {
      penalty = 2;
      window.state.points = (Number(window.state.points) || 0) - penalty;
      window.state.claimTariffCut = true;
      window.state.missionsBanned = true;
      msg = isExplorer
        ? `3-й ложный отчёт (Доверие 40%)! Списан штраф -2 балла (счёт: ${window.state.points} б.) и включён Штрафной тариф Наблюдателя: критические сигналы урезаны до +1 б.`
        : `3-й ложный отчёт (Доверие 40%)! Списан штраф -2 балла (счёт: ${window.state.points} б.), заблокированы миссии и урезан тариф сигналов.`;
    } else if (s === 4) {
      penalty = 2;
      window.state.points = (Number(window.state.points) || 0) - penalty;
      window.state.claimTariffCut = true;
      window.state.missionsBanned = true;
      msg = `4-й ложный отчёт (Доверие 20%)! Списан ещё один штраф -2 балла (счёт: ${window.state.points} б.). До карантина аккаунта остался 1 страйк!`;
    } else {
      penalty = 3;
      window.state.points = (Number(window.state.points) || 0) - penalty;
      window.state.claimTariffCut = true;
      window.state.missionsBanned = true;
      window.state.accountQuarantined = true;
      toastTitle = `⛔ Карантин (Страйк ${s}/5 • -3 б.)`;
      msg = `5-й ложный отчёт! Списан штраф -3 балла (счёт: ${window.state.points} б.), доверие 0%. Приём новых сигналов заморожен!`;
    }

    const fakeEntry = {
      id: 'h_' + Date.now(),
      time: timeStr,
      author: window.state.userName || 'Сотрудник',
      store: storeName,
      brand: window.currentModalPayload.brandName,
      title: penalty > 0
        ? `[Отклонено: Штраф -${penalty} б. • Страйк ${s}/5] ${window.currentModalPayload.title}`
        : `[Отклонено: Предупреждение 1/5] ${window.currentModalPayload.title}`,
      comment: commentVal,
      photo: window.capturedPhotoDataUrl || null,
      audio: window.capturedAudioDataUrl || null,
      points: -penalty,
      status: 'rejected'
    };

    window.state.history.unshift(fakeEntry);
    saveState();
    syncWithServer({ newReport: fakeEntry });
    closeReportModal();
    updateAllUI();
    showToast(toastTitle, msg, 'error');
    return;
  }

  // Честный отчёт: проверяем, действует ли штрафной урезанный тариф (при 3..4 страйках)
  const curStrikes = Math.max(0, Number(window.state.falseStrikes) || 0);
  const isClaim = window.currentModalPayload.type !== 'mission' && window.currentModalPayload.type !== 'fav_mission';
  const wasTariffCut = curStrikes >= 3 && isClaim && window.currentModalPayload.points >= 2;
  const pts = wasTariffCut ? 1 : window.currentModalPayload.points;

  window.state.points = (Number(window.state.points) || 0) + pts;
  window.state.dailyStoreReports += 1;
  if (window.currentModalPayload.difficulty === 'hard') {
    window.state.hardMissionsDone = (window.state.hardMissionsDone || 0) + 1;
  }

  // Система реабилитации: каждые 2 честных отчёта подряд списывают 1 штрафной страйк (+20% доверия)
  window.state.legitStreak = (Number(window.state.legitStreak) || 0) + 1;
  let rehabNotice = '';
  if (window.state.falseStrikes > 0 && window.state.legitStreak >= 2) {
    window.state.falseStrikes = Math.max(0, window.state.falseStrikes - 1);
    window.state.legitStreak = 0;
    if (window.state.falseStrikes < 5) window.state.accountQuarantined = false;
    if (window.state.falseStrikes < 3) {
      window.state.claimTariffCut = false;
      window.state.missionsBanned = false;
    }
    const newTrust = Math.max(0, 100 - window.state.falseStrikes * 20);
    rehabNotice = ` ✨ Реабилитация: списан 1 страйк (Доверие ${newTrust}%)!`;
  }

  let missionSync = null;
  if (window.currentModalPayload.type === 'fav_mission') {
    window.state.favMissionStatus = 'completed';
  } else if (window.currentModalPayload.type === 'mission') {
    const m = window.state.missions.find(x => x.id === window.currentModalPayload.missionId);
    if (m) {
      m.status = 'completed';
      missionSync = {
        missionId: m.id,
        status: 'completed',
        byUserId: window.state.userId,
        byUserName: window.state.userName || 'Сотрудник'
      };
    }
  }

  const attachedMedia = Array.isArray(window.capturedMediaList) && window.capturedMediaList.length > 0
    ? window.capturedMediaList.map(m => ({ type: m.type, url: m.url, thumb: m.thumb || null }))
    : (window.capturedPhotoDataUrl ? [{ type: 'photo', url: window.capturedPhotoDataUrl, thumb: window.capturedPhotoDataUrl }] : []);

  const newEntry = {
    id: 'h_' + Date.now(),
    time: timeStr,
    author: window.state.userName || 'Сотрудник',
    store: storeName,
    brand: window.currentModalPayload.brandName,
    title: wasTariffCut
      ? `${window.currentModalPayload.title} [Штрафной тариф: +1 б. вместо +2 б.]`
      : window.currentModalPayload.title,
    comment: commentVal,
    photo: window.capturedPhotoDataUrl || null,
    mediaList: attachedMedia,
    audio: window.capturedAudioDataUrl || null,
    points: pts,
    aiClarity: aiClarityScore,
    status: 'approved'
  };

  window.state.history.unshift(newEntry);
  saveState();

  if (!navigator.onLine) {
    if (typeof window.enqueueOfflineReport === 'function') {
      window.enqueueOfflineReport(newEntry, missionSync);
    }
    closeReportModal();
    updateAllUI();
    if (typeof window.playSound === 'function') window.playSound('success');
    if (typeof window.showToast === 'function') {
      window.showToast(
        'Сохранено офлайн 📴 (+1 балл)',
        'Связь в магазине отсутствует. Ваш сигнал сохранён на телефоне и отправится автоматически при появлении сети!',
        'success'
      );
    }
    return;
  }

  syncWithServer({ newReport: newEntry, missionUpdate: missionSync });
  closeReportModal();
  updateAllUI();

  playSound('success');
  const titleToast = wasTariffCut
    ? `Отчет принят (+1 б. по штрафному тарифу)`
    : `Отчет принят (+${pts} ${pts === 1 ? 'балл' : 'балла'})!`;
  showToast(titleToast, `Точка: ${storeName}. Ваш счет: ${window.state.points} б.${rehabNotice}`, 'success');
};

// --- МИССИИ: ПЕРЕХОД ПО СЛОЖНОСТИ, БРОНИРОВАНИЕ, ОТМЕНА МИССИИ И ДЕТАЛЬНОЕ ОПИСАНИЕ ---
function openMissionsDifficultyPage(diffKey) {
  window.state.missionFilter = diffKey || 'all';
  const hub = document.getElementById('missionsDifficultyHub');
  const page = document.getElementById('missionsListPage');
  if (hub) hub.classList.add('hidden');
  if (page) page.classList.remove('hidden');

  const pill = document.getElementById('activeMissionDiffPill');
  if (pill) {
    if (diffKey === 'simple') {
      pill.textContent = '🟢 Простые миссии (+2 б.)';
      pill.className = 'px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs truncate shadow-sm';
    } else if (diffKey === 'medium') {
      pill.textContent = '🟡 Средние миссии (+3 б.)';
      pill.className = 'px-3 py-1.5 rounded-xl bg-amber-500 text-white font-extrabold text-xs truncate shadow-sm';
    } else if (diffKey === 'hard') {
      pill.textContent = '🔴 Сложные миссии (+4 б.)';
      pill.className = 'px-3 py-1.5 rounded-xl bg-rose-600 text-white font-extrabold text-xs truncate shadow-sm';
    } else {
      pill.textContent = '📋 Все миссии';
      pill.className = 'px-3 py-1.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs truncate shadow-sm';
    }
  }

  renderMissionsTab();
  const vp = document.getElementById('mainViewport');
  if (vp) {
    vp.scrollTop = 0;
  }
};

function backToMissionsHub(silentReset) {
  const hub = document.getElementById('missionsDifficultyHub');
  const page = document.getElementById('missionsListPage');
  if (page) page.classList.add('hidden');
  if (hub) hub.classList.remove('hidden');

  const vp = document.getElementById('mainViewport');
  if (vp) {
    vp.scrollTop = 0;
  }
};

window.setMissionFilter = function (filterKey) {
  openMissionsDifficultyPage(filterKey);
};

window.bookMission = function (missionId) {
  if (window.state.missionsBanned || (Number(window.state.falseStrikes) || 0) >= 3) {
    playSound('error');
    showToast('Доступ к миссиям ограничен', `У вас ${window.state.falseStrikes}/5 страйков (Доверие < 50%). Снимите страйки во вкладке «Рейтинг» или сдайте честные сигналы.`, 'error');
    return;
  }

  if (missionId === 'fav_mission') {
    window.state.favMissionStatus = 'booked';
    saveState();
  } else {
    const m = window.state.missions.find(x => x.id === missionId);
    if (!m || m.status !== 'available') return;
    m.status = 'booked';
    saveState();
    syncWithServer({
      missionUpdate: {
        missionId: m.id,
        status: 'booked',
        byUserId: window.state.userId,
        byUserName: window.state.userName || 'Сотрудник'
      }
    });
  }

  playSound('success');
  updateAllUI();
  showToast('Миссия забронирована за вами!', 'Вы можете выполнить её или отменить бронь в любой момент.', 'success');
};

window.cancelMission = function (missionId) {
  if (missionId === 'fav_mission') {
    window.state.favMissionStatus = 'available';
    saveState();
  } else {
    const m = window.state.missions.find(x => x.id === missionId);
    if (!m) return;
    m.status = 'available';
    m.lockedBy = '';
    saveState();
    syncWithServer({
      missionUpdate: {
        missionId: m.id,
        status: 'available',
        byUserId: window.state.userId,
        byUserName: window.state.userName || 'Сотрудник'
      }
    });
  }

  playSound('success');
  updateAllUI();
  showToast('Миссия отменена', 'Задание снова свободно и доступно для выбора.', 'info');
};

window.selectMissionModalBrand = function (brandName) {
  const inp = document.getElementById('newMissionBrandSelect');
  if (inp) inp.value = brandName;
  document.querySelectorAll('.mission-brand-tab').forEach(btn => {
    const b = btn.getAttribute('data-mission-brand');
    const hex = window.getBrandHexByName(b);
    btn.style.backgroundColor = hex;
    btn.style.color = '#ffffff';
    if (b === brandName) {
      btn.textContent = `✓ ${b}`;
      btn.className = `${b === 'Санта Отели' ? 'col-span-2 sm:col-span-1 ' : ''}mission-brand-tab py-2 px-2 rounded-xl text-white font-extrabold text-[10px] text-center truncate transition shadow-md ring-2 ring-slate-900 scale-[1.02]`;
    } else {
      btn.textContent = b;
      btn.className = `${b === 'Санта Отели' ? 'col-span-2 sm:col-span-1 ' : ''}mission-brand-tab py-2 px-2 rounded-xl text-white font-extrabold text-[10px] text-center truncate transition opacity-80 hover:opacity-100`;
    }
  });
};

window.openCreateMissionModal = function () {
  document.getElementById('newMissionStoreInput').value = window.state.currentStoreName || window.state.favoriteStore || '';
  document.getElementById('newMissionTitleInput').value = '';
  const activeCfg = window.BRAND_CONFIG[window.state.activeBrand] || window.BRAND_CONFIG.santa;
  selectMissionModalBrand(activeCfg.name);
  document.getElementById('createMissionModal').classList.remove('hidden');
};

window.closeCreateMissionModal = function () {
  document.getElementById('createMissionModal').classList.add('hidden');
};

window.saveCustomMission = function () {
  const brand = document.getElementById('newMissionBrandSelect').value;
  const diff = document.getElementById('newMissionDiffSelect').value;
  const store = (document.getElementById('newMissionStoreInput').value || '').trim() || 'Любой магазин РБ';
  const title = (document.getElementById('newMissionTitleInput').value || '').trim();

  if (!title) {
    showToast('Укажите суть задания', 'Напишите, что именно нужно проверить в магазине.', 'error');
    return;
  }

  const diffMap = {
    simple: { label: '🟢 Простая миссия', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', pts: 2, dur: '3–5 мин' },
    medium: { label: '🟡 Средняя миссия', cls: 'bg-amber-100 text-amber-900 border-amber-200', pts: 3, dur: '7–10 мин' },
    hard: { label: '🔴 Сложная миссия', cls: 'bg-rose-100 text-rose-900 border-rose-200', pts: 4, dur: '12–15 мин' }
  };
  const cfg = diffMap[diff] || diffMap.medium;

  const newM = {
    id: 'm_custom_' + Date.now(),
    difficulty: diff,
    diffLabel: cfg.label,
    diffBadgeClass: cfg.cls,
    brand,
    store,
    duration: cfg.dur,
    title,
    description: `Целевое задание для проверки стандартов бренда «${brand}» в точке «${store}». Проверьте соответствие выкладки, сроков годности и ценников.`,
    photoGuide: 'Сделайте четкое обзорное фото витрины и крупный кадр проверяемой позиции.',
    tasks: [
      'Посетить указанную торговую точку и найти нужную секцию',
      'Проверить продукцию и стандарты согласно теме задания',
      'Выполнить фото- или 5-сек видеофиксацию в приложении с геометкой',
      'Оставить краткий голосовой или текстовый вывод по итогам проверки'
    ],
    points: cfg.pts,
    status: 'available'
  };

  window.state.missions.unshift(newM);
  saveState();
  syncWithServer({ newCustomMission: newM });
  closeCreateMissionModal();
  updateAllUI();
  openMissionsDifficultyPage(diff);
  playSound('success');
  showToast('Задание создано!', `Добавлено в раздел «${cfg.label}» (+${cfg.pts} б.).`, 'success');
};

function renderMissionsTab() {
  // Обновляем счетчики на 3 карточках сложности
  const allMissions = window.state.missions || [];
  const cSimple = allMissions.filter(m => m.difficulty === 'simple').length;
  const cMedium = allMissions.filter(m => m.difficulty === 'medium').length;
  const cHard = allMissions.filter(m => m.difficulty === 'hard').length;
  const elS = document.getElementById('diffCount-simple');
  const elM = document.getElementById('diffCount-medium');
  const elH = document.getElementById('diffCount-hard');
  const elA = document.getElementById('diffCount-all');
  if (elS) elS.textContent = cSimple;
  if (elM) elM.textContent = cMedium;
  if (elH) elH.textContent = cHard;
  if (elA) elA.textContent = allMissions.length;

  const favBox = document.getElementById('favoriteStoreMissionBox');
  if (!favBox) return;
  const favStoreLabel = window.state.favoriteStore || window.state.currentStoreName || 'Магазин не выбран (укажите в настройках)';
  let favActionsHtml = '';

  if (window.state.favMissionStatus === 'available') {
    favActionsHtml = `
      <button onclick="bookMission('fav_mission')" class="mt-3 w-full py-2.5 px-3 rounded-xl bg-white text-slate-900 font-extrabold text-xs shadow flex items-center justify-center gap-2 hover:bg-slate-50 transition active:scale-[0.99]">
        <i class="fa-solid fa-lock text-[#009FE3]"></i>
        <span>Забронировать квест (+2 балла)</span>
      </button>
    `;
  } else if (window.state.favMissionStatus === 'booked') {
    favActionsHtml = `
      <div class="mt-2.5 flex items-center gap-2">
        <button onclick="openMissionReportModal('fav_mission')" class="flex-1 py-2.5 px-3 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shadow flex items-center justify-center gap-1.5 hover:bg-amber-300 transition active:scale-95">
          <i class="fa-solid fa-camera"></i>
          <span>Сдать отчет (+2 б.)</span>
        </button>
        <button onclick="cancelMission('fav_mission')" class="py-2.5 px-3 rounded-xl bg-white/15 hover:bg-rose-500/80 text-white font-bold text-xs transition active:scale-95" title="Отменить бронь миссии">
          Отменить
        </button>
      </div>
    `;
  } else {
    favActionsHtml = `
      <div class="mt-2.5 flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-emerald-500/30 border border-emerald-300/40 text-xs font-bold text-emerald-100">
        <span><i class="fa-solid fa-circle-check mr-1"></i>Выполнено (+2 б.)</span>
        <button onclick="cancelMission('fav_mission')" class="text-[10px] underline opacity-85 hover:opacity-100">Повторить</button>
      </div>
    `;
  }

  favBox.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5 flex-wrap">
          <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/20 text-white text-[10px] font-extrabold uppercase">
            <i class="fa-solid fa-heart text-rose-300"></i>
            <span>Любимый магазин • ~4 мин</span>
          </div>
          <button onclick="openStoreSwitcherModal()" class="px-2 py-0.5 rounded-md bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold flex items-center gap-1 transition">
            <i class="fa-solid fa-pen text-[8px]"></i>
            <span>Сменить</span>
          </button>
        </div>
        <h3 class="text-xs font-black mt-1.5 leading-snug">${favStoreLabel}</h3>
        <p class="text-[11px] text-white/85 mt-1 leading-relaxed">
          Проверьте наличие ключевых позиций «Савушкин» и «Санта Бремор», читаемость ценников и температуру холодильной горки (+2..+6 °C) в вашей выбранной точке.
        </p>
      </div>
      <span class="shrink-0 px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shadow">+2 б.</span>
    </div>
    ${favActionsHtml}
  `;

  const listContainer = document.getElementById('missionsListContainer');
  if (!listContainer) return;
  const filtered = allMissions.filter(
    m => window.state.missionFilter === 'all' || m.difficulty === window.state.missionFilter
  );

  listContainer.innerHTML = filtered.map(m => {
    const activeMissionStore = (m.id && m.id.startsWith('m_custom_'))
      ? m.store
      : (window.state.favoriteStore || window.state.currentStoreName || m.store);
    let footerHtml = '';
    if (m.status === 'available') {
      footerHtml = `
        <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
          <span class="text-[11px] font-semibold text-emerald-700"><i class="fa-solid fa-unlock mr-1"></i>Свободно • 1 человек</span>
          <button onclick="bookMission('${m.id}')" class="px-4 py-2 rounded-xl bg-[#009FE3] hover:bg-[#0088c6] text-white font-extrabold text-xs shadow-sm transition active:scale-95">
            Взять миссию (+${m.points} б.)
          </button>
        </div>
      `;
    } else if (m.status === 'booked') {
      footerHtml = `
        <div class="mt-3 pt-2.5 border-t border-amber-200 space-y-2">
          <div class="flex items-center justify-between text-[11px] bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200 text-amber-900 font-bold">
            <span><i class="fa-solid fa-user-lock mr-1"></i>Забронировано за вами</span>
            <button onclick="cancelMission('${m.id}')" class="text-rose-600 hover:text-rose-700 font-extrabold flex items-center gap-1">
              <i class="fa-solid fa-xmark"></i>
              <span>Отменить миссию</span>
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openMissionReportModal('${m.id}')" class="flex-1 py-2.5 px-3 rounded-xl bg-[#009FE3] hover:bg-[#0088c6] text-white font-extrabold text-xs shadow flex items-center justify-center gap-2 transition active:scale-95">
              <i class="fa-solid fa-camera"></i>
              <span>Сдать отчет (+${m.points} б.)</span>
            </button>
            <button onclick="cancelMission('${m.id}')" class="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs transition active:scale-95">
              Отменить
            </button>
          </div>
        </div>
      `;
    } else if (m.status === 'completed') {
      footerHtml = `
        <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
          <div class="py-1.5 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs">
            <i class="fa-solid fa-circle-check mr-1"></i>Выполнено (+${m.points} б.)
          </div>
          <button onclick="cancelMission('${m.id}')" class="text-[11px] font-semibold text-slate-400 hover:text-slate-600">
            Освободить снова
          </button>
        </div>
      `;
    } else {
      footerHtml = `
        <div class="mt-3 pt-2.5 border-t border-slate-100">
          <div class="py-2 px-3 rounded-xl bg-slate-100 text-slate-500 font-semibold text-[11px] flex items-center justify-between">
            <span><i class="fa-solid fa-lock mr-1"></i>Занято: ${m.lockedBy || 'В работе'}</span>
            <button onclick="cancelMission('${m.id}')" class="text-[10px] text-rose-600 font-bold hover:underline">Снять бронь</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="bg-white rounded-[22px] border ${m.status === 'booked' ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-100'} p-4 shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${m.diffBadgeClass}">${(m.diffLabel || '').replace('Хардкорная', 'Сложная')}</span>
            ${window.renderBrandColoredBadges(m.brand)}
            ${m.duration ? `<span class="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold"><i class="fa-regular fa-clock mr-1"></i>${m.duration}</span>` : ''}
          </div>
          <span class="shrink-0 px-2.5 py-1 rounded-xl font-black text-xs ${m.points === 4 ? 'bg-rose-600 text-white' : m.points === 3 ? 'bg-amber-400 text-slate-950' : 'bg-emerald-600 text-white'}">
            +${m.points} б.
          </span>
        </div>

        <div class="text-[11px] font-bold text-[#009FE3] mt-2 flex items-center gap-1">
          <i class="fa-solid fa-location-dot"></i>
          <span>${activeMissionStore}</span>
        </div>

        <h3 class="text-[13px] font-extrabold text-slate-900 mt-1 leading-snug">${m.title}</h3>

        ${m.description ? `<p class="text-[11px] text-slate-600 mt-1.5 leading-relaxed bg-slate-50 p-2.5 rounded-xl">${m.description}</p>` : ''}

        <div class="mt-2.5">
          <div class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Пошаговый план проверки:</div>
          <ul class="space-y-1.5 text-[11px] text-slate-700">
            ${(m.tasks || []).map((t, idx) => `
              <li class="flex items-start gap-2">
                <span class="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5">${idx + 1}</span>
                <span class="leading-snug">${t}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        ${m.photoGuide ? `
          <div class="mt-2.5 p-2 rounded-xl bg-sky-50/80 text-[11px] text-slate-700 flex items-start gap-2">
            <i class="fa-solid fa-camera text-[#009FE3] mt-0.5"></i>
            <span><strong>Что снять:</strong> ${m.photoGuide}</span>
          </div>
        ` : ''}

        ${footerHtml}
      </div>
    `;
  }).join('');
};

// ============================================================================
// КРАСНЫЕ ЛИСТЫ (СТОП-ЛИСТ ПАРТИЙ) — С НУЛЯ (0 ЗАПИСЕЙ ПРИ ВХОДЕ + СОЗДАНИЕ СВОИХ)
// ============================================================================
window.selectStopModalBrand = function (brandName) {
  const inp = document.getElementById('stopBrandSelect');
  if (inp) inp.value = brandName;
  document.querySelectorAll('.stop-brand-tab').forEach(btn => {
    const b = btn.getAttribute('data-stop-brand');
    const hex = window.getBrandHexByName(b);
    btn.style.backgroundColor = hex;
    btn.style.color = '#ffffff';
    if (b === brandName) {
      btn.textContent = `✓ ${b}`;
      btn.className = `${b === 'Санта Отели' ? 'col-span-2 sm:col-span-1 ' : ''}stop-brand-tab py-2 px-2 rounded-xl text-white font-extrabold text-[10px] text-center truncate transition shadow-md ring-2 ring-slate-900 scale-[1.02]`;
    } else {
      btn.textContent = b;
      btn.className = `${b === 'Санта Отели' ? 'col-span-2 sm:col-span-1 ' : ''}stop-brand-tab py-2 px-2 rounded-xl text-white font-extrabold text-[10px] text-center truncate transition opacity-80 hover:opacity-100`;
    }
  });
};

window.openAddStopListModal = function (prefillBarcode = '', prefillProduct = '', prefillBrand = '') {
  if (!isSpecialAgentRole(window.state.userRole)) {
    showToast('Доступно только Спецагентам Санты', 'Вкладка «Красный лист» доступна только для роли Спецагент Санты.', 'error');
    return;
  }
  document.getElementById('stopBarcodeInput').value = prefillBarcode || '';
  document.getElementById('stopProductInput').value = prefillProduct || '';
  document.getElementById('stopBatchInput').value = '';
  document.getElementById('stopReasonInput').value = '';
  let targetBrand = 'Санта Бремор';
  if (prefillBrand) {
    const lb = prefillBrand.toLowerCase();
    if (lb.includes('савушкин')) targetBrand = 'Савушкин';
    else if (lb.includes('рест')) targetBrand = 'Санта Рест';
    else if (lb.includes('отел')) targetBrand = 'Санта Отели';
    else if (lb.includes('ритейл') || lb.includes('санта')) targetBrand = 'Санта Ритейл';
  }
  selectStopModalBrand(targetBrand);
  document.getElementById('addStopListModal').classList.remove('hidden');
};

window.closeAddStopListModal = function () {
  document.getElementById('addStopListModal').classList.add('hidden');
};

window.saveNewStopListItem = function () {
  const brand = document.getElementById('stopBrandSelect').value || 'Санта Бремор';
  const product = (document.getElementById('stopProductInput').value || '').trim();
  const batchCode = (document.getElementById('stopBatchInput').value || '').trim() || 'Партия от ' + new Date().toLocaleDateString('ru-RU');
  const barcode = (document.getElementById('stopBarcodeInput').value || '').trim() || '4810000000000';
  const reason = (document.getElementById('stopReasonInput').value || '').trim() || 'Подозрение на брак упаковки / отклонение качества партии';

  if (!product) {
    showToast('Укажите наименование товара', 'Например: Форель слабосоленая 200г или Йогурт Teos 140г', 'error');
    return;
  }

  const brandHex = window.getBrandHexByName(brand);

  const newBatch = {
    id: 'batch_' + Date.now(),
    brand,
    brandHex,
    product,
    batchCode,
    barcode,
    reason,
    createdBy: window.state.userName || 'Сотрудник',
    storeOrigin: window.state.currentStoreName || window.state.favoriteStore || 'Беларусь',
    points: 5
  };

  if (!Array.isArray(window.state.stopList)) window.state.stopList = [];
  window.state.stopList.unshift(newBatch);
  saveState();
  syncWithServer({ newStopItem: newBatch });
  closeAddStopListModal();
  updateAllUI();
  playSound('alarm');
  showToast('🚨 Партия внесена в Красный лист!', `${product} (${batchCode}) теперь в ориентировках у всех сотрудников.`, 'gold');
};

window.removeStopListItem = function (batchId) {
  window.state.stopList = (window.state.stopList || []).filter(b => b.id !== batchId);
  saveState();
  syncWithServer({ removeStopItemId: batchId });
  updateAllUI();
  showToast('Ориентировка закрыта', 'Партия удалена из активного Красного листа.', 'info');
};

window.triggerInterceptForStopItem = function (batchId) {
  const b = (window.state.stopList || []).find(x => x.id === batchId);
  if (!b) return;
  playSound('alarm');
  window.activeRecallContext = {
    product: `${b.product} (${b.batchCode})`,
    brand: b.brand,
    badge: 'Перехват Красного листа!',
    title: `БЛОКИРОВКА ПАРТИИ: ${b.batchCode}`,
    desc: `<strong>${b.product}</strong> (Штрихкод: ${b.barcode}). Причина: ${b.reason}. Укажите количество пачек на полке для снятия с реализации (+5 баллов)!`
  };
  openRecallBanner(window.activeRecallContext);
};

function renderStopListTab() {
  const container = document.getElementById('stopListContainer');
  if (!container) return;
  const list = window.state.stopList || [];

  if (list.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-6 text-center space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl">
          <i class="fa-solid fa-shield-check"></i>
        </div>
        <div>
          <h3 class="text-sm font-black text-slate-900">Красный лист пуст (0 активных партий)</h3>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">
            Сейчас нет ни одной предзаполненной стоп-партии. Вы можете внести реальную партию в Красный лист вручную или через Сканер штрихкодов!
          </p>
        </div>
        <button onclick="openAddStopListModal()" class="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wide shadow-md flex items-center justify-center gap-2 transition">
          <i class="fa-solid fa-plus-circle"></i>
          <span>➕ Внести партию в Красный лист</span>
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(b => `
    <div class="bg-white rounded-2xl border-2 border-rose-200 p-3.5 shadow-sm">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          ${window.renderBrandColoredBadges(b.brand)}
          <span class="text-[11px] font-mono font-bold text-slate-500">${b.barcode}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-xs">+5 б.</span>
          <button onclick="removeStopListItem('${b.id}')" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs" title="Удалить из Красного листа">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <h3 class="text-xs font-black text-slate-900 mt-2">${b.product}</h3>
      <div class="mt-1 inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-mono text-[11px] font-bold">
        ${b.batchCode}
      </div>

      <p class="text-[11px] text-slate-600 mt-2 leading-relaxed">${b.reason}</p>

      <div class="mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[10px] font-semibold text-slate-500 flex items-center justify-between">
        <span><i class="fa-solid fa-user-shield text-rose-600 mr-1"></i>Внес: ${b.createdBy || 'Сотрудник'}</span>
        <span class="truncate ml-2">${b.storeOrigin || ''}</span>
      </div>

      <button onclick="triggerInterceptForStopItem('${b.id}')" class="mt-2.5 w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wide shadow flex items-center justify-center gap-2 transition">
        <i class="fa-solid fa-box-archive"></i>
        <span>Зафиксировать перехват на полке (+5 баллов)</span>
      </button>
    </div>
  `).join('');
};

function openRecallBanner(ctx) {
  document.getElementById('recallBannerBadge').textContent = ctx.badge;
  document.getElementById('recallBannerTitle').textContent = ctx.title;
  document.getElementById('recallBannerDesc').innerHTML = ctx.desc;
  document.getElementById('recallEmergencyBanner').classList.remove('hidden');
};

function closeRecallBanner() {
  document.getElementById('recallEmergencyBanner').classList.add('hidden');
};

window.adjustRecallQty = function (delta) {
  const inp = document.getElementById('recallQtyInput');
  let v = parseInt(inp.value || '6', 10) + delta;
  if (v < 1) v = 1;
  if (v > 999) v = 999;
  inp.value = v;
};

window.confirmRecallIntercept = function () {
  const qty = document.getElementById('recallQtyInput').value || '6';
  window.state.points += 5;

  const prodTitle = window.activeRecallContext
    ? window.activeRecallContext.product
    : 'Партия из Красного листа';

  const newEntry = {
    id: 'h_recall_' + Date.now(),
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    author: window.state.userName || 'Сотрудник',
    store: window.state.currentStoreName || window.state.favoriteStore || 'Точка по GPS',
    brand: window.activeRecallContext ? window.activeRecallContext.brand : 'Красный лист',
    title: `🚨 ПЕРЕХВАТ СТОП-ПАРТИИ: ${prodTitle} (${qty} шт. снято с полки)`,
    points: 5,
    status: 'recall'
  };

  window.state.history.unshift(newEntry);
  closeRecallBanner();
  saveState();
  syncWithServer({ newReport: newEntry });
  updateAllUI();
  playSound('fanfare');
  showToast('🚨 Стоп-партия перехвачена (+5 баллов)!', `Снято с реализации: ${qty} шт. Ваш счет: ${window.state.points} б.`, 'gold');
};

// ============================================================================
// РЕЙТИНГ И ИСТОРИЯ ПРОВЕРОК (С НУЛЯ, БЕЗ ВПИСАННЫХ ЧУЖИХ ЛЮДЕЙ!)
// ============================================================================
function renderLeaderboardTab(allPlayers) {
  const lbContainer = document.getElementById('leaderboardList');
  if (!lbContainer) return;

  if (!allPlayers || allPlayers.length === 0) {
    lbContainer.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-400">
        Рейтинг чист (0 участников). Пройдите вход и отправьте первый отчет!
      </div>
    `;
    return;
  }

  lbContainer.innerHTML = allPlayers.map((p, idx) => {
    const rank = idx + 1;
    let rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center">${rank}</span>`;
    if (rank === 1 && p.points > 0) {
      rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow"><i class="fa-solid fa-crown text-[11px]"></i></span>`;
    } else if (rank === 2 && p.points > 0) {
      rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center">2</span>`;
    } else if (rank === 3 && p.points > 0) {
      rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-700/20 text-amber-900 font-black text-xs flex items-center justify-center">3</span>`;
    }

    const rolePill = isSpecialAgentRole(p.role)
      ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800">🕵️‍♂️ Спецагент Санты</span>`
      : `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">👁️ Наблюдатель</span>`;

    const pStrikes = Number(p.strikes) || 0;
    const pTrust = Math.max(0, 100 - pStrikes * 20);
    const sanctionTag = pStrikes >= 5
      ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-600 text-white">⛔ Карантин</span>`
      : pStrikes >= 3
      ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-700">⚠️ Штраф -50%</span>`
      : '';

    const ptsColorClass = p.points < 0
      ? 'text-rose-600'
      : rank === 1 && p.points > 0
      ? 'text-amber-600'
      : p.isUser
      ? 'text-blue-700'
      : 'text-slate-800';

    return `
      <div class="p-3 px-3.5 flex items-center justify-between gap-2 ${p.isUser ? 'bg-blue-50/80 font-bold' : ''}">
        <div class="flex items-center gap-2.5 overflow-hidden">
          ${rankBadge}
          <div class="overflow-hidden">
            <div class="text-xs font-extrabold text-slate-900 truncate flex items-center gap-1.5">
              <span>${p.name}${p.isUser ? ' (Вы)' : ''}</span>
              ${rank === 1 && p.points > 0 ? `<span class="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-amber-400 text-slate-950">Лидер iPhone</span>` : ''}
              ${sanctionTag}
            </div>
            <div class="text-[10px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
              ${rolePill}
              ${window.renderBrandColoredBadges(p.division)}
              <span>• Страйки: ${pStrikes}/5 (${pTrust}%)</span>
            </div>
          </div>
        </div>
        <div class="shrink-0 text-right">
          <span class="text-sm font-black ${ptsColorClass}">${p.points}</span>
          <span class="text-[10px] ${p.points < 0 ? 'text-rose-500 font-bold' : 'text-slate-400 font-semibold'}">б.</span>
        </div>
      </div>
    `;
  }).join('');
};

function renderHistoryList() {
  const histContainer = document.getElementById('historyList');
  const countBadge = document.getElementById('historyCountBadge');
  if (!histContainer) return;

  const list = window.state.history || [];
  if (countBadge) countBadge.textContent = `${list.length} отчетов`;

  if (list.length === 0) {
    histContainer.innerHTML = `<div class="p-5 text-center text-xs text-slate-400">История проверок пуста (0 отчетов). Все начинается с нуля — отправьте первую проверку!</div>`;
    return;
  }

  histContainer.innerHTML = list.map(h => {
    const isRej = h.status === 'rejected';
    const isRecall = h.status === 'recall';
    const typeTag = isRecall
      ? `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-extrabold">Красный лист</span>`
      : h.points >= 3
      ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-extrabold">Миссия</span>`
      : `<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[9px] font-extrabold">Сигнал</span>`;
    const mediaArr = Array.isArray(h.mediaList) && h.mediaList.length > 0
      ? h.mediaList
      : (h.photo ? [{ type: 'photo', url: h.photo }] : []);
    const mediaHtml = mediaArr.length === 1
      ? (mediaArr[0].type === 'video'
          ? `<video src="${mediaArr[0].url}" controls playsinline class="w-full h-32 object-cover rounded-xl border border-slate-200"></video>`
          : `<img src="${mediaArr[0].url}" alt="Фото отчета" class="w-full h-32 object-cover rounded-xl border border-slate-200" />`)
      : mediaArr.length > 1
      ? `<div class="flex items-center gap-2 overflow-x-auto pb-1">
          ${mediaArr.map((m, idx) => m.type === 'video'
            ? `<video src="${m.url}" controls playsinline class="shrink-0 w-36 h-28 object-cover rounded-xl border border-slate-200"></video>`
            : `<img src="${m.url}" alt="Фото ${idx + 1}" class="shrink-0 w-36 h-28 object-cover rounded-xl border border-slate-200" />`
          ).join('')}
        </div>`
      : '';

    const ptsBadgeText = isRej
      ? (Number(h.points) < 0 ? `${h.points} б.` : '0 б. (Пред.)')
      : `+${h.points} б.`;

    return `
      <div class="p-3 px-3.5 space-y-2 text-xs">
        <div class="flex items-start justify-between gap-2">
          <div class="overflow-hidden">
            <div class="flex flex-wrap items-center gap-1.5">
              ${window.renderBrandColoredBadges(h.brand)}
              ${typeTag}
              ${mediaArr.length > 1 ? `<span class="px-1.5 py-0.5 rounded bg-sky-100 text-[#009FE3] text-[9px] font-extrabold"><i class="fa-solid fa-images mr-0.5"></i>${mediaArr.length} медиа</span>` : ''}
              ${typeof h.aiClarity === 'number' ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold ${h.aiClarity >= 80 ? 'bg-emerald-100 text-emerald-800' : h.aiClarity >= 60 ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-900'}"><i class="fa-solid fa-robot mr-0.5"></i>Ясность ${h.aiClarity}/100</span>` : ''}
              <span class="text-[10px] text-slate-400">${h.time}</span>
            </div>
            <div class="font-bold ${isRej ? 'text-rose-700' : 'text-slate-800'} mt-1 leading-snug">${h.title}</div>
            ${h.comment ? `<div class="text-[11px] text-slate-600 italic mt-0.5">«${h.comment}»</div>` : ''}
            <div class="text-[10px] text-slate-400 truncate mt-0.5"><i class="fa-solid fa-location-dot mr-1"></i>${h.store}</div>
          </div>
          <span class="shrink-0 px-2 py-1 rounded-lg font-black text-xs ${isRej ? 'bg-rose-100 text-rose-700' : isRecall ? 'bg-amber-400 text-slate-950' : 'bg-emerald-100 text-emerald-800'}">
            ${ptsBadgeText}
          </span>
        </div>
        ${mediaHtml}
        ${h.audio ? `<audio controls src="${h.audio}" class="w-full h-8 mt-1"></audio>` : ''}
      </div>
    `;
  }).join('');
};

window.resetStrikesDemo = function () {
  window.state.falseStrikes = 0;
  window.state.legitStreak = 0;
  window.state.missionsBanned = false;
  window.state.claimTariffCut = false;
  window.state.accountQuarantined = false;
  saveState();
  syncWithServer({});
  updateAllUI();
  playSound('success');
  showToast('Страйки и санкции сняты', 'Доверие 100%, полный тариф сигналов и доступ к миссиям восстановлены.', 'success');
};

// --- НАВИГАЦИЯ, ВОЗВРАТ НА ГЛАВЮ, НАСТРОЙКИ, ОНБОРДИНГ И QR-КОД ДЛЯ ДИРЕКТОРА ---
const TAB_ORDER = ['home', 'missions', 'scanner', 'stoplist', 'leaderboard', 'settings'];

function switchMainTab(tabKey) {
  const prevTab = window.state.activeTab || 'home';
  const prevSec = document.getElementById(`tab-${prevTab}`);
  const nextSec = document.getElementById(`tab-${tabKey}`);

  // Если нажали на уже открытую вкладку «Главная» или «Миссии» — возвращаем на хаб внутри неё
  if (prevTab === tabKey && nextSec && !nextSec.classList.contains('hidden')) {
    if (tabKey === 'home') backToBrandsHub(false);
    if (tabKey === 'missions') backToMissionsHub(false);
    return;
  }

  window.state.activeTab = tabKey;
  if (tabKey !== 'scanner' && window.isScannerRunning) {
    stopLiveBarcodeScanner();
  }

  // При переходе на вкладку подготавливаем её данные
  if (tabKey === 'home') {
    backToBrandsHub(true);
    renderBrandChecklists();
  } else if (tabKey === 'missions') {
    backToMissionsHub(true);
    renderMissionsTab();
  } else if (tabKey === 'stoplist') {
    renderStopListTab();
  } else if (tabKey === 'leaderboard') {
    renderLeaderboardTab();
  } else if (tabKey === 'settings') {
    if (typeof window.syncSettingsUI === 'function') syncSettingsUI();
  }

  // Мгновенно и надежно переключаем видимость секций
  TAB_ORDER.forEach(k => {
    const sec = document.getElementById(`tab-${k}`);
    if (sec) {
      if (k === tabKey) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    }
    const navBtn = document.getElementById(`navBtn-${k}`);
    if (navBtn && k !== 'scanner') {
      navBtn.className = (k === tabKey)
        ? 'nav-tab-btn flex flex-col items-center justify-center py-1 px-2 rounded-2xl text-[#009FE3] bg-sky-50/80 font-extrabold transition'
        : 'nav-tab-btn flex flex-col items-center justify-center py-1 px-2 rounded-2xl text-slate-400 hover:text-slate-700 font-semibold transition';
    }
  });

  // Кнопка быстрого возврата «🏠 Главная» в верхней шапке
  const backHomeBtn = document.getElementById('headerBackHomeBtn');
  if (backHomeBtn) {
    if (tabKey === 'home') {
      backHomeBtn.classList.add('hidden');
      backHomeBtn.classList.remove('flex');
    } else {
      backHomeBtn.classList.remove('hidden');
      backHomeBtn.classList.add('flex');
    }
  }

  const vp = document.getElementById('mainViewport');
  if (vp) {
    vp.scrollTop = 0;
  }
};

// ============================================================================
// НАСТРОЙКИ ПРИЛОЖЕНИЯ (СВЕТЛАЯ/ТЕМНАЯ ТЕМА, ШРИФТ, РОЛЬ, ЗВУК, ВИБРО, КАМЕРА, ЭКСПОРТ)
// ============================================================================
window.setAppTheme = function (themeMode) {
  window.state.theme = (themeMode === 'dark') ? 'dark' : 'light';
  document.body.classList.toggle('dark-theme', window.state.theme === 'dark');
  saveState();
  syncSettingsUI();
  playSound('success');
  showToast(
    window.state.theme === 'dark' ? '🌙 Включена тёмная тема' : '☀️ Включена светлая тема',
    'Оформление интерфейса мгновенно обновлено.',
    'info'
  );
};

window.toggleSettingSwitch = function (key) {
  const curVal = (key === 'largeTextMode') ? Boolean(window.state[key]) : (window.state[key] !== false);
  window.state[key] = !curVal;
  if (key === 'soundEnabled') {
    window.soundEnabled = window.state.soundEnabled;
    const icon = document.getElementById('soundIcon');
    if (icon) {
      icon.className = window.soundEnabled
        ? 'fa-solid fa-volume-high text-emerald-500'
        : 'fa-solid fa-volume-xmark text-slate-400';
    }
  } else if (key === 'largeTextMode') {
    document.documentElement.classList.toggle('large-text-mode', Boolean(window.state.largeTextMode));
  }
  saveState();
  syncSettingsUI();
  playSound('success');
};

window.setSettingsRole = function (roleName) {
  const normalized = isSpecialAgentRole(roleName) ? 'Спецагент Санты' : 'Наблюдатель';
  window.state.userRole = normalized;
  saveState();
  syncWithServer({});
  updateAllUI();
  playSound('success');
  showToast(
    `Режим: ${normalized}`,
    normalized === 'Наблюдатель'
      ? 'Сигналы без лимитов (Миссии и Красный лист скрыты).'
      : 'Открыты вкладки эксклюзивных Миссий и Красного листа!',
    'info'
  );
};

window.setSettingsDivision = function (divName) {
  window.state.userDivision = divName;
  saveState();
  syncWithServer({});
  updateAllUI();
  playSound('success');
  showToast(`Подразделение: ${divName}`, 'Сохранено в вашем профиле сотрудника.', 'info');
};

window.setAppTitleFromSettings = function (titleName) {
  window.state.appTitleMode = titleName;
  saveState();
  updateAllUI();
  playSound('success');
  showToast(`Название: «${titleName}»`, 'Шапка и загрузочный экран обновлены.', 'info');
};

window.setDefaultCameraFacing = function (facing) {
  window.state.defaultCameraFacing = facing;
  window.reportFacingMode = facing;
  saveState();
  syncSettingsUI();
  playSound('success');
  showToast(
    facing === 'environment' ? '📷 Основная (задняя) камера' : '🤳 Фронтальная камера',
    'Установлена по умолчанию для фото и видео.',
    'info'
  );
};

window.exportReportsToCsv = function () {
  const list = window.state.history || [];
  const rows = [
    ['ID', 'Время', 'Сотрудник', 'Подразделение', 'Магазин', 'Бренд проверки', 'Суть сигнала / Сигнала', 'Комментарий', 'Баллы', 'Статус']
  ];
  list.forEach(h => {
    rows.push([
      h.id || '',
      h.time || '',
      h.author || window.state.userName || 'Сотрудник',
      window.state.userDivision || 'Холдинг Санта',
      h.store || '',
      h.brand || '',
      (h.title || '').replace(/"/g, '""'),
      (h.comment || '').replace(/"/g, '""'),
      String(h.points || 0),
      h.status || 'approved'
    ]);
  });

  const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(';')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `santa_quality_reports_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  playSound('success');
  showToast('Выгрузка CSV готова!', `Сохранено отчетов: ${list.length}. Открывается в Excel.`, 'success');
};

function syncSettingsUI() {
  const isDark = window.state.theme === 'dark';
  document.body.classList.toggle('dark-theme', isDark);
  document.documentElement.classList.toggle('large-text-mode', Boolean(window.state.largeTextMode));
  window.soundEnabled = window.state.soundEnabled !== false;

  const themeBadge = document.getElementById('settingsActiveThemeBadge');
  if (themeBadge) themeBadge.textContent = isDark ? 'Тёмная' : 'Светлая';

  const btnLight = document.getElementById('themeBtnLight');
  const btnDark = document.getElementById('themeBtnDark');
  const chkLight = document.getElementById('themeCheckLight');
  const chkDark = document.getElementById('themeCheckDark');
  if (btnLight && btnDark) {
    if (!isDark) {
      btnLight.className = 'p-3 rounded-2xl border-2 border-[#009FE3] bg-sky-50/50 text-left flex items-center justify-between transition';
      btnDark.className = 'p-3 rounded-2xl border-2 border-slate-200 bg-slate-50 text-left flex items-center justify-between transition';
      if (chkLight) chkLight.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
      if (chkDark) chkDark.className = 'fa-regular fa-circle text-slate-400 text-xs';
    } else {
      btnDark.className = 'p-3 rounded-2xl border-2 border-[#009FE3] bg-sky-50/50 text-left flex items-center justify-between transition';
      btnLight.className = 'p-3 rounded-2xl border-2 border-slate-200 bg-slate-50 text-left flex items-center justify-between transition';
      if (chkDark) chkDark.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
      if (chkLight) chkLight.className = 'fa-regular fa-circle text-slate-400 text-xs';
    }
  }

  // Тумблеры настроек
  ['largeTextMode', 'soundEnabled', 'vibrationEnabled', 'watermarkEnabled'].forEach(k => {
    const btn = document.getElementById(`toggleBtn-${k}`);
    if (!btn) return;
    const isOn = k === 'largeTextMode' ? Boolean(window.state[k]) : (window.state[k] !== false);
    btn.className = isOn
      ? 'w-12 h-7 rounded-full bg-emerald-500 p-1 transition flex items-center justify-end cursor-pointer'
      : 'w-12 h-7 rounded-full bg-slate-300 p-1 transition flex items-center justify-start cursor-pointer';
  });

  // Роль в настройках
  const isAgent = isSpecialAgentRole(window.state.userRole);
  const roleExpBtn = document.getElementById('settingsRoleExplorer');
  const roleAgentBtn = document.getElementById('settingsRoleAgent');
  const expIcon = document.getElementById('settingsRoleExpIcon');
  const agIcon = document.getElementById('settingsRoleAgentIcon');
  if (roleExpBtn && roleAgentBtn) {
    if (!isAgent) {
      roleExpBtn.className = 'p-2.5 rounded-2xl border-2 border-[#009FE3] bg-sky-50/40 text-left transition';
      roleAgentBtn.className = 'p-2.5 rounded-2xl border-2 border-slate-200 bg-slate-50 text-left transition';
      if (expIcon) expIcon.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
      if (agIcon) agIcon.className = 'fa-regular fa-circle text-slate-400 text-xs';
    } else {
      roleAgentBtn.className = 'p-2.5 rounded-2xl border-2 border-[#009FE3] bg-sky-50/40 text-left transition';
      roleExpBtn.className = 'p-2.5 rounded-2xl border-2 border-slate-200 bg-slate-50 text-left transition';
      if (agIcon) agIcon.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
      if (expIcon) expIcon.className = 'fa-regular fa-circle text-slate-400 text-xs';
    }
  }

  // Подразделение в настройках (в фирменных цветах брендов)
  const curDiv = window.state.userDivision || 'Санта Ритейл';
  document.querySelectorAll('.settings-div-tab').forEach(btn => {
    const bDiv = btn.getAttribute('data-set-div');
    const hex = DIVISION_HEX_MAP[bDiv] || '#009FE3';
    btn.style.backgroundColor = hex;
    btn.style.color = '#ffffff';
    if (bDiv === curDiv) {
      btn.textContent = `✓ ${bDiv}`;
      btn.className = `${bDiv === 'Санта Отели' ? 'col-span-2 sm:col-span-1 ' : ''}settings-div-tab py-2 px-1.5 rounded-xl text-white font-extrabold text-[10px] text-center truncate transition shadow-md ring-2 ring-slate-900 scale-[1.03]`;
    } else {
      btn.textContent = bDiv;
      btn.className = `${bDiv === 'Санта Отели' ? 'col-span-2 sm:col-span-1 ' : ''}settings-div-tab py-2 px-1.5 rounded-xl text-white font-extrabold text-[10px] text-center truncate transition opacity-80 hover:opacity-100 shadow-sm`;
    }
  });

  // Название приложения в настройках
  const isRadar = window.state.appTitleMode === 'Санта.Радар';
  const tBtn1 = document.getElementById('settingsTitleBtn1');
  const tBtn2 = document.getElementById('settingsTitleBtn2');
  const tIc1 = document.getElementById('settingsTitleIcon1');
  const tIc2 = document.getElementById('settingsTitleIcon2');
  if (tBtn1 && tBtn2) {
    if (!isRadar) {
      tBtn1.className = 'py-2.5 px-3 rounded-2xl border-2 border-[#009FE3] bg-sky-50/40 font-extrabold text-xs text-slate-900 flex items-center justify-between transition';
      tBtn2.className = 'py-2.5 px-3 rounded-2xl border-2 border-slate-200 bg-slate-50 font-extrabold text-xs text-slate-900 flex items-center justify-between transition';
      if (tIc1) tIc1.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
      if (tIc2) tIc2.className = 'fa-regular fa-circle text-slate-400 text-xs';
    } else {
      tBtn2.className = 'py-2.5 px-3 rounded-2xl border-2 border-[#009FE3] bg-sky-50/40 font-extrabold text-xs text-slate-900 flex items-center justify-between transition';
      tBtn1.className = 'py-2.5 px-3 rounded-2xl border-2 border-slate-200 bg-slate-50 font-extrabold text-xs text-slate-900 flex items-center justify-between transition';
      if (tIc2) tIc2.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
      if (tIc1) tIc1.className = 'fa-regular fa-circle text-slate-400 text-xs';
    }
  }

  // Камера по умолчанию
  const camEnv = document.getElementById('camFaceEnvBtn');
  const camUser = document.getElementById('camFaceUserBtn');
  if (camEnv && camUser) {
    const isFront = window.state.defaultCameraFacing === 'user';
    camEnv.className = !isFront
      ? 'px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-[#009FE3] text-white transition'
      : 'px-2.5 py-1 rounded-xl text-[10px] font-bold bg-slate-100 text-slate-600 transition';
    camUser.className = isFront
      ? 'px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-[#009FE3] text-white transition'
      : 'px-2.5 py-1 rounded-xl text-[10px] font-bold bg-slate-100 text-slate-600 transition';
  }
};

window.openStoreSwitcherModal = function () {
  document.getElementById('storeSwitcherModal').classList.remove('hidden');
  document.getElementById('switcherStoreInput').value = '';
  handleStoreAutocomplete('switcher', '');
};

window.closeStoreSwitcherModal = function () {
  window.smoothCloseModal('storeSwitcherModal');
};

window.setGpsToFavorite = function () {
  if (!window.state.favoriteStore) {
    openOnboardingModal();
    return;
  }
  window.state.currentStoreName = window.state.favoriteStore;
  saveState();
  updateAllUI();
  showToast('Переключено на любимый магазин', window.state.favoriteStore, 'info');
};

window.toggleUserRoleQuick = function () {
  window.state.userRole = isSpecialAgentRole(window.state.userRole) ? 'Наблюдатель' : 'Спецагент Санты';
  saveState();
  syncWithServer({});
  updateAllUI();
  playSound('success');
  showToast(`Режим: ${window.state.userRole}`, 'Все баллы идут в единый зачет гонки за iPhone!', 'info');
};

const DIVISION_HEX_MAP = {
  'Санта Ритейл': '#009FE3',
  'Санта Бремор': '#003865',
  'Савушкин': '#008A3C',
  'Санта Рест': '#B24A32',
  'Санта Отели': '#6A1A24'
};

window.selectOnboardingDivision = function (divName) {
  window.state.userDivision = divName || 'Санта Ритейл';
  document.querySelectorAll('.onb-div-chip').forEach(btn => {
    const bDiv = btn.getAttribute('data-div');
    const hex = DIVISION_HEX_MAP[bDiv] || '#009FE3';
    btn.style.backgroundColor = hex;
    btn.style.color = '#ffffff';
    const shortLabel = bDiv === 'Санта Ритейл' ? 'Ритейл' : bDiv === 'Санта Бремор' ? 'Бремор' : bDiv === 'Санта Рест' ? 'Рест' : bDiv === 'Санта Отели' ? 'Отели' : bDiv;
    if (bDiv === window.state.userDivision) {
      btn.textContent = `✓ ${shortLabel}`;
      btn.className = `onb-div-chip py-1.5 px-1.5 rounded-xl font-extrabold text-[10px] text-center truncate transition shadow-md ring-2 ring-slate-900 scale-[1.03]`;
    } else {
      btn.textContent = shortLabel;
      btn.className = `onb-div-chip py-1.5 px-1.5 rounded-xl font-extrabold text-[10px] text-center truncate transition opacity-75 hover:opacity-100 shadow-sm`;
    }
  });
  validateOnboardingButton();
};

window.isSessionAuthenticated = false;
window.isEditingProfileMode = false;
window.activeAuthTab = 'login';

window.clearOnbPasswordError = function () {
  const errBox = document.getElementById('onbPasswordErrorBox');
  if (errBox) errBox.classList.add('hidden');
  const passInp = document.getElementById('onbPasswordInput');
  if (passInp) {
    passInp.classList.remove('ring-2', 'ring-rose-500', 'bg-rose-50');
  }
  const loginErrBox = document.getElementById('loginPasswordErrorBox');
  if (loginErrBox) loginErrBox.classList.add('hidden');
  const loginPassInp = document.getElementById('loginPasswordInput');
  if (loginPassInp) {
    loginPassInp.classList.remove('ring-2', 'ring-rose-500', 'bg-rose-50');
  }
};

window.showOnbPasswordError = function (msg) {
  const isLogin = window.activeAuthTab === 'login';
  const errBox = document.getElementById(isLogin ? 'loginPasswordErrorBox' : 'onbPasswordErrorBox');
  const errText = document.getElementById(isLogin ? 'loginPasswordErrorText' : 'onbPasswordErrorText');
  const passInp = document.getElementById(isLogin ? 'loginPasswordInput' : 'onbPasswordInput');
  if (errText) errText.textContent = msg;
  if (errBox) errBox.classList.remove('hidden');
  if (passInp) {
    passInp.classList.add('ring-2', 'ring-rose-500', 'bg-rose-50');
    passInp.focus();
  }
  playSound('alarm');
  showToast('Доступ запрещен', msg, 'error');
};

window.switchAuthModalTab = function (tabMode) {
  window.activeAuthTab = tabMode === 'register' ? 'register' : 'login';
  clearOnbPasswordError();

  const btnLogin = document.getElementById('authTabBtn-login');
  const btnReg = document.getElementById('authTabBtn-register');
  const paneLogin = document.getElementById('authPane-login');
  const paneReg = document.getElementById('authPane-register');
  const titleEl = document.getElementById('onbModalTitleText');
  const subEl = document.getElementById('onbModalSubtitleText');

  if (window.activeAuthTab === 'login') {
    if (btnLogin) btnLogin.className = 'py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition bg-white text-[#009FE3] shadow-sm';
    if (btnReg) btnReg.className = 'py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition text-slate-500 hover:text-slate-800';
    if (paneLogin) {
      paneLogin.classList.remove('hidden');
      window.triggerSmoothViewTransition(paneLogin, false, 'view-pop-enter');
    }
    if (paneReg) paneReg.classList.add('hidden');
    if (titleEl) titleEl.textContent = 'Вход в аккаунт';
    if (subEl) subEl.textContent = 'Введите ваш пароль или используйте Face ID';
  } else {
    if (btnReg) btnReg.className = 'py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition bg-white text-[#009FE3] shadow-sm';
    if (btnLogin) btnLogin.className = 'py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition text-slate-500 hover:text-slate-800';
    if (paneReg) {
      paneReg.classList.remove('hidden');
      window.triggerSmoothViewTransition(paneReg, false, 'view-push-enter');
    }
    if (paneLogin) paneLogin.classList.add('hidden');
    if (titleEl) titleEl.textContent = window.isEditingProfileMode ? 'Профиль и смена пароля' : 'Регистрация сотрудника';
    if (subEl) subEl.textContent = 'Заполните анкету и установите пароль';
  }
};

window.lockAppSession = function () {
  window.isSessionAuthenticated = false;
  window.isEditingProfileMode = false;
  openOnboardingModal(false);
  showToast('Сессия заблокирована', 'Введите ваш пароль или используйте Face ID для входа.', 'info');
};

function openOnboardingModal(isEditMode) {
  window.isEditingProfileMode = Boolean(isEditMode && window.isSessionAuthenticated);
  clearOnbPasswordError();

  // Заполняем поля Регистрации
  document.getElementById('onbNameInput').value = window.state.userName || '';
  const phoneInp = document.getElementById('onbPhoneInput');
  if (phoneInp) phoneInp.value = window.state.userPhone || '';
  const emailInp = document.getElementById('onbEmailInput');
  if (emailInp) emailInp.value = window.state.userEmail || '';

  const hasSavedPassword = Boolean(window.state.onboarded && window.state.userPassword);

  const passInp = document.getElementById('onbPasswordInput');
  if (passInp) {
    passInp.type = 'password';
    passInp.value = window.isEditingProfileMode ? (window.state.userPassword || '') : '';
  }
  const eyeIcon = document.getElementById('onbPassEyeIcon');
  if (eyeIcon) eyeIcon.className = 'fa-regular fa-eye text-xs';

  // Заполняем плашку Входа
  const loginIdInp = document.getElementById('loginIdentifierInput');
  if (loginIdInp) {
    loginIdInp.value = window.state.userPhone || window.state.userEmail || window.state.userName || '';
  }
  const loginPassInp = document.getElementById('loginPasswordInput');
  if (loginPassInp) {
    loginPassInp.type = 'password';
    loginPassInp.value = ''; // Всегда пустое при входе — нужно ввести верный пароль!
  }
  const loginEye = document.getElementById('loginPassEyeIcon');
  if (loginEye) loginEye.className = 'fa-regular fa-eye text-xs';

  const savedBadge = document.getElementById('loginSavedProfileBadge');
  if (savedBadge) {
    if (window.state.onboarded && window.state.userName) {
      savedBadge.classList.remove('hidden');
      const av = document.getElementById('loginSavedAvatar');
      if (av) av.textContent = (window.state.userName || 'С').charAt(0).toUpperCase();
      const nm = document.getElementById('loginSavedNameText');
      if (nm) nm.textContent = window.state.userName;
      const mt = document.getElementById('loginSavedMetaText');
      if (mt) mt.textContent = `${window.state.userDivision || 'Санта Ритейл'} • ${window.state.userRole || 'Наблюдатель'}`;
    } else {
      savedBadge.classList.add('hidden');
    }
  }

  const saveBtn = document.getElementById('saveOnboardingBtn');
  if (saveBtn) {
    saveBtn.textContent = window.isEditingProfileMode ? 'Сохранить изменения' : 'Зарегистрироваться и войти';
  }

  const delBtn = document.getElementById('onbDeleteProfileBtn');
  if (delBtn) {
    delBtn.classList.add('hidden');
    delBtn.classList.remove('flex');
  }

  const faceBanner = document.getElementById('faceIdScannerBanner');
  if (faceBanner) faceBanner.classList.add('hidden');
  document.getElementById('onbFavStoreInput').value = window.state.favoriteStore || '';
  document.getElementById('onbClearStoreBtn').classList.toggle('hidden', !window.state.favoriteStore);
  document.getElementById('onbGpsNearestBox').classList.add('hidden');
  document.getElementById('onbStoreSuggestions').classList.add('hidden');

  selectOnboardingDivision(window.state.userDivision || 'Санта Ритейл');

  // Кнопка закрытия (крестик) видна ТОЛЬКО если пользователь уже прошел вход в текущей сессии
  const closeBtn = document.getElementById('closeOnboardingBtn');
  if (closeBtn) {
    if (window.isSessionAuthenticated) {
      closeBtn.classList.remove('hidden');
      closeBtn.classList.add('flex');
    } else {
      closeBtn.classList.add('hidden');
      closeBtn.classList.remove('flex');
    }
  }

  selectOnboardingRole(window.state.userRole || 'Наблюдатель');
  validateOnboardingButton();

  // Если уже есть сохраненный аккаунт с паролем и мы не в режиме редактирования — открываем плашку «Вход»
  if (hasSavedPassword && !window.isEditingProfileMode) {
    switchAuthModalTab('login');
  } else {
    switchAuthModalTab('register');
  }

  document.getElementById('onboardingModal').classList.remove('hidden');
};

window.toggleOnbPasswordVisibility = function () {
  const inp = document.getElementById('onbPasswordInput');
  const icon = document.getElementById('onbPassEyeIcon');
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (icon) icon.className = 'fa-regular fa-eye-slash text-xs text-[#009FE3]';
  } else {
    inp.type = 'password';
    if (icon) icon.className = 'fa-regular fa-eye text-xs';
  }
};

window.toggleLoginPasswordVisibility = function () {
  const inp = document.getElementById('loginPasswordInput');
  const icon = document.getElementById('loginPassEyeIcon');
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (icon) icon.className = 'fa-regular fa-eye-slash text-xs text-[#009FE3]';
  } else {
    inp.type = 'password';
    if (icon) icon.className = 'fa-regular fa-eye text-xs';
  }
};

window.submitAuthLogin = function () {
  window.activeAuthTab = 'login';
  clearOnbPasswordError();

  if (!window.state.onboarded || !window.state.userPassword) {
    showOnbPasswordError('Аккаунт еще не создан! Перейдите на плашку «Регистрация» и установите пароль.');
    return;
  }

  const enteredPass = (document.getElementById('loginPasswordInput')?.value || '').trim();
  if (!enteredPass) {
    showOnbPasswordError('Введите пароль для входа в приложение!');
    return;
  }

  if (enteredPass !== window.state.userPassword) {
    showOnbPasswordError('Неверный пароль! Вход в приложение заблокирован.');
    return;
  }

  window.isSessionAuthenticated = true;
  window.isEditingProfileMode = false;
  try { localStorage.setItem('santa_session_logged_in', 'true'); } catch (e) {}
  clearOnbPasswordError();
  document.getElementById('onboardingModal').classList.add('hidden');
  updateAllUI();
  playSound('success');
  showToast(`Вход выполнен: ${window.state.userName || 'Сотрудник'}`, `${window.state.userRole} • ${window.state.userDivision}`, 'success');
};

window.triggerFaceIdAuth = async function (mode) {
  if (mode === 'login') {
    window.activeAuthTab = 'login';
    if (!window.state.onboarded || !window.state.userPassword) {
      showOnbPasswordError('Сначала пройдите «Регистрацию», чтобы привязать Face ID к вашему профилю!');
      return;
    }
  } else {
    window.activeAuthTab = 'register';
    const consentEl = document.getElementById('consentPersonalData');
    if (consentEl && !consentEl.checked) {
      showToast('Подтвердите согласие', 'Пожалуйста, отметьте галочку согласия на обработку персональных данных.', 'error');
      return;
    }
  }

  const banner = document.getElementById('faceIdScannerBanner');
  const icon = document.getElementById('faceIdStatusIcon');
  const title = document.getElementById('faceIdStatusTitle');
  const sub = document.getElementById('faceIdStatusSub');

  if (banner) banner.classList.remove('hidden');
  if (icon) icon.className = 'fa-solid fa-expand animate-spin text-sky-400 text-sm';
  if (title) title.textContent = 'Сканирование Face ID...';
  if (sub) sub.textContent = 'Подтверждение биометрии устройства';

  if (window.PublicKeyCredential && navigator.credentials && window.isSecureContext) {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Скажи Санте • Контроль качества' },
          user: {
            id: new Uint8Array(16),
            name: (document.getElementById('onbEmailInput')?.value || window.state.userEmail || 'user@santa.by'),
            displayName: (document.getElementById('onbNameInput')?.value || window.state.userName || 'Сотрудник Санта')
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'preferred'
          },
          timeout: 12000
        }
      });
    } catch (e) {}
  }

  setTimeout(() => {
    window.state.faceIdEnabled = true;
    if (icon) icon.className = 'fa-solid fa-circle-check text-emerald-400 text-sm';
    if (title) title.textContent = 'Face ID подтвержден!';
    if (sub) sub.textContent = 'Биометрическая авторизация пройдена';
    playSound('success');
    setTimeout(() => {
      if (mode === 'login') {
        window.isSessionAuthenticated = true;
        window.isEditingProfileMode = false;
        try { localStorage.setItem('santa_session_logged_in', 'true'); } catch (e) {}
        clearOnbPasswordError();
        document.getElementById('onboardingModal').classList.add('hidden');
        updateAllUI();
        showToast(`Face ID: ${window.state.userName || 'Сотрудник'}`, `${window.state.userRole} • ${window.state.userDivision}`, 'success');
      } else {
        saveOnboardingProfile(true);
      }
    }, 450);
  }, 650);
};

window.closeOnboardingModal = function (forceGuest = false) {
  try { localStorage.setItem('santa_session_logged_in', 'true'); } catch (e) {}
  if (!window.isSessionAuthenticated) {
    if (!window.state.userProfile || !window.state.userProfile.name) {
      window.state.userProfile = {
        name: 'Сотрудник Санта',
        role: 'researcher',
        subdivision: 'Санта Ритейл'
      };
      saveState();
      updateAllUI();
    }
    window.isSessionAuthenticated = true;
  }
  window.smoothCloseModal('onboardingModal');
  if (forceGuest) {
    showToast('Демо-режим активирован', 'Вы вошли как гость сети «Санта»', 'info');
  }
};

window.selectOnboardingRole = function (role) {
  window.state.userRole = role || 'Наблюдатель';
  const agentCard = document.getElementById('roleCardAgent');
  const expCard = document.getElementById('roleCardExplorer');
  const agentCheck = document.getElementById('roleAgentCheck');
  const expCheck = document.getElementById('roleExplorerCheck');

  if (isSpecialAgentRole(window.state.userRole)) {
    agentCard.className = 'p-2.5 rounded-2xl border-2 border-[#009FE3] bg-sky-50/70 text-left transition shadow-sm';
    expCard.className = 'p-2.5 rounded-2xl border-2 border-slate-200 bg-slate-50/70 text-left transition';
    agentCheck.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
    expCheck.className = 'fa-regular fa-circle text-slate-400 text-xs';
  } else {
    expCard.className = 'p-2.5 rounded-2xl border-2 border-[#009FE3] bg-sky-50/70 text-left transition shadow-sm';
    agentCard.className = 'p-2.5 rounded-2xl border-2 border-slate-200 bg-slate-50/70 text-left transition';
    expCheck.className = 'fa-solid fa-circle-check text-[#009FE3] text-xs';
    agentCheck.className = 'fa-regular fa-circle text-slate-400 text-xs';
  }
  validateOnboardingButton();
};

window.validateOnboardingButton = function () {
  const btn = document.getElementById('saveOnboardingBtn');
  if (!btn) return;
  const consentEl = document.getElementById('consentPersonalData');
  const isConsented = !consentEl || consentEl.checked;

  if (!isConsented) {
    btn.disabled = true;
    btn.className = 'w-full py-3 rounded-2xl bg-slate-300 text-slate-500 font-extrabold text-xs uppercase tracking-wider cursor-not-allowed transition';
  } else {
    btn.disabled = false;
    btn.className = 'w-full py-3 rounded-2xl bg-[#009FE3] hover:bg-[#0088c6] text-white font-extrabold text-xs uppercase tracking-wider shadow-md transition active:scale-95 cursor-pointer';
  }
};

window.saveOnboardingProfile = function (viaFaceId) {
  window.activeAuthTab = 'register';
  const consentEl = document.getElementById('consentPersonalData');
  if (consentEl && !consentEl.checked) {
    showToast('Требуется согласие', 'Отметьте согласие на использование персональных данных.', 'error');
    return;
  }

  const nameVal = (document.getElementById('onbNameInput').value || '').trim() || 'Сотрудник';
  const phoneVal = (document.getElementById('onbPhoneInput')?.value || '').trim();
  const emailVal = (document.getElementById('onbEmailInput')?.value || '').trim();
  const passVal = (document.getElementById('onbPasswordInput')?.value || '').trim();
  const divVal = window.state.userDivision || 'Санта Ритейл';
  const storeVal = (document.getElementById('onbFavStoreInput').value || '').trim() || window.state.currentStoreName || 'Санта • Минск, пр. Победителей, 65';
  const roleVal = window.state.userRole || 'Наблюдатель';

  if (!viaFaceId) {
    if (!passVal) {
      showOnbPasswordError('Установите пароль, чтобы защитить вход в приложение!');
      return;
    }
    window.state.userPassword = passVal;
  } else if (passVal) {
    window.state.userPassword = passVal;
  } else if (!window.state.userPassword) {
    window.state.userPassword = 'faceid_user';
  }

  window.state.userName = nameVal;
  window.state.userPhone = phoneVal;
  window.state.userEmail = emailVal;
  if (viaFaceId) window.state.faceIdEnabled = true;
  window.state.userDivision = divVal;
  window.state.userRole = roleVal;
  window.state.favoriteStore = storeVal;
  window.state.currentStoreName = storeVal;
  window.state.onboarded = true;
  window.isSessionAuthenticated = true;
  window.isEditingProfileMode = false;
  try { localStorage.setItem('santa_session_logged_in', 'true'); } catch (e) {}

  clearOnbPasswordError();
  saveState();
  syncWithServer({});
  document.getElementById('onboardingModal').classList.add('hidden');
  updateAllUI();
  playSound('success');
  showToast(
    viaFaceId ? `Вход по Face ID: ${window.state.userName}` : `Вход выполнен: ${window.state.userName}`,
    `${window.state.userRole} • ${window.state.userDivision}`,
    'success'
  );
};

// --- МОДАЛЬНОЕ ОКНО ПОДЕЛИТЬСЯ / QR-КОД ДЛЯ ДИРЕКТОРА ---
window.openShareModal = function () {
  const modal = document.getElementById('shareDirectorModal');
  const urlInput = document.getElementById('shareAppUrlInput');
  const qrImg = document.getElementById('shareQrCodeImg');
  let shareUrl = window.location.href;

  if (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.serverMeta &&
    window.serverMeta.ips &&
    window.serverMeta.ips.length > 0
  ) {
    shareUrl = `http://${window.serverMeta.ips[0]}:${window.serverMeta.port || 3000}`;
  }

  if (urlInput) urlInput.value = shareUrl;
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(shareUrl)}`;
  }
  modal.classList.remove('hidden');
};

window.updateShareQrFromInput = function () {
  const urlInput = document.getElementById('shareAppUrlInput');
  const qrImg = document.getElementById('shareQrCodeImg');
  if (urlInput && qrImg && urlInput.value.trim()) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(urlInput.value.trim())}`;
  }
};

window.copyShareLink = function () {
  const urlInput = document.getElementById('shareAppUrlInput');
  if (!urlInput) return;
  navigator.clipboard.writeText(urlInput.value).then(() => {
    playSound('success');
    showToast('Ссылка скопирована!', 'Отправьте ее директору в Telegram/Viber или покажите QR-код.', 'success');
  }).catch(() => {});
};

window.closeShareModal = function () {
  window.smoothCloseModal('shareDirectorModal');
};

// Toast helper
let toastTimer = null;
function showToast(title, message, type) {
  const toast = document.getElementById('toastNotification');
  const iconBox = document.getElementById('toastIconBox');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMessage').textContent = message;

  if (type === 'error') {
    iconBox.className = 'w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 text-base';
    iconBox.innerHTML = '<i class="fa-solid fa-ban"></i>';
  } else if (type === 'gold') {
    iconBox.className = 'w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 text-base';
    iconBox.innerHTML = '<i class="fa-solid fa-crown"></i>';
  } else if (type === 'info') {
    iconBox.className = 'w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 text-base';
    iconBox.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
  } else {
    iconBox.className = 'w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-base';
    iconBox.innerHTML = '<i class="fa-solid fa-check"></i>';
  }

  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
};

// Wide Mode toggle
let isWide = false;
window.toggleWideMode = function () {
  isWide = !isWide;
  const shell = document.getElementById('appShell');
  const toolbar = document.getElementById('desktopToolbar');
  const btn = document.getElementById('wideModeBtn');
  if (isWide) {
    shell.classList.remove('sm:max-w-[440px]');
    shell.classList.add('sm:max-w-[760px]');
    toolbar.classList.remove('max-w-[440px]');
    toolbar.classList.add('max-w-[760px]');
    btn.innerHTML = '<i class="fa-solid fa-mobile-screen"></i><span>Узкий</span>';
  } else {
    shell.classList.add('sm:max-w-[440px]');
    shell.classList.remove('sm:max-w-[760px]');
    toolbar.classList.add('max-w-[440px]');
    toolbar.classList.remove('max-w-[760px]');
    btn.innerHTML = '<i class="fa-solid fa-expand"></i><span>Шире</span>';
  }
};

function startCountdownTimer() {
  let secondsLeft = (2 * 86400) + (8 * 3600) + (41 * 60) + 19;
  setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    const d = Math.floor(secondsLeft / 86400);
    const h = Math.floor((secondsLeft % 86400) / 3600);
    const m = Math.floor((secondsLeft % 3600) / 60);
    const s = secondsLeft % 60;
    const el = document.getElementById('seasonCountdown');
    if (el) {
      el.textContent = `${String(d).padStart(2, '0')}д : ${String(h).padStart(2, '0')}ч : ${String(m).padStart(2, '0')}м : ${String(s).padStart(2, '0')}с`;
    }
  }, 1000);
}

document.addEventListener('click', function (e) {
  const sugg = document.getElementById('onbStoreSuggestions');
  const inp = document.getElementById('onbFavStoreInput');
  if (sugg && inp && !sugg.contains(e.target) && e.target !== inp) {
    sugg.classList.add('hidden');
  }
});

// --- ЗАСТАВКА НА ОРИГИНАЛЬНОМ ЦВЕТЕ САНТЫ (#009FE3) И ПЕРЕКЛЮЧАТЕЛЬ НАЗВАНИЯ ---
function playSplashScreen(forcedName) {
  if (forcedName) {
    window.state.appTitleMode = forcedName;
    saveState();
    updateAllUI();
  }
  const splash = document.getElementById('santaSplashScreen');
  const bar = document.getElementById('splashProgressBar');
  const titleEl = document.getElementById('splashAppTitle');
  if (!splash) return;

  if (titleEl) titleEl.textContent = window.state.appTitleMode || 'Скажи Санте';
  splash.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
  splash.classList.add('opacity-100');
  if (bar) {
    bar.style.width = '0%';
    setTimeout(() => { bar.style.width = '100%'; }, 40);
  }

  setTimeout(() => {
    splash.classList.remove('opacity-100');
    splash.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
      splash.classList.add('hidden');
    }, 380);
  }, 1250);
};

window.toggleAppTitleName = function () {
  window.state.appTitleMode = (window.state.appTitleMode === 'Санта.Радар')
    ? 'Скажи Санте'
    : 'Санта.Радар';
  saveState();
  updateAllUI();
  playSplashScreen();
};

window.logoutUser = function () {
  try {
    localStorage.removeItem('santa_session_logged_in');
    sessionStorage.removeItem('santa_session_logged_in');
  } catch (e) {}
  window.isSessionAuthenticated = false;
  window.smoothCloseModal('settingsModal');
  setTimeout(() => {
    openOnboardingModal(false);
  }, 250);
  showToast('Вы вышли из профиля', 'Введите пароль или войдите под другим аккаунтом', 'info');
};

window.addEventListener('DOMContentLoaded', function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  let isAuthed = false;
  try {
    isAuthed = localStorage.getItem('santa_session_logged_in') === 'true';
  } catch (e) {
    isAuthed = false;
  }
  window.isSessionAuthenticated = isAuthed;
  updateAllUI();
  selectBrand(window.state.activeBrand || 'santa');
  backToBrandsHub(true);
  playSplashScreen();

  if (!isAuthed) {
    setTimeout(() => {
      openOnboardingModal(false);
    }, 1100);
  }

  startCountdownTimer();
  initCloudRealtimeSync();
  pollServerState();
  setInterval(pollServerState, 4000);
});


// Top-level global exports for hoisted functions
window.updateAllUI = updateAllUI;
window.renderBrandChecklists = renderBrandChecklists;
window.backToBrandsHub = backToBrandsHub;
window.switchMainTab = switchMainTab;
window.showToast = showToast;
window.syncSettingsUI = syncSettingsUI;
window.renderMissionsTab = renderMissionsTab;
window.renderStopListTab = renderStopListTab;
window.renderLeaderboardTab = renderLeaderboardTab;
window.renderHistoryList = renderHistoryList;
window.openIssueReportModal = openIssueReportModal;
window.closeReportModal = closeReportModal;
window.openOnboardingModal = openOnboardingModal;
window.closeLightResetModal = closeLightResetModal;
window.closeDeleteProfileModal = closeDeleteProfileModal;
window.openRecallBanner = openRecallBanner;
window.closeRecallBanner = closeRecallBanner;
window.backToMissionsHub = backToMissionsHub;
window.openMissionsDifficultyPage = openMissionsDifficultyPage;
window.playSplashScreen = playSplashScreen;
window.toggleCategoryAccordion = toggleCategoryAccordion;
window.selectBrand = selectBrand;
window.saveState = saveState;

window.openBrandClaimsPage = openBrandClaimsPage;
window.openExpressReportModal = openExpressReportModal;
window.submitExpressReport = submitExpressReport;
window.navigateHomeFull = navigateHomeFull;
window.logoutUser = logoutUser;