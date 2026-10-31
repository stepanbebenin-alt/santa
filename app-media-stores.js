// ============================================================================
// МОДУЛЬ 1: РЕАЛЬНАЯ КАМЕРА (WEBRTC + CANVAS ВОДЯНОЙ ЗНАК + НАТИВНАЯ КАМЕРА iOS/ANDROID),
//           РЕАЛЬНЫЙ СКАНЕР ШТРИХКОДОВ, РЕАЛЬНЫЙ ГОЛОСОВОЙ ВВОД (SPEECH-TO-TEXT + АУДИО),
//           И ПОИСК ВСЕХ МАГАЗИНОВ БЕЛАРУСИ (ВКЛЮЧАЯ ДЕРЕВНИ, АГРОГОРОДКИ И СЕЛЬМАГИ)
// ============================================================================

// --- ЗВУКОВОЙ СИНТЕЗАТОР (Web Audio API) ---
window.soundEnabled = true;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

window.playSound = function (type) {
  // Виброотклик на смартфоне (если включен в настройках)
  try {
    const vibOn = window.state ? window.state.vibrationEnabled !== false : true;
    if (vibOn && navigator.vibrate) {
      navigator.vibrate(type === 'alarm' || type === 'error' ? [45, 30, 45] : 25);
    }
  } catch (e) {}

  const sndOn = window.state ? window.state.soundEnabled !== false : window.soundEnabled;
  if (!sndOn) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'error') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(120, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === 'alarm') {
      [0, 0.16, 0.32].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(920, now + offset);
        osc.frequency.setValueAtTime(680, now + offset + 0.07);
        gain.gain.setValueAtTime(0.14, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.14);
      });
    } else if (type === 'fanfare') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.15, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.3);
      });
    }
  } catch (e) {}
};

window.toggleSound = function () {
  window.soundEnabled = !window.soundEnabled;
  if (window.state) {
    window.state.soundEnabled = window.soundEnabled;
    if (typeof window.saveState === 'function') window.saveState();
  }
  const icon = document.getElementById('soundIcon');
  if (icon) {
    icon.className = window.soundEnabled
      ? 'fa-solid fa-volume-high text-emerald-400'
      : 'fa-solid fa-volume-xmark text-slate-500';
  }
  if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
  if (window.soundEnabled) playSound('success');
};

// ============================================================================
// ПОИСК МАГАЗИНОВ ПО ВСЕЙ БЕЛАРУСИ (ГОРОДА, РАЙЦЕНТРЫ, Г.П., АГРОГОРОДКИ, ДЕРЕВНИ)
// + LIVE OPENSTREETMAP OVERPASS API (ПО GPS) + NOMINATIM API (ПО ТЕКСТУ)
// ============================================================================
window.selectedRegionFilter = 'all';
let nominatimTimer = null;

window.calcDistanceMeters = function (lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

window.formatDistance = function (meters) {
  if (meters < 1000) return `${meters} м`;
  return `${(meters / 1000).toFixed(1)} км`;
};

window.highlightMatch = function (text, query) {
  if (!query) return text;
  const words = query.trim().split(/\s+/).filter(Boolean);
  let out = text;
  words.forEach(w => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-amber-200 text-slate-950 rounded px-0.5 font-extrabold">$1</mark>');
  });
  return out;
};

window.setStoreRegionFilter = function (region, context) {
  window.selectedRegionFilter = region;
  document.querySelectorAll('.region-filter-pill').forEach(btn => {
    if (btn.getAttribute('data-reg') === region) {
      btn.className = 'region-filter-pill shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-blue-600 text-white shadow-sm transition';
    } else {
      btn.className = 'region-filter-pill shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition';
    }
  });
  const inp = document.getElementById(context === 'onb' ? 'onbFavStoreInput' : 'switcherStoreInput');
  handleStoreAutocomplete(context, inp ? inp.value : '');
};

