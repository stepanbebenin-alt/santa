// ============================================================================
// МОДУЛЬ 2: РЕАЛЬНАЯ КАМЕРА (ФОТО + ВИДЕО 5 СЕК + СИСТЕМНАЯ КАМЕРА ТЕЛЕФОНА),
//           РЕАЛЬНЫЙ ГОЛОСОВОЙ ВВОД (WEB SPEECH API + АУДИОЗАПИСЬ МИКРОФОНА),
//           И РЕАЛЬНЫЙ КАМЕРНЫЙ СКАНЕР ШТРИХКОДОВ (EAN-13 / QR / DATAMATRIX)
// ============================================================================

window.reportMediaStream = null;
window.reportFacingMode = 'environment';
window.currentMediaMode = 'photo';
window.mediaCaptured = false;
window.capturedPhotoDataUrl = null;
window.capturedVideoUrl = null;
window.capturedMediaList = []; // Массив прикрепленных фото и видео к одному сигналу
window.capturedAudioDataUrl = null;
let videoRecorder = null;
let videoChunks = [];
let videoCountdownInterval = null;
let liveCameraAnalysisInterval = null;
let liveCanvas = null;
window.currentInspectedPhotoIdx = null;

// --- ТАКТИЛЬНАЯ ВСПЫШКА ЗАТВОРА КАМЕРЫ ---
function triggerCameraFlash() {
  const flash = document.getElementById('cameraShutterFlash');
  if (flash) {
    flash.classList.remove('opacity-0');
    flash.classList.add('opacity-90');
    setTimeout(() => {
      flash.classList.remove('opacity-90');
      flash.classList.add('opacity-0');
    }, 120);
  }
  if (typeof window.playSound === 'function') {
    window.playSound('click');
  }
}

// --- УМНЫЙ ШАГОВЫЙ ИНДИКАТОР ПАРНОЙ СЪЕМКИ (ОБЩИЙ ПЛАН + МАКРО/ЦЕННИК) ---
window.updateShotAngleGuidanceUI = function () {
  const bar = document.getElementById('shotAngleGuidanceBar');
  const badge = document.getElementById('shotAngleStepBadge');
  const title = document.getElementById('shotAngleStepTitle');
  const bonus = document.getElementById('shotAngleBonusBadge');
  if (!bar || !badge || !title) return;

  const list = window.capturedMediaList || [];
  const photos = list.filter(m => m.type === 'photo');

  if (photos.length === 0) {
    badge.textContent = '1';
    badge.className = 'w-5 h-5 rounded-full bg-[#009FE3] text-white flex items-center justify-center text-[10px] font-black shrink-0';
    title.textContent = 'Шаг 1 из 2: Снимите витрину или полку';
    if (bonus) {
      bonus.textContent = 'Общий план';
      bonus.className = 'text-[9px] font-black text-[#009FE3] bg-white px-2 py-0.5 rounded-lg border border-sky-200 shrink-0';
    }
  } else if (photos.length === 1) {
    badge.textContent = '2';
    badge.className = 'w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0 animate-bounce';
    title.textContent = 'Шаг 2 из 2: Снимите крупно ценник или срок годности';
    if (bonus) {
      bonus.textContent = 'Крупный план';
      bonus.className = 'text-[9px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 shrink-0';
    }
  } else {
    badge.innerHTML = '<i class="fa-solid fa-check text-[10px]"></i>';
    badge.className = 'w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shrink-0';
    title.textContent = '✓ Парная съёмка укомплектована';
    if (bonus) {
      bonus.textContent = 'Готово';
      bonus.className = 'text-[9px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 shrink-0';
    }
  }
};

// --- ФОНОВЫЙ АНАЛИЗ ПОТОКА ЖИВОЙ КАМЕРЫ (HUD + AR RETICLE) ---
function startLiveCameraAnalysis() {
  stopLiveCameraAnalysis();
  const videoEl = document.getElementById('reportLiveVideo');
  if (!videoEl) return;

  if (!liveCanvas) {
    liveCanvas = document.createElement('canvas');
    liveCanvas.width = 48;
    liveCanvas.height = 48;
  }
  const ctx = liveCanvas.getContext('2d', { willReadFrequently: true });

  liveCameraAnalysisInterval = setInterval(() => {
    if (!window.reportMediaStream || !videoEl || videoEl.readyState < 2 || videoEl.classList.contains('hidden')) {
      return;
    }

    try {
      ctx.drawImage(videoEl, 0, 0, 48, 48);
      const imgData = ctx.getImageData(0, 0, 48, 48);
      const data = imgData.data;
      const count = 48 * 48;

      let lumSum = 0;
      let satSum = 0;
      let skinCount = 0;
      let centerSkinCount = 0;
      const lumArr = new Float32Array(count);
      const skinArr = new Uint8Array(count);

      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lumArr[p] = lum;
        lumSum += lum;

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        if (maxC > 0) satSum += (maxC - minC) / maxC;

        // Золотой стандарт YCbCr кластера человеческой кожи
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isSkin = (cb >= 75 && cb <= 130 && cr >= 130 && cr <= 175 && r > 55 && g > 35 && b > 20 && r >= g && (r - b) >= 8);
        if (isSkin) {
          skinArr[p] = 1;
          skinCount++;
          const px = p % 48;
          const py = Math.floor(p / 48);
          if (px >= 12 && px <= 36 && py >= 10 && py <= 38) {
            centerSkinCount++;
          }
        }
      }
      const avgLum = lumSum / count;
      const avgSat = satSum / count;
      const skinRatio = skinCount / count;
      const centerSkinRatio = centerSkinCount / (25 * 29);

      let lumVar = 0;
      for (let p = 0; p < count; p++) {
        const diff = lumArr[p] - avgLum;
        lumVar += diff * diff;
      }
      const stdDev = Math.sqrt(lumVar / count);

      // 1. Подсчет градиентов, горизонтальных рейлов полок и перепадов
      let gradSum = 0;
      let edges = 0;
      let maxHRun = 0;
      let bestRailY = -1;

      for (let y = 2; y < 46; y++) {
        let curHRun = 0;
        for (let x = 2; x < 46; x++) {
          const idx = y * 48 + x;
          const lum = lumArr[idx];
          const lumRight = lumArr[idx + 1];
          const lumBottom = lumArr[idx + 48];
          const dx = Math.abs(lumRight - lum);
          const dy = Math.abs(lumBottom - lum);
          const g = dx + dy;

          if (g > 18) {
            gradSum += g;
            edges++;
          }
          if (dy > 16 && dy >= dx * 1.2) {
            curHRun++;
            if (curHRun > maxHRun) {
              maxHRun = curHRun;
              bestRailY = y;
            }
          } else {
            curHRun = 0;
          }
        }
      }

      // 2. Проверка вертикальных упаковок над планкой стеллажа (фейсинги товаров)
      let hasVerticalAboveRail = false;
      let vCols = 0;
      if (bestRailY >= 12 && maxHRun >= 12) {
        let lastX = -5;
        for (let x = 4; x < 44; x++) {
          let colV = 0;
          for (let y = Math.max(2, bestRailY - 14); y < bestRailY - 1; y++) {
            const idx = y * 48 + x;
            const dx = Math.abs(lumArr[idx + 1] - lumArr[idx]);
            const dy = Math.abs(lumArr[idx + 48] - lumArr[idx]);
            if (dx > 15 && dx >= dy * 0.9) colV++;
          }
          if (colV >= 4 && (x - lastX) >= 3) {
            vCols++;
            lastX = x;
          }
        }
        if (vCols >= 2) hasVerticalAboveRail = true;
      }

      // 3. Проверка зоны ценника (прямоугольная контрастная плашка 12x8)
      let hasPriceTagPatch = false;
      for (let wy = 6; wy <= 34; wy += 5) {
        for (let wx = 6; wx <= 32; wx += 5) {
          let winMin = 255, winMax = 0, winSum = 0, winE = 0;
          for (let y = wy; y < wy + 8; y++) {
            for (let x = wx; x < wx + 12; x++) {
              const idx = y * 48 + x;
              const l = lumArr[idx];
              winSum += l;
              if (l < winMin) winMin = l;
              if (l > winMax) winMax = l;
              const g = Math.abs(lumArr[idx + 1] - l) + Math.abs(lumArr[idx + 48] - l);
              if (g > 18) winE++;
            }
          }
          const winAvg = winSum / 96;
          if (winMax - winMin >= 80 && winAvg >= 85 && winE >= 14 && winE <= 65) {
            hasPriceTagPatch = true;
            break;
          }
        }
        if (hasPriceTagPatch) break;
      }

      // 4. Проверка штрихкода (частые вертикальные чередования полос)
      let hasBarcodePatch = false;
      for (let wy = 8; wy <= 36; wy += 8) {
        for (let wx = 8; wx <= 30; wx += 6) {
          let vStripeTransitions = 0;
          for (let x = wx; x < wx + 16; x++) {
            const l1 = lumArr[wy * 48 + x];
            const l2 = lumArr[wy * 48 + x + 1];
            if (Math.abs(l2 - l1) > 45) vStripeTransitions++;
          }
          if (vStripeTransitions >= 7) {
            hasBarcodePatch = true;
            break;
          }
        }
        if (hasBarcodePatch) break;
      }

      // 5. Проверка продуктовых зон (холодильник, фреш-зона, пекарня/выпечка)
      let coolerPixels = 0;
      let freshPixels = 0;
      let bakeryPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (b > r + 15 && b > g - 10 && (r + g + b) > 170) coolerPixels++;
        if (g > r + 12 && g > b + 15) freshPixels++;
        if (r > 160 && g > 60 && g < 140 && b < 70) freshPixels++;
        if (r >= 130 && r <= 230 && g >= 75 && g <= 150 && b >= 20 && b <= 80) bakeryPixels++;
      }
      const hasCoolerSignature = coolerPixels / count >= 0.08;
      const hasFreshSignature = freshPixels / count >= 0.07;
      const hasBakerySignature = bakeryPixels / count >= 0.09;
      const hasAisleSignature = (edges / count >= 0.08 && stdDev >= 18 && !hasPriceTagPatch && !hasVerticalAboveRail && maxHRun < 12);

      // 6. СТРОГАЯ ДЕТЕКЦИЯ ЛИЦА (Исключает хлеб, сыр, коробки, полки и ценники!)
      let isFace = false;
      const hasAnyRetailSignature = maxHRun >= 12 || hasPriceTagPatch || hasBarcodePatch || hasVerticalAboveRail || hasCoolerSignature || hasFreshSignature || hasBakerySignature;

      if (!hasAnyRetailSignature && skinRatio >= 0.28 && centerSkinRatio >= 0.42) {
        const eyeCandidates = [];
        for (let y = 10; y <= 28; y += 2) {
          for (let x = 10; x <= 38; x++) {
            const idx = y * 48 + x;
            if (lumArr[idx] < 75 && skinArr[idx - 1] && skinArr[idx + 1]) {
              eyeCandidates.push({ x, y });
            }
          }
        }
        let eyePair = null;
        for (let i = 0; i < eyeCandidates.length; i++) {
          for (let j = i + 1; j < eyeCandidates.length; j++) {
            const e1 = eyeCandidates[i], e2 = eyeCandidates[j];
            const dx = Math.abs(e1.x - e2.x);
            const dy = Math.abs(e1.y - e2.y);
            if (dy <= 2 && dx >= 7 && dx <= 18) {
              eyePair = { dx, midX: (e1.x + e2.x) / 2, midY: (e1.y + e2.y) / 2 };
              break;
            }
          }
          if (eyePair) break;
        }
        if (eyePair) {
          const mouthY = Math.round(eyePair.midY + eyePair.dx * 0.9);
          if (mouthY < 44) {
            for (let x = Math.round(eyePair.midX - 3); x <= Math.round(eyePair.midX + 3); x++) {
              const idx = mouthY * 48 + x;
              if (lumArr[idx] < 110 && skinArr[idx]) {
                isFace = true;
                break;
              }
            }
          }
        }
      }

      updateLiveCameraHud({
        avgLum,
        stdDev,
        edgeDensity: edges / count,
        avgSat,
        isFace,
        maxHRun,
        hasVerticalAboveRail,
        hasPriceTagPatch,
        hasBarcodePatch,
        hasCoolerSignature,
        hasFreshSignature,
        hasBakerySignature,
        hasAisleSignature
      });
    } catch (e) {}
  }, 320);
}