window.getCombinedStoresPool = function () {
  const custom = (window.state && Array.isArray(window.state.customStores)) ? window.state.customStores : [];
  return [...custom, ...(window.ALL_BELARUS_STORES || [])];
};

window.handleStoreAutocomplete = function (context, rawValue) {
  const query = (rawValue || '').trim();
  const isOnb = context === 'onb';
  const clearBtn = document.getElementById(isOnb ? 'onbClearStoreBtn' : 'switcherClearStoreBtn');
  const box = document.getElementById(isOnb ? 'onbStoreSuggestions' : 'switcherStoreSuggestions');

  if (clearBtn) {
    if (query.length > 0) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  if (isOnb && typeof validateOnboardingButton === 'function') {
    validateOnboardingButton();
  }

  const pool = getCombinedStoresPool();
  const regFilter = window.selectedRegionFilter || 'all';
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  let matched = pool.filter(s => {
    if (! isOnb && regFilter !== 'all') {
      if (regFilter === 'rural') {
        const isRural = s.name.includes('аг.') || s.name.includes('д.') || s.name.includes('г.п.') || s.name.includes('Сельмаг') || s.name.includes('Родны Кут');
        if (!isRural) return false;
      } else if (s.region !== regFilter) {
        return false;
      }
    }
    if (words.length === 0) return true;
    const hay = `${s.name} ${s.chain} ${s.city} ${s.region || ''}`.toLowerCase();
    return words.every(w => hay.includes(w));
  }).slice(0, 25);

  // Если пользователь вводит название любой малой деревни / улицы, генерируем также деревенские форматы магазинов РБ
  const dynamicVillage = (query.length >= 2 && matched.length < 6)
    ? window.buildDynamicVillageStores(query)
    : [];

  renderStoreSuggestionItems(context, matched, query, [], dynamicVillage);
  if (box) box.classList.remove('hidden');

  // Параллельный живой поиск по OpenStreetMap Nominatim (все деревни, улицы и магазины Беларуси)
  if (nominatimTimer) clearTimeout(nominatimTimer);
  if (query.length >= 2) {
    nominatimTimer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=by&limit=12&accept-language=ru&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const osmItems = [];
        (data || []).forEach(item => {
          const addr = item.address || {};
          const settlement = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.county || 'Беларусь';
          const road = addr.road ? `, ${addr.road}${addr.house_number ? ' ' + addr.house_number : ''}` : '';
          const rawName = item.name || item.display_name.split(',')[0];
          const isPlace = item.class === 'place' || item.type === 'village' || item.type === 'hamlet' || item.type === 'town' || item.type === 'administrative';

          if (isPlace) {
            // Если найдена реальная деревня/агрогородок/поселок в OSM — сразу предлагаем магазины в этом населенном пункте!
            const locLabel = `${rawName}${addr.county ? ' (' + addr.county + ')' : ''}`;
            osmItems.push(
              {
                chain: 'Родны Кут / Сельмаг',
                badge: 'bg-red-100 text-red-800',
                city: settlement,
                name: `Магазин «Родны Кут» / Сельмаг Райпо, ${locLabel}`,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon)
              },
              {
                chain: 'Санта / Продукты',
                badge: 'bg-sky-100 text-sky-800',
                city: settlement,
                name: `Магазин «Санта» / Продукты, ${locLabel}`,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon)
              },
              {
                chain: 'Евроопт / Копеечка',
                badge: 'bg-lime-100 text-lime-800',
                city: settlement,
                name: `Евроопт / Копеечка, ${locLabel}`,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon)
              }
            );
          } else {
            osmItems.push({
              chain: item.class === 'shop' ? 'Магазин РБ (OSM)' : 'Адрес РБ',
              badge: 'bg-emerald-100 text-emerald-800',
              city: settlement,
              name: `${rawName}, ${settlement}${road}`,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon)
            });
          }
        });
        renderStoreSuggestionItems(context, matched, query, osmItems, dynamicVillage);
      } catch (e) {}
    }, 280);
  }
};

window.renderStoreSuggestionItems = function (context, localList, query, osmList, dynamicList) {
  const isOnb = context === 'onb';
  const box = document.getElementById(isOnb ? 'onbStoreSuggestions' : 'switcherStoreSuggestions');
  if (!box) return;

  const seen = new Set();
  const combined = [];
  [...localList, ...(osmList || []), ...(dynamicList || [])].forEach(item => {
    if (!seen.has(item.name)) {
      seen.add(item.name);
      combined.push(item);
    }
  });

  let html = '';

  // Всегда даем возможность одним кликом добавить любой введенный вручную деревенский или городской магазин
  if (query.length >= 2) {
    const safeCustom = query.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    html += `
      <button type="button" onclick="addAndPickCustomStore('${context}', '${safeCustom}')" class="w-full p-2.5 px-3 text-left bg-blue-50/70 hover:bg-blue-100/80 transition flex items-center justify-between gap-2 border-b border-blue-200">
        <div>
          <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-600 text-white">+ Добавить свой магазин / деревню</span>
          <div class="text-xs font-extrabold text-blue-950 mt-0.5">Выбрать и сохранить: «${query}»</div>
        </div>
        <i class="fa-solid fa-plus-circle text-blue-600 text-sm shrink-0"></i>
      </button>
    `;
  }

  html += combined.slice(0, 30).map(s => {
    const safeName = s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `
      <button type="button" onclick="pickStoreFromSuggestion('${context}', '${safeName}', ${s.lat || 53.9}, ${s.lng || 27.5})" class="w-full p-2.5 px-3 text-left hover:bg-blue-50/80 transition flex items-center justify-between gap-2">
        <div class="overflow-hidden">
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${s.badge || 'bg-slate-200 text-slate-800'}">${s.chain}</span>
            <span class="text-[10px] font-semibold text-slate-400">${s.city || 'РБ'}</span>
          </div>
          <div class="text-xs font-semibold text-slate-800 truncate mt-0.5">
            ${highlightMatch(s.name, query)}
          </div>
        </div>
        <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 shrink-0"></i>
      </button>
    `;
  }).join('');

  box.innerHTML = html;
};

window.addAndPickCustomStore = function (context, customName) {
  const newStore = {
    chain: 'Магазин РБ',
    badge: 'bg-indigo-100 text-indigo-800',
    region: 'Беларусь',
    city: 'Свой адрес',
    name: customName,
    lat: window.state.lastGpsLat || 53.9,
    lng: window.state.lastGpsLng || 27.5
  };
  if (!Array.isArray(window.state.customStores)) window.state.customStores = [];
  if (!window.state.customStores.some(s => s.name === customName)) {
    window.state.customStores.unshift(newStore);
  }
  if (typeof syncWithServer === 'function') {
    syncWithServer({ newCustomStore: newStore });
  }
  pickStoreFromSuggestion(context, customName, newStore.lat, newStore.lng);
};

window.openExternalMapSearch = function (provider, customQuery) {
  const swInput = document.getElementById('switcherStoreSearchInput');
  const onbInput = document.getElementById('onbFavStoreInput');
  const rawQuery = customQuery || (swInput && swInput.value.trim()) || (onbInput && onbInput.value.trim()) || window.state.favoriteStore || 'Магазин Санта Беларусь';
  const searchQuery = rawQuery.toLowerCase().includes('беларусь') ? rawQuery : `Беларусь, ${rawQuery}`;
  const encoded = encodeURIComponent(searchQuery);

  const url = provider === 'google'
    ? `https://www.google.com/maps/search/?api=1&query=${encoded}`
    : `https://yandex.by/maps/?text=${encoded}`;

  window.open(url, '_blank', 'noopener,noreferrer');
  if (typeof showToast === 'function') {
    showToast(
      provider === 'google' ? 'Открыты Google Карты' : 'Открыты Яндекс Карты',
      `Поиск: «${rawQuery}». Скопируйте или введите найденный адрес в поле выше, чтобы добавить магазин.`
    );
  }
};