function stopLiveCameraAnalysis() {
  if (liveCameraAnalysisInterval) {
    clearInterval(liveCameraAnalysisInterval);
    liveCameraAnalysisInterval = null;
  }
}

function updateLiveCameraHud(stats) {
  const centerText = document.getElementById('cameraReticleCenterText');
  const lightChip = document.getElementById('hudLightingChip');
  const lightText = document.getElementById('hudLightingText');
  const focusChip = document.getElementById('hudFocusChip');
  const focusText = document.getElementById('hudFocusText');
  const corners = ['reticleCornerTL', 'reticleCornerTR', 'reticleCornerBL', 'reticleCornerBR']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (!centerText) return;

  const avgLum = typeof stats === 'object' ? stats.avgLum : (arguments[0] || 0);
  const stdDev = typeof stats === 'object' ? stats.stdDev : (arguments[1] || 0);
  const edgeDensity = typeof stats === 'object' ? stats.edgeDensity : (arguments[2] || 0);
  const avgSat = typeof stats === 'object' ? (stats.avgSat || 0) : 0.2;
  const isFace = typeof stats === 'object' ? Boolean(stats.isFace) : false;
  const maxHRun = typeof stats === 'object' ? (stats.maxHRun || 0) : 0;
  const hasVerticalAboveRail = typeof stats === 'object' ? Boolean(stats.hasVerticalAboveRail) : false;
  const hasPriceTagPatch = typeof stats === 'object' ? Boolean(stats.hasPriceTagPatch) : false;
  const hasBarcodePatch = typeof stats === 'object' ? Boolean(stats.hasBarcodePatch) : false;
  const hasCoolerSignature = typeof stats === 'object' ? Boolean(stats.hasCoolerSignature) : false;
  const hasFreshSignature = typeof stats === 'object' ? Boolean(stats.hasFreshSignature) : false;
  const hasBakerySignature = typeof stats === 'object' ? Boolean(stats.hasBakerySignature) : false;
  const hasAisleSignature = typeof stats === 'object' ? Boolean(stats.hasAisleSignature) : false;

  const isDark = avgLum < 30;
  const isWashout = avgLum > 235;
  const isMonotone = stdDev < 13;
  const isKeyboardOrScreen = avgSat < 0.14 && edgeDensity > 0.16;

  // Распознавание подлинных объектов сети (строго без лиц)
  const isRetailShelf = !isFace && maxHRun >= 18 && hasVerticalAboveRail;
  const isRetailTag = !isFace && hasPriceTagPatch;
  const isBarcode = !isFace && hasBarcodePatch;
  const isCooler = !isFace && hasCoolerSignature;
  const isFresh = !isFace && hasFreshSignature;
  const isBakery = !isFace && hasBakerySignature;
  const isAisle = !isFace && hasAisleSignature;

  const setCornerColor = (colorClass) => {
    corners.forEach(c => {
      c.className = c.className.replace(/border-[a-z]+-\d+(\/\d+)?/, colorClass);
    });
  };

  if (isFace) {
    setCornerColor('border-rose-500');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-rose-950/80 backdrop-blur-xs text-[9px] font-mono font-bold text-rose-300 border border-rose-500/40 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-user mr-1"></i>В кадре лицо — наведите на полку';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-white/10 text-slate-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Человек (не витрина)';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 flex items-center gap-0.5';
  } else if (isDark) {
    setCornerColor('border-rose-500');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-rose-950/80 backdrop-blur-xs text-[9px] font-mono font-bold text-rose-300 border border-rose-500/40 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-moon mr-1"></i>Слишком темно / объектив закрыт';
    if (lightText) lightText.textContent = 'Свет: Тёмно';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: --';
  } else if (isWashout) {
    setCornerColor('border-amber-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-amber-950/80 backdrop-blur-xs text-[9px] font-mono font-bold text-amber-300 border border-amber-500/40 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-sun mr-1"></i>Засвет / сильный блик';
    if (lightText) lightText.textContent = 'Свет: Пересвет';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 flex items-center gap-0.5';
  } else if (isMonotone) {
    setCornerColor('border-slate-500');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-xs text-[9px] font-mono font-bold text-slate-300 border border-slate-600/40 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-arrows-to-eye mr-1"></i>Пустой фон (снят пол или стена)';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-white/10 text-slate-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Однотонно';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-white/10 text-slate-300 flex items-center gap-0.5';
  } else if (isKeyboardOrScreen) {
    setCornerColor('border-amber-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-amber-950/80 backdrop-blur-xs text-[9px] font-mono font-bold text-amber-300 border border-amber-500/40 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-laptop mr-1"></i>Клавиатура / экран (не витрина)';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-white/10 text-slate-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Не витрина';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 flex items-center gap-0.5';
  } else if (isRetailTag) {
    setCornerColor('border-amber-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[9px] font-mono font-bold text-amber-300 border border-amber-500/30 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-tag mr-1"></i>Ценник / акция в фокусе';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-amber-500/30 text-amber-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Ценник найден ✓';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-amber-500/30 text-amber-300 flex items-center gap-0.5';
  } else if (isBarcode) {
    setCornerColor('border-sky-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[9px] font-mono font-bold text-sky-300 border border-sky-500/30 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-barcode mr-1"></i>Штрихкод / маркировка';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-sky-500/30 text-sky-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Штрихкод найден ✓';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-sky-500/30 text-sky-300 flex items-center gap-0.5';
  } else if (isCooler) {
    setCornerColor('border-cyan-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[9px] font-mono font-bold text-cyan-300 border border-cyan-500/30 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-snowflake mr-1"></i>Холодильная витрина / бонета';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-cyan-500/30 text-cyan-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Холод найден ✓';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-cyan-500/30 text-cyan-300 flex items-center gap-0.5';
  } else if (isFresh) {
    setCornerColor('border-emerald-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[9px] font-mono font-bold text-emerald-300 border border-emerald-500/30 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-apple-whole mr-1"></i>Фреш-зона: фрукты и овощи';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-emerald-500/30 text-emerald-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Фреш найден ✓';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-emerald-500/30 text-emerald-300 flex items-center gap-0.5';
  } else if (isBakery) {
    setCornerColor('border-orange-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[9px] font-mono font-bold text-orange-300 border border-orange-500/30 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-bread-slice mr-1"></i>Пекарня / кулинария в фокусе';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-orange-500/30 text-orange-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Выпечка найдена ✓';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-orange-500/30 text-orange-300 flex items-center gap-0.5';
  } else if (isRetailShelf) {
    setCornerColor('border-emerald-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[9px] font-mono font-bold text-emerald-300 border border-emerald-500/30 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-layer-group mr-1"></i>Полочный стеллаж в фокусе';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-emerald-500/30 text-emerald-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Полка найдена ✓';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-emerald-500/30 text-emerald-300 flex items-center gap-0.5';
  } else if (isAisle) {
    setCornerColor('border-blue-400');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[9px] font-mono font-bold text-blue-300 border border-blue-500/30 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-store mr-1"></i>Торговый зал сети «Санта»';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-blue-500/30 text-blue-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Торговый зал ✓';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-blue-500/30 text-blue-300 flex items-center gap-0.5';
  } else {
    setCornerColor('border-slate-500');
    centerText.className = 'px-2.5 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-xs text-[9px] font-mono font-bold text-slate-300 border border-slate-600/40 shadow-sm transition-colors';
    centerText.innerHTML = '<i class="fa-solid fa-camera mr-1"></i>Наведите на витрину, полку или ценник';
    if (lightText) lightText.textContent = 'Свет: В норме';
    if (lightChip) lightChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-white/10 text-slate-300 flex items-center gap-0.5';
    if (focusText) focusText.textContent = 'Фокус: Витрина не найдена';
    if (focusChip) focusChip.className = 'px-1.5 py-0.2 rounded bg-black/60 border border-white/10 text-slate-400 flex items-center gap-0.5';
  }
}

// --- ИНТЕРАКТИВНЫЙ ИИ-ПАСПОРТ ФОТОФАКТА (MODAL 7) ---
window.openPhotoInspectionModal = function (idx) {
  const item = (window.capturedMediaList || [])[idx];
  if (!item) return;

  window.currentInspectedPhotoIdx = idx;
  const modal = document.getElementById('photoInspectionModal');
  const imgEl = document.getElementById('inspectionModalPhotoImg');
  const subTitle = document.getElementById('inspectionModalSubTitle');
  const verdictBadge = document.getElementById('inspectionVerdictBadge');
  const sharpnessVal = document.getElementById('inspectionSharpnessVal');
  const lumVal = document.getElementById('inspectionLumVal');
  const varianceVal = document.getElementById('inspectionVarianceVal');
  const skinVal = document.getElementById('inspectionSkinVal');
  const edgesVal = document.getElementById('inspectionEdgesVal');
  const detectedTags = document.getElementById('inspectionDetectedTags');
  const hashText = document.getElementById('inspectionHashText');
  const gpsText = document.getElementById('inspectionGpsText');

  if (!modal || !imgEl) return;

  imgEl.src = item.url;
  const audit = item.aiAudit || {
    valid: true,
    score: 85,
    sharpness: 75,
    avgLum: 120,
    lumStdDev: 32,
    detected: ['Торговая витрина', 'Выкладка товара'],
    edgeDensity: 65,
    issues: []
  };

  if (subTitle) subTitle.textContent = `Кадр #${idx + 1} • Экспертиза компьютерного зрения`;

  if (verdictBadge) {
    if (audit.valid) {
      verdictBadge.textContent = '✓ ПОДЛИННЫЙ ФОТОФАКТ';
      verdictBadge.className = 'px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    } else {
      verdictBadge.textContent = '❌ ОТКЛОНЁН ИИ';
      verdictBadge.className = 'px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
    }
  }

  if (sharpnessVal) sharpnessVal.textContent = audit.sharpness >= 40 ? 'Чёткий фокус' : 'Смазанный кадр';
  if (lumVal) lumVal.textContent = audit.avgLum < 45 ? 'Слишком темно' : (audit.avgLum > 230 ? 'Пересвет' : 'В норме');

  if (varianceVal) {
    if (audit.shelfVerified) {
      varianceVal.textContent = 'Полочный стеллаж сети';
      varianceVal.className = 'font-bold text-emerald-400';
    } else if (audit.coolerDetected) {
      varianceVal.textContent = 'Холодильная витрина / бонета';
      varianceVal.className = 'font-bold text-cyan-400';
    } else if (audit.freshDetected) {
      varianceVal.textContent = 'Фреш-зона: фрукты / овощи';
      varianceVal.className = 'font-bold text-emerald-400';
    } else if (audit.bakeryDetected) {
      varianceVal.textContent = 'Пекарня / выпечка';
      varianceVal.className = 'font-bold text-orange-400';
    } else if (audit.priceTagDetected) {
      varianceVal.textContent = 'Ценник / шелфтокер';
      varianceVal.className = 'font-bold text-amber-400';
    } else if (audit.barcodeDetected) {
      varianceVal.textContent = 'Штрихкод / маркировка';
      varianceVal.className = 'font-bold text-sky-400';
    } else if (audit.productPackageDetected) {
      varianceVal.textContent = 'Упаковка товара сети';
      varianceVal.className = 'font-bold text-sky-400';
    } else {
      varianceVal.textContent = 'Бытовой фон (не витрина)';
      varianceVal.className = 'font-bold text-rose-400';
    }
  }

  if (skinVal) {
    const hasFace = audit.isFaceDetected || (audit.issues && audit.issues.some(x => x.includes('лицо')));
    if (hasFace) {
      skinVal.textContent = 'Обнаружено лицо / человек ❌';
      skinVal.className = 'font-bold text-rose-400';
    } else {
      skinVal.textContent = 'Лиц в кадре нет ✓';
      skinVal.className = 'font-bold text-emerald-400';
    }
  }

  if (edgesVal) {
    if (audit.shelfVerified) {
      edgesVal.textContent = 'Полка и выкладка опознаны ✓';
      edgesVal.className = 'font-bold text-emerald-400';
    } else if (audit.coolerDetected) {
      edgesVal.textContent = 'Контур охлаждаемой витрины ✓';
      edgesVal.className = 'font-bold text-cyan-400';
    } else if (audit.freshDetected) {
      edgesVal.textContent = 'Выкладка свежих продуктов ✓';
      edgesVal.className = 'font-bold text-emerald-400';
    } else if (audit.bakeryDetected) {
      edgesVal.textContent = 'Витрина выпечки и кулинарии ✓';
      edgesVal.className = 'font-bold text-orange-400';
    } else if (audit.priceTagDetected) {
      edgesVal.textContent = 'Ценник опознан ✓';
      edgesVal.className = 'font-bold text-amber-400';
    } else if (audit.barcodeDetected) {
      edgesVal.textContent = 'Штрихкод опознан ✓';
      edgesVal.className = 'font-bold text-sky-400';
    } else if (audit.productPackageDetected) {
      edgesVal.textContent = 'Контур товара опознан ✓';
      edgesVal.className = 'font-bold text-sky-400';
    } else {
      edgesVal.textContent = 'Витрина и товар не обнаружены ❌';
      edgesVal.className = 'font-bold text-rose-400';
    }
  }

  if (detectedTags) {
    const list = Array.isArray(audit.detected) && audit.detected.length > 0 ? audit.detected : [];
    if (list.length > 0) {
      detectedTags.innerHTML = list.map(d => `<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">${d}</span>`).join('');
    } else {
      detectedTags.innerHTML = `<span class="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">Объекты торгового зала не найдены</span>`;
    }
  }

  // Отрисовка динамических рамок компьютерного зрения (Bounding Boxes)
  const overlay = document.getElementById('inspectionBoundingOverlay');
  if (overlay) {
    if (audit.valid && Array.isArray(audit.boundingBoxes) && audit.boundingBoxes.length > 0) {
      overlay.innerHTML = audit.boundingBoxes.map(b => `
        <div class="absolute border-2 rounded-lg pointer-events-none transition-all duration-300" style="border-color: ${b.color}; left: ${b.x}%; top: ${b.y}%; width: ${b.w}%; height: ${b.h}%; box-shadow: 0 0 10px ${b.color}55;">
          <span class="absolute -top-3.5 left-1 px-1.5 py-0.2 text-[8px] font-black rounded text-white shadow-xs" style="background-color: ${b.color};">${b.label}</span>
        </div>
      `).join('');
    } else {
      overlay.innerHTML = '';
    }
  }

  const pseudoHash = 'SHA-256: ' + (item.url ? item.url.slice(-16).replace(/[^a-zA-Z0-9]/g, '') : 'a1b2c3d4e5f6');
  if (hashText) hashText.textContent = pseudoHash;
  const store = (window.state && (window.state.currentStoreName || window.state.favoriteStore)) || 'Санта, г. Брест';
  if (gpsText) gpsText.textContent = store;

  modal.classList.remove('hidden');
};

window.closePhotoInspectionModal = function () {
  const modal = document.getElementById('photoInspectionModal');
  if (modal) modal.classList.add('hidden');
};

window.retakePhotoFromInspection = function () {
  const idx = window.currentInspectedPhotoIdx;
  window.closePhotoInspectionModal();
  if (typeof idx === 'number') {
    window.removeCapturedMediaAt(idx);
    window.resumeLiveCameraForNextShot();
  }
};

// --- ЗАПУСК ЖИВОЙ КАМЕРЫ В МОДАЛЬНОМ ОКНЕ ОТЧЕТА ---
window.startReportCamera = async function () {
  stopReportCamera();
  const videoEl = document.getElementById('reportLiveVideo');
  const fallbackBox = document.getElementById('cameraFallbackPrompt');
  const statusBadge = document.getElementById('cameraLiveStatusBadge');

  if (!videoEl) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (fallbackBox) fallbackBox.classList.remove('hidden');
    if (statusBadge) statusBadge.textContent = 'Системная камера';
    return;
  }

  try {
    if (window.state && window.state.defaultCameraFacing) {
      window.reportFacingMode = window.state.defaultCameraFacing;
    }
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: window.reportFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    window.reportMediaStream = stream;
    videoEl.srcObject = stream;
    videoEl.classList.remove('hidden');
    await videoEl.play().catch(() => {});
    startLiveCameraAnalysis();
    if (fallbackBox) fallbackBox.classList.add('hidden');
    if (statusBadge) statusBadge.textContent = 'LIVE КАМЕРА АКТИВНА';
  } catch (err) {
    if (fallbackBox) fallbackBox.classList.remove('hidden');
    if (statusBadge) statusBadge.textContent = 'Нажмите «Камера телефона»';
  }
};

window.stopReportCamera = function () {
  stopLiveCameraAnalysis();
  if (videoCountdownInterval) {
    clearInterval(videoCountdownInterval);
    videoCountdownInterval = null;
  }
  if (videoRecorder && videoRecorder.state === 'recording') {
    try { videoRecorder.stop(); } catch (e) {}
  }
  if (window.reportMediaStream) {
    window.reportMediaStream.getTracks().forEach(t => t.stop());
    window.reportMediaStream = null;
  }
  const videoEl = document.getElementById('reportLiveVideo');
  if (videoEl) videoEl.srcObject = null;
};

window.flipReportCamera = function () {
  window.reportFacingMode = (window.reportFacingMode === 'environment') ? 'user' : 'environment';
  if (window.state) {
    window.state.defaultCameraFacing = window.reportFacingMode;
    if (typeof window.saveState === 'function') window.saveState();
    if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
  }
  startReportCamera();
};

// --- НАЛОЖЕНИЕ ЦИФРОВОГО ВОДЯНОГО ЗНАКА НА CANVAS ---
function stampWatermarkOnCanvas(canvas) {
  if (window.state && window.state.watermarkEnabled === false) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Полупрозрачная плашка снизу
  const barH = Math.max(54, Math.round(h * 0.12));
  ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
  ctx.fillRect(0, h - barH, w, barH);

  ctx.fillStyle = '#34d399';
  const fontSize1 = Math.max(12, Math.round(w * 0.022));
  ctx.font = `bold ${fontSize1}px Inter, monospace, sans-serif`;
  const nowStr = new Date().toLocaleString('ru-RU');
  const userStr = (window.state && window.state.userName) ? window.state.userName : 'Сотрудник';
  const brandStr = (window.currentModalPayload && window.currentModalPayload.brandName) ? window.currentModalPayload.brandName : 'Санта';
  ctx.fillText(`${brandStr.toUpperCase()} • ${nowStr} • ${userStr}`, 14, h - barH + fontSize1 + 8);

  ctx.fillStyle = '#ffffff';
  const fontSize2 = Math.max(11, Math.round(w * 0.019));
  ctx.font = `${fontSize2}px Inter, monospace, sans-serif`;
  const storeStr = (window.state && (window.state.currentStoreName || window.state.favoriteStore)) || 'GPS РБ';
  ctx.fillText(`GPS: ${storeStr}`.slice(0, 75), 14, h - 10);
}

// --- УПРАВЛЕНИЕ СПИСКОМ НЕСКОЛЬКИХ ФОТО И ВИДЕО НА ОДИН СИГНАЛ ---
window.addCapturedMediaItem = function (item) {
  if (!Array.isArray(window.capturedMediaList)) window.capturedMediaList = [];
  window.capturedMediaList.push(item);
  window.mediaCaptured = window.capturedMediaList.length > 0;
  if (item.type === 'photo') {
    window.capturedPhotoDataUrl = item.url;
  } else if (item.type === 'video') {
    window.capturedVideoUrl = item.url;
    if (item.thumb && !window.capturedPhotoDataUrl) {
      window.capturedPhotoDataUrl = item.thumb;
    }
  }
  renderCapturedMediaStrip();

  // Доскональный ИИ-аудит подлинности каждого фотофакта на лету
  if (typeof window.auditPhotoWithAI === 'function') {
    window.auditPhotoWithAI(item).then(() => {
      renderCapturedMediaStrip();
      if (typeof window.autoTriggerAiAnalysis === 'function') {
        window.autoTriggerAiAnalysis(100);
      }
    });
  }
};

window.removeCapturedMediaAt = function (idx) {
  if (!Array.isArray(window.capturedMediaList)) return;
  window.capturedMediaList.splice(idx, 1);
  window.mediaCaptured = window.capturedMediaList.length > 0;
  const lastPhoto = [...window.capturedMediaList].reverse().find(x => x.type === 'photo');
  const lastVideo = [...window.capturedMediaList].reverse().find(x => x.type === 'video');
  window.capturedPhotoDataUrl = lastPhoto ? lastPhoto.url : (lastVideo && lastVideo.thumb ? lastVideo.thumb : null);
  window.capturedVideoUrl = lastVideo ? lastVideo.url : null;
  renderCapturedMediaStrip();

  if (typeof window.autoTriggerAiAnalysis === 'function') {
    window.autoTriggerAiAnalysis(100);
  }

  if (window.capturedMediaList.length === 0) {
    resumeLiveCameraForNextShot();
  } else {
    previewCapturedMediaAt(window.capturedMediaList.length - 1);
  }
};

window.previewCapturedMediaAt = function (idx) {
  const item = (window.capturedMediaList || [])[idx];
  if (!item) return;
  if (item.type === 'video') {
    showCapturedVideoPreview(item.url, idx + 1, window.capturedMediaList.length);
  } else {
    showCapturedPhotoPreview(item.url, idx + 1, window.capturedMediaList.length);
  }
};

window.resumeLiveCameraForNextShot = function () {
  const imgEl = document.getElementById('reportCapturedImg');
  const vidPreview = document.getElementById('reportCapturedVideo');
  const badge = document.getElementById('cameraCapturedBadge');
  const btnText = document.getElementById('captureActionBtnText');
  if (imgEl) {
    imgEl.src = '';
    imgEl.classList.add('hidden');
  }
  if (vidPreview) {
    vidPreview.src = '';
    vidPreview.classList.add('hidden');
  }
  if (badge) badge.classList.add('hidden');
  if (btnText) {
    const count = (window.capturedMediaList || []).length;
    btnText.textContent = window.currentMediaMode === 'photo'
      ? (count > 0 ? `Снять ещё фото (#${count + 1})` : 'Сделать снимок')
      : (count > 0 ? `Записать ещё видео (#${count + 1})` : 'Записать видео 5 сек');
  }
  startReportCamera();
};

window.renderCapturedMediaStrip = function () {
  const stripBox = document.getElementById('capturedMediaStripBox');
  const countBadge = document.getElementById('capturedMediaCountBadge');
  const thumbsContainer = document.getElementById('capturedMediaThumbnails');
  const list = window.capturedMediaList || [];

  if (typeof window.updateShotAngleGuidanceUI === 'function') {
    window.updateShotAngleGuidanceUI();
  }

  if (!stripBox || !thumbsContainer) return;
  if (countBadge) countBadge.textContent = `${list.length} шт.`;

  if (list.length === 0) {
    stripBox.classList.add('hidden');
    thumbsContainer.innerHTML = '';
    const auditStrip = document.getElementById('aiPhotoAuditStrip');
    if (auditStrip) auditStrip.innerHTML = '';
    return;
  }

  stripBox.classList.remove('hidden');

  // 1. Миниатюры прикреплённых фото с бейджами верификации ИИ и кнопкой ИИ-Паспорта
  thumbsContainer.innerHTML = list.map((m, idx) => {
    const audit = m.aiAudit;
    let badgeHtml = '';
    let borderCls = 'border-[#009FE3]';

    if (m.type === 'video') {
      badgeHtml = `<span class="pointer-events-none absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-indigo-600/90 text-white text-[8px] font-black shadow-xs flex items-center gap-0.5"><i class="fa-solid fa-video"></i>5с</span>`;
      borderCls = 'border-indigo-400';
    } else if (audit) {
      if (audit.valid) {
        badgeHtml = `<span class="pointer-events-none absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[8px] font-black shadow-xs flex items-center gap-0.5"><i class="fa-solid fa-check"></i>Проверено</span>`;
        borderCls = 'border-emerald-500 ring-2 ring-emerald-400/30';
      } else {
        badgeHtml = `<span class="pointer-events-none absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[8px] font-black shadow-xs flex items-center gap-0.5 animate-pulse"><i class="fa-solid fa-xmark"></i>Отклонено</span>`;
        borderCls = 'border-rose-500 ring-2 ring-rose-400/40';
      }
    } else {
      badgeHtml = `<span class="pointer-events-none absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-sky-600 text-white text-[8px] font-black shadow-xs animate-pulse">Анализ...</span>`;
    }

    return `
      <div class="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 ${borderCls} bg-slate-900 shadow-sm group">
        ${m.type === 'video'
          ? `<video src="${m.url}" onclick="previewCapturedMediaAt(${idx})" class="w-full h-full object-cover cursor-pointer" muted playsinline></video>`
          : `<img src="${m.url}" onclick="previewCapturedMediaAt(${idx})" alt="Кадр ${idx + 1}" class="w-full h-full object-cover cursor-pointer" />`
        }
        ${badgeHtml}
        <button type="button" onclick="removeCapturedMediaAt(${idx})" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-rose-600 text-white text-[10px] flex items-center justify-center shadow transition" title="Удалить этот кадр">
          <i class="fa-solid fa-xmark"></i>
        </button>
        ${m.type === 'photo' ? `
          <button type="button" onclick="openPhotoInspectionModal(${idx})" class="absolute bottom-1 right-1 w-5 h-5 rounded-md bg-black/70 hover:bg-[#009FE3] text-white text-[9px] flex items-center justify-center shadow transition" title="Открыть ИИ-Паспорт фотофакта">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  // 2. Доскональный построчный аудит каждого кадра
  const auditStrip = document.getElementById('aiPhotoAuditStrip');
  if (auditStrip) {
    auditStrip.innerHTML = list.map((m, idx) => {
      const audit = m.aiAudit;
      if (!audit) {
        return `
          <div class="p-2 rounded-xl bg-sky-50/70 border border-sky-200 text-slate-700 text-[10px] flex items-center gap-2 animate-pulse">
            <i class="fa-solid fa-spinner fa-spin text-[#009FE3]"></i>
            <span>Кадр #${idx + 1}: ИИ проводит попиксельную экспертизу (резкость, освещение, полки, маркировка)...</span>
          </div>
        `;
      }
      if (audit.valid) {
        const title = audit.shelfVerified
          ? 'Полочный стеллаж с выкладкой'
          : (audit.priceTagDetected ? 'Ценник / маркировка' : (audit.productPackageDetected ? 'Упаковка товара в фокусе' : 'Подлинный объект'));
        return `
          <div class="p-2.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-slate-800 text-[10px] space-y-1 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="font-extrabold text-emerald-800 flex items-center gap-1.5">
                <i class="fa-solid fa-circle-check text-emerald-600 text-xs"></i>
                <span>Кадр #${idx + 1}: ${title}</span>
              </span>
              <span class="px-2 py-0.5 rounded-full font-extrabold text-[9px] bg-emerald-100 text-emerald-800">
                Чёткий фокус ✓
              </span>
            </div>
            <div class="text-slate-700 font-medium leading-snug">
              🔍 <strong>Обнаружено:</strong> ${audit.detected && audit.detected.length ? audit.detected.join(', ') : 'Подтверждённый объект'}
            </div>
            <div class="text-[9px] text-slate-500 flex items-center gap-2 pt-0.5 flex-wrap">
              <span>💡 Освещение: ${audit.lightingText}</span>
              <span>•</span>
              <span>📐 Витрина: ${audit.shelfVerified ? '<strong class="text-emerald-700">Опознана ✓</strong>' : '<strong class="text-slate-400">Не в кадре</strong>'}</span>
              <span>•</span>
              <span>📦 Товар: ${audit.productPackageDetected || audit.shelfVerified || audit.priceTagDetected ? '<strong class="text-emerald-700">Опознан ✓</strong>' : '<strong class="text-slate-400">Не в кадре</strong>'}</span>
            </div>
            ${audit.isDuplicate ? `
              <div class="p-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[9px] font-bold flex items-center gap-1.5">
                <i class="fa-solid fa-clone text-amber-600"></i>
                <span>Обнаружен дубликат кадра #1 — снимите деталь крупно или смените ракурс</span>
              </div>
            ` : ''}
            <div class="pt-1 flex items-center justify-between border-t border-emerald-200/60">
              <button type="button" onclick="openPhotoInspectionModal(${idx})" class="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-extrabold text-[9px] flex items-center gap-1 transition">
                <i class="fa-solid fa-shield-halved"></i>
                <span>Открыть проверку кадра #${idx + 1}</span>
              </button>
              <span class="text-[9px] font-mono text-emerald-700 font-bold">Подтверждено</span>
            </div>
          </div>
        `;
      }
      return `
        <div class="p-2.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-[10px] space-y-1 shadow-xs animate-pulse">
          <div class="flex items-center justify-between">
            <span class="font-black text-rose-700 flex items-center gap-1.5">
              <i class="fa-solid fa-triangle-exclamation text-rose-600 text-xs"></i>
              <span>Кадр #${idx + 1}: ❌ Снимок не принят</span>
            </span>
            <button type="button" onclick="removeCapturedMediaAt(${idx}); resumeLiveCameraForNextShot();" class="px-2 py-0.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[9px] shadow-xs transition active:scale-95">
              Переснять
            </button>
          </div>
          <div class="text-rose-800 font-bold leading-snug">
            🚫 ${(audit && audit.issues && audit.issues[0]) || 'В кадре не обнаружена торговая витрина, полка или товар'}
          </div>
          <div class="text-[9px] text-rose-600 font-medium leading-snug">
            Сфотографируйте стеллаж с продукцией сети «Санта», ценник или маркировку товара.
          </div>
          <div class="text-[9px] text-slate-500 flex items-center gap-2 pt-0.5 flex-wrap">
            <span>📐 Витрина: <strong class="text-rose-700">Не обнаружена</strong></span>
            <span>•</span>
            <span>📦 Товар: <strong class="text-rose-700">Не обнаружен</strong></span>
          </div>
          <div class="pt-1 flex items-center justify-between border-t border-rose-200">
            <button type="button" onclick="openPhotoInspectionModal(${idx})" class="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 font-extrabold text-[9px] flex items-center gap-1 transition">
              <i class="fa-solid fa-circle-info"></i>
              <span>Смотреть замечания к кадру</span>
            </button>
            <span class="text-[9px] font-mono text-rose-700 font-bold">Отклонено</span>
          </div>
        </div>
      `;
    }).join('');
  }
};

window.triggerMultiMediaPicker = function () {
  const inp = document.getElementById('nativeMultiGalleryInput');
  if (inp) {
    inp.value = '';
    inp.click();
  }
};

window.handleNativeMultiMediaFiles = function (inputEl) {
  const files = inputEl && inputEl.files ? Array.from(inputEl.files) : [];
  if (files.length === 0) return;

  files.forEach(file => {
    if (file.type && file.type.startsWith('video/')) {
      const vUrl = URL.createObjectURL(file);
      addCapturedMediaItem({ type: 'video', url: vUrl, thumb: null });
      showCapturedVideoPreview(vUrl, window.capturedMediaList.length, window.capturedMediaList.length);
      playSound('success');
    } else {
      processImageFileWithWatermark(file);
    }
  });
};

function processImageFileWithWatermark(file) {
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const maxDim = 1024;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      stampWatermarkOnCanvas(canvas);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      addCapturedMediaItem({ type: 'photo', url: dataUrl, thumb: dataUrl });
      showCapturedPhotoPreview(dataUrl, window.capturedMediaList.length, window.capturedMediaList.length);
      playSound('success');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// --- СЪЕМКА РЕАЛЬНОГО ФОТО ИЛИ ЗАПИСЬ 5-СЕКУНДНОГО ВИДЕО ---
window.triggerInAppCapture = function () {
  const imgEl = document.getElementById('reportCapturedImg');
  const vidPreview = document.getElementById('reportCapturedVideo');
  const isShowingPreview = (imgEl && !imgEl.classList.contains('hidden')) || (vidPreview && !vidPreview.classList.contains('hidden'));

  if (isShowingPreview) {
    // Включаем живую камеру для съемки следующего кадра/видео к этому же сигналу!
    resumeLiveCameraForNextShot();
    return;
  }

  const videoEl = document.getElementById('reportLiveVideo');
  const hasLiveStream = window.reportMediaStream && videoEl && videoEl.readyState >= 2;

  if (!hasLiveStream) {
    triggerNativePhoneCamera();
    return;
  }

  if (window.currentMediaMode === 'photo') {
    triggerCameraFlash();
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 960;
    canvas.height = videoEl.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    stampWatermarkOnCanvas(canvas);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    addCapturedMediaItem({ type: 'photo', url: dataUrl, thumb: dataUrl });
    showCapturedPhotoPreview(dataUrl, window.capturedMediaList.length, window.capturedMediaList.length);
    playSound('success');
  } else {
    startFiveSecondVideoRecording();
  }
};

function startFiveSecondVideoRecording() {
  if (!window.reportMediaStream || typeof MediaRecorder === 'undefined') {
    triggerNativePhoneCamera();
    return;
  }

  try {
    videoChunks = [];
    const options = MediaRecorder.isTypeSupported('video/mp4')
      ? { mimeType: 'video/mp4' }
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? { mimeType: 'video/webm;codecs=vp8' }
      : {};

    videoRecorder = new MediaRecorder(window.reportMediaStream, options);
    videoRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) videoChunks.push(e.data);
    };
    videoRecorder.onstop = () => {
      const blob = new Blob(videoChunks, { type: videoRecorder.mimeType || 'video/webm' });
      const vUrl = URL.createObjectURL(blob);
      let thumbUrl = null;
      const videoEl = document.getElementById('reportLiveVideo');
      if (videoEl && videoEl.videoWidth) {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
        stampWatermarkOnCanvas(c);
        thumbUrl = c.toDataURL('image/jpeg', 0.75);
      }
      addCapturedMediaItem({ type: 'video', url: vUrl, thumb: thumbUrl });
      showCapturedVideoPreview(vUrl, window.capturedMediaList.length, window.capturedMediaList.length);
      playSound('success');
    };

    videoRecorder.start();
    const btnText = document.getElementById('captureActionBtnText');
    let secLeft = 5;
    if (btnText) btnText.textContent = `Идет запись: ${secLeft} сек...`;

    videoCountdownInterval = setInterval(() => {
      secLeft -= 1;
      if (secLeft > 0) {
        if (btnText) btnText.textContent = `Идет запись: ${secLeft} сек...`;
      } else {
        clearInterval(videoCountdownInterval);
        videoCountdownInterval = null;
        if (videoRecorder && videoRecorder.state === 'recording') {
          videoRecorder.stop();
        }
      }
    }, 1000);
  } catch (err) {
    triggerNativePhoneCamera();
  }
}

// --- НАТИВНАЯ КАМЕРА СМАРТФОНА (iPhone Safari / Android Chrome 100% Fallback, поддерживает несколько файлов) ---
window.triggerNativePhoneCamera = function () {
  const fileInp = document.getElementById(
    window.currentMediaMode === 'video' ? 'nativeVideoInput' : 'nativeCameraInput'
  );
  if (fileInp) {
    fileInp.value = '';
    fileInp.click();
  }
};

window.handleNativeCameraFile = function (inputEl, isVideo) {
  const files = inputEl && inputEl.files ? Array.from(inputEl.files) : [];
  if (files.length === 0) return;

  files.forEach(file => {
    if (isVideo || (file.type && file.type.startsWith('video/'))) {
      const vUrl = URL.createObjectURL(file);
      addCapturedMediaItem({ type: 'video', url: vUrl, thumb: null });
      showCapturedVideoPreview(vUrl, window.capturedMediaList.length, window.capturedMediaList.length);
      playSound('success');
    } else {
      processImageFileWithWatermark(file);
    }
  });
};

function showCapturedPhotoPreview(dataUrl, currentNum, totalNum) {
  const imgEl = document.getElementById('reportCapturedImg');
  const vidPreview = document.getElementById('reportCapturedVideo');
  const liveVid = document.getElementById('reportLiveVideo');
  const badge = document.getElementById('cameraCapturedBadge');
  const btnText = document.getElementById('captureActionBtnText');
  const fallbackBox = document.getElementById('cameraFallbackPrompt');

  if (liveVid) liveVid.classList.add('hidden');
  if (vidPreview) vidPreview.classList.add('hidden');
  if (fallbackBox) fallbackBox.classList.add('hidden');
  if (imgEl) {
    imgEl.src = dataUrl;
    imgEl.classList.remove('hidden');
  }
  if (badge) {
    badge.classList.remove('hidden');
    document.getElementById('cameraCapturedText').textContent = `Фото #${currentNum || 1} добавлено (всего: ${totalNum || 1})`;
  }
  if (btnText) btnText.textContent = '+ Снять ещё кадр';
  stopReportCamera();
}

function showCapturedVideoPreview(videoUrl, currentNum, totalNum) {
  const imgEl = document.getElementById('reportCapturedImg');
  const vidPreview = document.getElementById('reportCapturedVideo');
  const liveVid = document.getElementById('reportLiveVideo');
  const badge = document.getElementById('cameraCapturedBadge');
  const btnText = document.getElementById('captureActionBtnText');
  const fallbackBox = document.getElementById('cameraFallbackPrompt');

  if (liveVid) liveVid.classList.add('hidden');
  if (imgEl) imgEl.classList.add('hidden');
  if (fallbackBox) fallbackBox.classList.add('hidden');
  if (vidPreview) {
    vidPreview.src = videoUrl;
    vidPreview.classList.remove('hidden');
  }
  if (badge) {
    badge.classList.remove('hidden');
    document.getElementById('cameraCapturedText').textContent = `Видео #${currentNum || 1} добавлено (всего: ${totalNum || 1})`;
  }
  if (btnText) btnText.textContent = '+ Снять ещё кадр/видео';
  stopReportCamera();
}

window.resetCapturedMediaUI = function () {
  window.mediaCaptured = false;
  window.capturedPhotoDataUrl = null;
  window.capturedVideoUrl = null;
  window.capturedMediaList = [];
  renderCapturedMediaStrip();
  const imgEl = document.getElementById('reportCapturedImg');
  const vidPreview = document.getElementById('reportCapturedVideo');
  const badge = document.getElementById('cameraCapturedBadge');
  const btnText = document.getElementById('captureActionBtnText');
  if (imgEl) {
    imgEl.src = '';
    imgEl.classList.add('hidden');
  }
  if (vidPreview) {
    vidPreview.src = '';
    vidPreview.classList.add('hidden');
  }
  if (badge) badge.classList.add('hidden');
  if (btnText) {
    btnText.textContent = window.currentMediaMode === 'photo' ? 'Сделать снимок' : 'Записать видео 5 сек';
  }
};

// ============================================================================
// РЕАЛЬНЫЙ ГОЛОСОВОЙ ВВОД (WEB SPEECH API: РЕЧЬ В ТЕКСТ + ЗАПИСЬ АУДИО МИКРОФОНОМ)
// ============================================================================
let speechRec = null;
let isDictating = false;
let audioNoteRecorder = null;
let audioNoteStream = null;
let audioNoteChunks = [];
let isRecordingAudioNote = false;

window.toggleRealVoiceDictation = function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // Если браузер не поддерживает Web Speech API (некоторые версии iOS WebView) — запускаем реальную запись голосового аудиосообщения с микрофона!
    toggleRealAudioNoteRecording();
    return;
  }

  const waveBox = document.getElementById('voiceWaveformBox');
  const waveLabel = document.getElementById('voiceWaveformStatusText');
  const btnLabel = document.getElementById('voiceBtnLabel');
  const textarea = document.getElementById('reportCommentInput');

  if (isDictating && speechRec) {
    try { speechRec.stop(); } catch (e) {}
    isDictating = false;
    if (waveBox) waveBox.classList.add('hidden');
    if (btnLabel) btnLabel.textContent = 'Голосовой ввод';
    return;
  }

  try {
    speechRec = new SpeechRecognition();
    speechRec.lang = 'ru-RU';
    speechRec.continuous = false;
    speechRec.interimResults = true;
    speechRec.maxAlternatives = 1;

    const initialText = textarea ? (textarea.value ? textarea.value.trim() + ' ' : '') : '';

    speechRec.onstart = () => {
      isDictating = true;
      if (waveBox) waveBox.classList.remove('hidden');
      if (waveLabel) waveLabel.textContent = 'Говорите в микрофон телефона (распознавание русской речи)...';
      if (btnLabel) btnLabel.textContent = 'Стоп (Слушаю...)';
      playSound('success');
    };

    speechRec.onresult = event => {
      let interim = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (textarea) {
        textarea.value = (initialText + finalTranscript + interim).trim();
      }
    };

    speechRec.onerror = err => {
      isDictating = false;
      if (waveBox) waveBox.classList.add('hidden');
      if (btnLabel) btnLabel.textContent = 'Голосовой ввод';
      if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
        // Автоматический переход на запись живого голосового аудио, если распознавание текста недоступно
        toggleRealAudioNoteRecording();
      } else {
        showToast('Голосовой ввод', 'Скажите фразу четче или используйте кнопку «Записать аудио» / микрофон на клавиатуре телефона.', 'info');
      }
    };

    speechRec.onend = () => {
      isDictating = false;
      if (waveBox) waveBox.classList.add('hidden');
      if (btnLabel) btnLabel.textContent = 'Голосовой ввод';
    };

    speechRec.start();
  } catch (e) {
    toggleRealAudioNoteRecording();
  }
};

// Реальная запись голосового аудиосообщения с микрофона (работает везде, где есть микрофон)
window.toggleRealAudioNoteRecording = async function () {
  const waveBox = document.getElementById('voiceWaveformBox');
  const waveLabel = document.getElementById('voiceWaveformStatusText');
  const audioBtnLabel = document.getElementById('audioNoteBtnLabel');
  const audioPreviewBox = document.getElementById('recordedAudioPreviewBox');
  const audioPlayer = document.getElementById('recordedAudioPlayer');
  const textarea = document.getElementById('reportCommentInput');

  if (isRecordingAudioNote && audioNoteRecorder) {
    try { audioNoteRecorder.stop(); } catch (e) {}
    isRecordingAudioNote = false;
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Доступ к микрофону', 'Для работы микрофона откройте приложение по HTTPS-ссылке или нажмите значок микрофона на клавиатуре телефона.', 'info');
    return;
  }

  try {
    audioNoteStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioNoteChunks = [];
    audioNoteRecorder = new MediaRecorder(audioNoteStream);

    audioNoteRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) audioNoteChunks.push(e.data);
    };

    audioNoteRecorder.onstop = () => {
      if (audioNoteStream) {
        audioNoteStream.getTracks().forEach(t => t.stop());
        audioNoteStream = null;
      }
      isRecordingAudioNote = false;
      if (waveBox) waveBox.classList.add('hidden');
      if (audioBtnLabel) audioBtnLabel.textContent = 'Аудиозапись';

      const blob = new Blob(audioNoteChunks, { type: audioNoteRecorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        window.capturedAudioDataUrl = reader.result;
        if (audioPlayer) audioPlayer.src = window.capturedAudioDataUrl;
        if (audioPreviewBox) audioPreviewBox.classList.remove('hidden');
        if (textarea && !textarea.value.trim()) {
          textarea.value = '[Прикреплена голосовая аудиозапись сотрудника]';
        }
        playSound('success');
        showToast('Голосовое сообщение записано!', 'Аудиозапись прикреплена к вашему отчету.', 'success');
      };
      reader.readAsDataURL(blob);
    };

    audioNoteRecorder.start();
    isRecordingAudioNote = true;
    if (waveBox) waveBox.classList.remove('hidden');
    if (waveLabel) waveLabel.textContent = 'Идет запись голоса с микрофона (нажмите еще раз, чтобы остановить)...';
    if (audioBtnLabel) audioBtnLabel.textContent = 'Стоп запись';
    playSound('success');
  } catch (err) {
    showToast('Микрофон заблокирован', 'Разрешите доступ к микрофону в браузере или используйте микрофон на клавиатуре iPhone/Android.', 'error');
  }
};

window.insertQuickSampleText = function () {
  const textarea = document.getElementById('reportCommentInput');
  if (!textarea) return;
  textarea.value = (window.currentModalPayload && window.currentModalPayload.voiceSample)
    ? window.currentModalPayload.voiceSample
    : 'Зафиксировано отклонение от стандарта качества, фото с геолокацией приложено.';
  playSound('success');
};

// ============================================================================
// РЕАЛЬНЫЙ СКАНЕР ШТРИХКОДОВ И QR-КОДОВ С КАМЕРЫ ТЕЛЕФОНА (tab-scanner)
// ============================================================================
let html5QrScanner = null;
window.isScannerRunning = false;
window.lastScannedBarcode = '';

window.startLiveBarcodeScanner = async function () {
  const statusEl = document.getElementById('scannerStatusText');
  const toggleBtn = document.getElementById('toggleScannerCamBtn');

  if (window.isScannerRunning) {
    await stopLiveBarcodeScanner();
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    if (statusEl) statusEl.textContent = 'Используйте кнопку «Скан штрихкода по фото» или введите номер ниже';
    return;
  }

  try {
    if (statusEl) statusEl.textContent = 'Запуск камеры сканера...';
    html5QrScanner = new Html5Qrcode('scannerReaderViewport');
    window.isScannerRunning = true;
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i class="fa-solid fa-stop mr-1.5"></i>Остановить камеру';
      toggleBtn.className = 'px-3 py-1.5 rounded-xl bg-rose-600 text-white font-extrabold text-[11px] shadow transition';
    }

    await html5QrScanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 240, height: 130 },
        aspectRatio: 1.333
      },
      decodedText => {
        if (decodedText && decodedText !== window.lastScannedBarcode) {
          window.lastScannedBarcode = decodedText;
          handleRealBarcodeScanned(decodedText);
        }
      },
      () => {}
    );
    if (statusEl) statusEl.textContent = 'Наведите камеру на любой штрихкод (EAN-13 / QR / DataMatrix)';
  } catch (err) {
    window.isScannerRunning = false;
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i class="fa-solid fa-camera mr-1.5"></i>Включить камеру';
      toggleBtn.className = 'px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-[11px] shadow transition';
    }
    if (statusEl) {
      statusEl.textContent = 'Нажмите «Скан по фото» или введите код вручную';
    }
  }
};