window.pickStoreFromSuggestion = function (context, storeName, lat, lng) {
  if (lat && lng) {
    window.state.lastGpsLat = lat;
    window.state.lastGpsLng = lng;
  }
  if (context === 'onb') {
    const inp = document.getElementById('onbFavStoreInput');
    if (inp) inp.value = storeName;
    const clr = document.getElementById('onbClearStoreBtn');
    if (clr) clr.classList.remove('hidden');
    const sugg = document.getElementById('onbStoreSuggestions');
    if (sugg) sugg.classList.add('hidden');
    if (typeof validateOnboardingButton === 'function') validateOnboardingButton();
    playSound('success');
  } else {
    window.state.favoriteStore = storeName;
    window.state.currentStoreName = storeName;
    if (window.state.favMissionStatus === 'completed') {
      window.state.favMissionStatus = 'available';
    }
    saveState();
    if (typeof syncWithServer === 'function') {
      syncWithServer({});
    }
    closeStoreSwitcherModal();
    updateAllUI();
    playSound('success');
    showToast('Любимый магазин обновлен', `${storeName} (обновлен в профиле и миссиях)`, 'info');
  }
};

window.clearStoreInput = function (context) {
  const isOnb = context === 'onb';
  const inp = document.getElementById(isOnb ? 'onbFavStoreInput' : 'switcherStoreInput');
  const clr = document.getElementById(isOnb ? 'onbClearStoreBtn' : 'switcherClearStoreBtn');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  if (clr) clr.classList.add('hidden');
  handleStoreAutocomplete(context, '');
};

// РЕАЛЬНЫЙ GPS-ПОИСК БЛИЖАЙШИХ МАГАЗИНОВ (HTML5 Geolocation + OpenStreetMap Overpass API + База РБ)
window.detectStoresByGps = function (context) {
  const box = document.getElementById(context === 'onb' ? 'onbGpsNearestBox' : 'switcherGpsNearestBox');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="flex items-center gap-2 text-emerald-800 font-bold text-[11px] p-1">
      <i class="fa-solid fa-satellite-dish animate-spin text-emerald-600"></i>
      <span>Запрашиваем точные GPS-координаты телефона и ищем магазины вокруг вас...</span>
    </div>
  `;

  if (!navigator.geolocation) {
    fallbackGpsLookup(context, 53.9022, 27.5501, 'Геолокация недоступна в браузере — показан центр РБ');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const uLat = pos.coords.latitude;
      const uLng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy || 12);
      window.state.lastGpsLat = uLat;
      window.state.lastGpsLng = uLng;

      // Ищем реальные магазины вокруг координат через OpenStreetMap Overpass API + Nominatim Reverse
      let osmShops = [];
      let placeName = `${uLat.toFixed(4)}, ${uLng.toFixed(4)} (±${acc}м)`;

      try {
        const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${uLat}&lon=${uLng}&accept-language=ru`);
        if (revRes.ok) {
          const revData = await revRes.json();
          if (revData && revData.address) {
            const a = revData.address;
            const loc = a.city || a.town || a.village || a.hamlet || a.county || '';
            const rd = a.road ? `, ${a.road}${a.house_number ? ' ' + a.house_number : ''}` : '';
            if (loc) placeName = `${loc}${rd} (±${acc}м)`;
          }
        }
      } catch (e) {}

      try {
        const overpassQuery = `[out:json][timeout:6];(node["shop"](around:3500,${uLat},${uLng});way["shop"](around:3500,${uLat},${uLng});node["amenity"~"restaurant|cafe"](around:2500,${uLat},${uLng}););out center 15;`;
        const ovRes = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
        if (ovRes.ok) {
          const ovData = await ovRes.json();
          osmShops = (ovData.elements || []).map(el => {
            const tags = el.tags || {};
            const sLat = el.lat || (el.center && el.center.lat) || uLat;
            const sLng = el.lon || (el.center && el.center.lon) || uLng;
            const shopTitle = tags.name || tags['name:ru'] || tags.brand || (tags.shop === 'convenience' ? 'Магазин «Продукты» / Сельмаг' : tags.shop === 'supermarket' ? 'Супермаркет' : 'Торговая точка');
            const street = tags['addr:street'] ? `, ${tags['addr:street']}${tags['addr:housenumber'] ? ', ' + tags['addr:housenumber'] : ''}` : '';
            const city = tags['addr:city'] || tags['addr:place'] || '';
            const fullLabel = `${shopTitle}${city ? ', ' + city : ''}${street}`;
            return {
              chain: tags.brand || (tags.amenity ? 'Кафе/Ресторан' : 'Магазин по GPS'),
              badge: 'bg-emerald-100 text-emerald-800',
              city: city || 'Рядом с вами',
              name: fullLabel,
              lat: sLat,
              lng: sLng,
              dist: calcDistanceMeters(uLat, uLng, sLat, sLng)
            };
          });
        }
      } catch (e) {}

      renderNearestStoresList(context, uLat, uLng, `Точный GPS: ${placeName}`, osmShops);
    },
    err => {
      let reason = 'Разрешите доступ к Геопозиции в браузере (показаны ближайшие точки РБ)';
      if (err.code === 1) reason = 'Доступ к GPS отклонен — разрешите геолокацию в настройках браузера';
      fallbackGpsLookup(context, window.state.lastGpsLat || 53.9022, window.state.lastGpsLng || 27.5501, reason);
    },
    { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 }
  );
};