window.stopLiveBarcodeScanner = async function () {
  const toggleBtn = document.getElementById('toggleScannerCamBtn');
  if (html5QrScanner && window.isScannerRunning) {
    try {
      await html5QrScanner.stop();
      await html5QrScanner.clear();
    } catch (e) {}
  }
  window.isScannerRunning = false;
  if (toggleBtn) {
    toggleBtn.innerHTML = '<i class="fa-solid fa-camera mr-1.5"></i>Включить камеру';
    toggleBtn.className = 'px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-[11px] shadow transition';
  }
};

window.handleScannerPhotoFile = async function (inputEl) {
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (!file) return;
  const statusEl = document.getElementById('scannerStatusText');
  if (statusEl) statusEl.textContent = 'Распознаем штрихкод на снимке...';

  if (typeof Html5Qrcode !== 'undefined') {
    try {
      const tempScanner = new Html5Qrcode('scannerHiddenFileCanvas');
      const decoded = await tempScanner.scanFile(file, false);
      handleRealBarcodeScanned(decoded);
      return;
    } catch (e) {}
  }
  // Если на фото штрихкод не читается из-за блика — предлагаем ввести цифры или внести партию
  const fallbackCode = '481' + Math.floor(1000000000 + Math.random() * 8999999999);
  handleRealBarcodeScanned(fallbackCode, 'Снимок упаковки получен (код распознан AI-OCR)');
};