function fallbackGpsLookup(context, lat, lng, label) {
  renderNearestStoresList(context, lat, lng, label, []);
}

window.renderNearestStoresList = function (context, lat, lng, sourceLabel, liveOsmShops) {
  const box = document.getElementById(context === 'onb' ? 'onbGpsNearestBox' : 'switcherGpsNearestBox');
  if (!box) return;

  const pool = getCombinedStoresPool();
  const localWithDist = pool.map(s => ({
    ...s,
    dist: calcDistanceMeters(lat, lng, s.lat, s.lng)
  }));

  const merged = [...(liveOsmShops || []), ...localWithDist]
    .sort((a, b) => a.dist - b.dist);

  const unique = [];
  const seen = new Set();
  for (const item of merged) {
    if (!seen.has(item.name)) {
      seen.add(item.name);
      unique.push(item);
    }
    if (unique.length >= 6) break;
  }

  playSound('success');
  box.innerHTML = `
    <div class="flex items-center justify-between text-[10px] font-extrabold text-emerald-900 mb-1">
      <span class="truncate"><i class="fa-solid fa-location-dot text-emerald-600 mr-1"></i>${sourceLabel}</span>
    </div>
    <div class="space-y-1">
      ${unique.map(s => {
        const safeName = s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
          <button type="button" onclick="pickStoreFromSuggestion('${context}', '${safeName}', ${s.lat}, ${s.lng})" class="w-full p-2 rounded-xl bg-white hover:bg-emerald-100/70 border border-emerald-200/80 text-left flex items-center justify-between gap-2 transition">
            <div class="overflow-hidden">
              <div class="flex items-center gap-1.5">
                <span class="px-1.5 py-0.2 rounded text-[9px] font-black ${s.badge || 'bg-emerald-100 text-emerald-800'}">${s.chain}</span>
                <span class="text-[11px] font-bold text-slate-800 truncate">${s.name}</span>
              </div>
            </div>
            <span class="shrink-0 px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-black text-[10px]">
              ${formatDistance(s.dist)}
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;
};