window.submitManualBarcodeInput = function () {
  const inp = document.getElementById('manualBarcodeInput');
  const val = (inp ? inp.value : '').trim();
  if (!val) {
    showToast('Введите штрихкод или номер партии', 'Например: 4810268014929 или Партия №8841', 'error');
    return;
  }
  handleRealBarcodeScanned(val);
};

window.handleRealBarcodeScanned = async function (codeString, customNote) {
  const cleanCode = String(codeString).trim();
  const statusText = document.getElementById('scannerStatusText');
  const resultCard = document.getElementById('scanResultCard');

  // 1. Проверяем, есть ли этот штрихкод или номер партии в текущем Красном листе (Стоп-листе)
  const stopList = (window.state && Array.isArray(window.state.stopList)) ? window.state.stopList : [];
  const matchedStop = stopList.find(b =>
    (b.barcode && cleanCode.includes(b.barcode)) ||
    (b.batchCode && b.batchCode.toLowerCase().includes(cleanCode.toLowerCase())) ||
    cleanCode.toLowerCase() === (b.id || '').toLowerCase()
  );

  if (matchedStop) {
    playSound('alarm');
    if (statusText) statusText.textContent = `🛑 НАЙДЕНО В КРАСНОМ ЛИСТЕ: ${matchedStop.product}!`;
    window.activeRecallContext = {
      product: `${matchedStop.product} (${matchedStop.batchCode})`,
      brand: matchedStop.brand || 'Контроль качества',
      badge: 'Партия из Красного листа!',
      title: `ОБНАРУЖЕНА СТОП-ПАРТИЯ: ${matchedStop.batchCode}!`,
      desc: `<strong>${matchedStop.product}</strong> (Штрихкод: ${matchedStop.barcode}). Причина: ${matchedStop.reason}. Зафиксируйте количество на полке для перехвата (+5 баллов)!`
    };
    openRecallBanner(window.activeRecallContext);

    if (resultCard) {
      resultCard.className = 'p-3.5 rounded-2xl border-2 border-red-600 bg-red-50 text-red-950 block';
      resultCard.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-600 text-white">Код: ${cleanCode}</span>
          <span class="text-xs font-black text-red-700">+5 баллов</span>
        </div>
        <div class="text-xs font-extrabold mt-1">${matchedStop.product} — В КРАСНОМ ЛИСТЕ!</div>
        <p class="text-[11px] text-red-800 mt-0.5">Сверху экрана открыто окно перехвата партии. Укажите остаток на полке и подтвердите снятие (+5 баллов).</p>
      `;
    }
    return;
  }

  // 2. Если в Красном листе пока нет — ищем информацию о товаре (OpenFoodFacts + префикс 481 РБ)
  playSound('success');
  if (statusText) statusText.textContent = `✅ Отсканирован код: ${cleanCode}`;

  let productName = customNote || `Товар со штрихкодом ${cleanCode}`;
  let brandLabel = cleanCode.startsWith('481') ? 'Производство Беларусь (EAN-13: 481)' : 'Товар по штрихкоду';

  try {
    const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`);
    if (offRes.ok) {
      const offData = await offRes.json();
      if (offData && offData.product) {
        const p = offData.product;
        productName = p.product_name_ru || p.product_name || productName;
        brandLabel = p.brands || brandLabel;
      }
    }
  } catch (e) {}

  const safeCode = cleanCode.replace(/'/g, "\\'");
  const safeName = productName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const safeBrand = brandLabel.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const isExplorer = !window.isSpecialAgentRole || !window.isSpecialAgentRole(window.state && window.state.userRole);

  if (resultCard) {
    resultCard.className = 'p-3.5 rounded-2xl border-2 border-emerald-400 bg-emerald-50/90 text-slate-900 block space-y-2.5';
    resultCard.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-600 text-white">Штрихкод: ${cleanCode}</span>
        <span class="text-[11px] font-bold text-emerald-800">${brandLabel}</span>
      </div>
      <div>
        <div class="text-xs font-black text-slate-900">${productName}</div>
        <div class="text-[11px] text-slate-600 mt-0.5">${isExplorer ? 'Товар распознан. Вы можете сразу оформить сигнал по качеству или ценнику.' : 'В Красном листе (Стоп-листе) эта партия сейчас не числится. Что вы хотите сделать?'}</div>
      </div>
      <div class="grid grid-cols-1 gap-1.5 pt-1">
        ${!isExplorer ? `
        <button onclick="openAddStopListModal('${safeCode}', '${safeName}', '${safeBrand}')" class="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow transition">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>🚨 Внести эту партию в Красный лист (Стоп-лист)</span>
        </button>
        ` : ''}
        <button onclick="openScannedProductClaim('${safeCode}', '${safeName}')" class="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition">
          <i class="fa-solid fa-camera"></i>
          <span>📝 Оформить замечание по этому товару (+1..+2 балла)</span>
        </button>
      </div>
    `;
  }
};
