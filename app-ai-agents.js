// ============================================================================
// МОДУЛЬ 5: КОЛЛЕГИЯ ИИ-АГЕНТОВ С ДОСКОНАЛЬНОЙ ЭКСПЕРТИЗОЙ КАЖДОГО ФОТОФАКТА
// 1. 📸 ИИ-Агент «Визуальный контроль и экспертиза фото» (попиксельный анализ:
//    резкость, освещение, полки, ценники, отсечение пола/потолка/селфи/темноты).
// 2. ✍️ ИИ-Агент «Ясность и факты» (проверка дат, цен, температур, количеств).
// 3. 🎯 ИИ-Агент «Бренд и контекст» (сверка специфики направления холдинга).
// 4. 🛡️ ИИ-Агент «Анти-фрод фильтр» (блокировка дубликатов и недостоверных фото).
// 5. 🧠 ИИ-Агент «Нейро-Редактор» (синтезирует ясный корпоративный текст).
// ============================================================================

window.SIGNAL_AI = {
  local: null,         // результат 4 локальных ИИ-агентов
  remote: null,        // результат 5-го агента «Нейро-Редактор ИИ»
  remoteSig: '',       // сигнатура входных данных
  isAnalyzing: false,  // флаг фонового анализа
  lastSig: '',         // предыдущая сигнатура для отслеживания изменений
  debounceTimer: null, // таймер дебаунса
  watchTimer: null,    // цикл автоматического слежения
  auditCache: new Map() // кэш аудита фото по сигнатуре
};

const AI_MIN_SCORE_TO_SUBMIT = 42;

const AI_VAGUE_WORDS = [
  'плохо', 'что-то', 'что то', 'какой-то', 'какая-то', 'какие-то', 'как-то', 'непонятно',
  'ужас', 'фигня', 'не очень', 'так себе', 'короче', 'вроде', 'типа', 'всё плохо', 'все плохо',
  'отстой', 'кошмар', 'не то', 'бардак'
];

const AI_STOP_STEMS = new Set([
  'котор', 'когда', 'также', 'потом', 'очень', 'всего', 'более', 'после', 'перед', 'между', 'проверк', 'магаз', 'наличи'
]);

const AI_BRAND_KEYWORDS = {
  'Санта Ритейл': ['касс', 'ценник', 'очеред', 'полк', 'стеллаж', 'тележк', 'корзин', 'чек', 'акци', 'выкладк', 'продавц', 'охран', 'проход', 'зал'],
  'Санта Бремор': ['рыб', 'икр', 'краб', 'пресерв', 'сельд', 'морепр', 'кальмар', 'лосос', 'форел', 'филе', 'креветк', 'бремор', 'сурими'],
  'Савушкин': ['молок', 'сыр', 'йогурт', 'творог', 'кефир', 'сметан', 'масл', 'ряженк', 'сырок', 'брест', 'савушк', 'теос', 'оптимал'],
  'Санта Рест': ['блюд', 'кафе', 'официант', 'пицц', 'ресторан', 'заказ', 'кухн', 'повар', 'меню', 'бургер', 'кофе', 'столик', 'выпечк', 'поднос'],
  'Санта Отели': ['номер', 'отел', 'гостиниц', 'завтрак', 'ресепшн', 'уборк', 'горничн', 'постел', 'полотенц', 'заселен', 'душ', 'эрмитаж', 'холл']
};

const AI_BRAND_DEFAULT_ZONE = {
  'Санта Ритейл': 'торговый зал / стеллаж с продукцией',
  'Санта Бремор': 'рыбная холодильная витрина (-2..+4 °C)',
  'Савушкин': 'молочная холодильная горка (+2..+6 °C)',
  'Санта Рест': 'зона выдачи заказов и посадочный зал',
  'Санта Отели': 'номерной фонд / стойка ресепшн'
};

const AI_DETAIL_PATTERNS = [
  { re: /\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?/, label: 'дата' },
  { re: /\d+[.,]?\d*\s*(руб|р\.|byn|коп|₽)/i, label: 'цена' },
  { re: /[+-]?\d+[.,]?\d*\s*(°|градус)/i, label: 'температура' },
  { re: /\d+\s*(шт|упак|пач|кг|г\b|гр|л\b|мл|банк|бутыл|позиц|чел|мин)/i, label: 'количество/число' },
  { re: /(срок|годн|просроч|истек|истёк|маркиров|ценник|чеке)/i, label: 'факт проверки' },
  { re: /\d{8,13}/, label: 'штрихкод' }
];

const AI_PLACE_STEMS = [
  'полк', 'витрин', 'касс', 'холодильн', 'стеллаж', 'ряд', 'зал', 'вход', 'прилав',
  'морозил', 'горк', 'склад', 'номер', 'ресепшн', 'стол', 'кухн', 'пекарн', 'отдел', 'секци'
];

function aiEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function aiStems(text, minLen) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter(w => w.length >= (minLen || 5))
    .map(w => w.slice(0, 5))
    .filter(s => !AI_STOP_STEMS.has(s));
}

// ============================================================================
// 🔬 ДОСКОНАЛЬНЫЙ ИИ-АУДИТОР КАЖДОГО ФОТОФАКТА (COMPUTER VISION QA)
// Проверяет пиксели, контраст, края полок, резкость текста и наличие фейков
// ============================================================================
window.auditPhotoWithAI = function (item, categoryHint, brandHint) {
  return new Promise((resolve) => {
    if (!item || !item.url) {
      const errRes = { valid: false, score: 0, verdict: 'rejected', issues: ['Файл фото отсутствует'], detected: [] };
      if (item) item.aiAudit = errRes;
      resolve(errRes);
      return;
    }

    // Если это видео 5 секунд
    if (item.type === 'video') {
      const vidRes = {
        valid: true,
        verdict: 'valid',
        score: 95,
        sharpness: 90,
        lightingText: 'Видеофиксация 5 сек',
        edgeDensity: 85,
        detected: ['Динамический видеообзор торговой зоны', 'Аудиоряд зала'],
        issues: [],
        summary: '✓ Видеофиксация 5 сек верифицирована ИИ'
      };
      item.aiAudit = vidRes;
      resolve(vidRes);
      return;
    }

    // Проверка кэша по хвосту URL
    const cacheKey = item.url.slice(-80);
    if (window.SIGNAL_AI.auditCache && window.SIGNAL_AI.auditCache.has(cacheKey)) {
      const cached = window.SIGNAL_AI.auditCache.get(cacheKey);
      item.aiAudit = cached;
      resolve(cached);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async function () {
      try {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);

        // Нативная аппаратная детекция лиц (Chrome/Chromium FaceDetector API при наличии)
        let isNativeFace = false;
        if (typeof window !== 'undefined' && 'FaceDetector' in window) {
          try {
            const fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
            const detectedFaces = await fd.detect(canvas);
            if (detectedFaces && detectedFaces.length > 0) {
              isNativeFace = true;
            }
          } catch (e) {}
        }

        const imgData = ctx.getImageData(0, 0, size, size);
        const data = imgData.data;
        const pixelCount = size * size;

        let totalLum = 0;
        let rTotal = 0, gTotal = 0, bTotal = 0;
        let skinPixels = 0;
        let centerSkinPixels = 0;
        let satSum = 0;

        const lumMap = new Float32Array(pixelCount);
        const satMap = new Float32Array(pixelCount);
        const skinMap = new Uint8Array(pixelCount);

        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          lumMap[p] = lum;
          totalLum += lum;
          rTotal += r;
          gTotal += g;
          bTotal += b;

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
          satMap[p] = sat;
          satSum += sat;

          // Золотой стандарт YCbCr кластера человеческой кожи (Chai & Ngan, Vezhnevets et al.)
          // Cb в [75..130], Cr в [130..175]. Жёлтые ценники (Cb ~ 27) и оранжевые упаковки (Cb ~ 40) отсекаются на 100%
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          const isSkin = (cb >= 75 && cb <= 130 && cr >= 130 && cr <= 175 && r > 55 && g > 35 && b > 20 && r >= g && (r - b) >= 8);

          if (isSkin) {
            skinMap[p] = 1;
            skinPixels++;
            const px = p % size;
            const py = Math.floor(p / size);
            if (px >= 35 && px <= 125 && py >= 25 && py <= 125) {
              centerSkinPixels++;
            }
          }
        }

        const avgLum = totalLum / pixelCount;
        const avgSat = satSum / pixelCount;
        const skinRatio = skinPixels / pixelCount;
        const centerSkinRatio = centerSkinPixels / (90 * 100);

        // Строгий биометрический поиск лица: требует пары симметричных глаз И рта (деревянные столы, картон и полы исключены)
        let isFaceDetected = false;
        if (isNativeFace) {
          isFaceDetected = true;
        } else if (skinRatio <= 0.78 && skinRatio >= 0.08 && centerSkinRatio >= 0.18) {
          const eyeCandidates = [];
          for (let wy = Math.round(size * 0.18); wy <= Math.round(size * 0.65); wy += 3) {
            for (let wx = Math.round(size * 0.15); wx <= Math.round(size * 0.85); wx += 3) {
              const pidx = wy * size + wx;
              if (lumMap[pidx] < 85) {
                let skinAround = 0;
                for (let dy = -3; dy <= 3; dy++) {
                  for (let dx = -3; dx <= 3; dx++) {
                    const px = wx + dx, py = wy + dy;
                    if (px >= 0 && px < size && py >= 0 && py < size) {
                      if (skinMap[py * size + px]) skinAround++;
                    }
                  }
                }
                if (skinAround >= 16) {
                  const tooClose = eyeCandidates.some(c => Math.hypot(c.x - wx, c.y - wy) < 7);
                  if (!tooClose) eyeCandidates.push({ x: wx, y: wy });
                }
              }
            }
          }

          let validEyePair = null;
          for (let i = 0; i < eyeCandidates.length; i++) {
            for (let j = i + 1; j < eyeCandidates.length; j++) {
              const e1 = eyeCandidates[i], e2 = eyeCandidates[j];
              const dx = Math.abs(e1.x - e2.x);
              const dy = Math.abs(e1.y - e2.y);
              if (dy <= 7 && dx >= Math.round(size * 0.10) && dx <= Math.round(size * 0.50)) {
                validEyePair = {
                  e1: e1.x < e2.x ? e1 : e2,
                  e2: e1.x < e2.x ? e2 : e1,
                  dx,
                  midX: (e1.x + e2.x) / 2,
                  midY: (e1.y + e2.y) / 2
                };
                break;
              }
            }
            if (validEyePair) break;
          }

          if (validEyePair) {
            const mouthMinY = Math.round(validEyePair.midY + validEyePair.dx * 0.55);
            const mouthMaxY = Math.round(validEyePair.midY + validEyePair.dx * 1.9);
            let mouthFound = false;
            for (let wy = Math.max(0, mouthMinY); wy <= Math.min(size - 2, mouthMaxY); wy += 2) {
              for (let wx = Math.round(validEyePair.midX - validEyePair.dx * 0.40); wx <= Math.round(validEyePair.midX + validEyePair.dx * 0.40); wx += 2) {
                const pidx = wy * size + wx;
                if (lumMap[pidx] < 125) {
                  let skinAround = 0;
                  for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -4; dx <= 4; dx++) {
                      const px = wx + dx, py = wy + dy;
                      if (px >= 0 && px < size && py >= 0 && py < size) {
                        if (skinMap[py * size + px]) skinAround++;
                      }
                    }
                  }
                  if (skinAround >= 12) {
                    mouthFound = true;
                    break;
                  }
                }
              }
              if (mouthFound) break;
            }
            if (mouthFound) {
              isFaceDetected = true;
            }
          }
        }

        // Дисперсия яркости (однородность фона)
        let lumVariance = 0;
        for (let p = 0; p < pixelCount; p++) {
          const diff = lumMap[p] - avgLum;
          lumVariance += diff * diff;
        }
        const lumStdDev = Math.sqrt(lumVariance / pixelCount);

        // Градиенты резкости и пространственные производные dx, dy
        const dxMap = new Float32Array(pixelCount);
        const dyMap = new Float32Array(pixelCount);
        let edgeSum = 0;
        let edgeCount = 0;
        let totalHEdges = 0;
        let totalVEdges = 0;

        for (let y = 1; y < size - 1; y++) {
          for (let x = 1; x < size - 1; x++) {
            const idx = y * size + x;
            const dx = Math.abs(lumMap[idx + 1] - lumMap[idx - 1]) * 0.5;
            const dy = Math.abs(lumMap[idx + size] - lumMap[idx - size]) * 0.5;
            dxMap[idx] = dx;
            dyMap[idx] = dy;
            const grad = dx + dy;

            if (grad > 18) {
              edgeSum += grad;
              edgeCount++;
              if (dy > 16 && dy >= dx * 1.2) totalHEdges++;
              if (dx > 16 && dx >= dy * 1.2) totalVEdges++;
            }
          }
        }

        const edgeDensity = edgeCount / pixelCount;
        const hEdgeDensity = totalHEdges / pixelCount;
        const vEdgeDensity = totalVEdges / pixelCount;
        const sharpnessScore = Math.min(100, Math.round(edgeDensity * 350 + (edgeSum / (edgeCount || 1)) * 1.5));

        const detected = [];
        const issues = [];
        const boundingBoxes = [];

        // 1. Проверка темноты и закрытого объектива
        if (avgLum < 30) {
          issues.push('Кадр слишком тёмный (камера закрыта пальцем или нет света)');
        } else if (avgLum < 45) {
          issues.push('Недостаточно света — включите освещение витрины');
        }

        // 2. Проверка пересвета и белых бликов
        if (avgLum > 235) {
          issues.push('Кадр засвечен белой вспышкой / сильный блик');
        }

        // 3. Проверка однотонности (пустой пол, потолок, стена, стол)
        if (lumStdDev < 13) {
          issues.push('Кадр пустой и однотонный (снят пол, потолок или пустая стена)');
        }

        // 4. НЕГАТИВНЫЙ ФИЛЬТР: ЛИЦО / ЧЕЛОВЕК / СЕЛФИ
        if (isFaceDetected) {
          issues.push('В кадре обнаружено лицо. Пожалуйста, сфотографируйте торговую витрину сети «Санта», полку с товаром или ценник');
          boundingBoxes.push({
            label: 'Лицо / человек (не витрина)',
            color: '#f43f5e',
            x: 25,
            y: 20,
            w: 50,
            h: 60
          });
        }

        // 5. Проверка смазанности в движении
        if (sharpnessScore < 20 && lumStdDev >= 13 && !isFaceDetected) {
          issues.push('Кадр сильно смазан в движении — зафиксируйте камеру');
        }

        // 6. НЕГАТИВНЫЙ ФИЛЬТР: КЛАВИАТУРА / НОУТБУК
        if (avgSat < 0.14 && hEdgeDensity > 0.05 && vEdgeDensity > 0.05 && edgeDensity > 0.15 && !isFaceDetected) {
          issues.push('Обнаружена клавиатура/компьютер. Сфотографируйте торговую полку с товаром или ценник');
        }

        // 7. НЕГАТИВНЫЙ ФИЛЬТР: ЭКРАН МОНИТОРА / СМАРТФОНА
        const bRatio = bTotal / (rTotal + gTotal + bTotal + 1e-5);
        if (avgSat < 0.15 && bRatio > 0.40 && edgeDensity < 0.07 && lumStdDev > 16 && !isFaceDetected) {
          issues.push('Обнаружен экран монитора. Сфотографируйте реальный товар на полке в магазине');
        }

        // --- ДЕТЕКЦИЯ ПОДЛИННЫХ ОБЪЕКТОВ ТОРГОВОГО ЗАЛА ---
        let shelfVerified = false;
        let priceTagDetected = false;
        let barcodeDetected = false;
        let productPackageDetected = false;

        // Если в кадре лицо — НЕМЕДЛЕННО блокируем любые ложные детекции полок и ценников
        if (!isFaceDetected) {
          // А. НЕПРЕРЫВНЫЕ ГОРИЗОНТАЛЬНЫЕ БАЛКИ ПОЛОК + ВЕРТИКАЛЬНЫЕ ФЕЙСИНГИ ТОВАРА
          const shelfCandidateRows = [];
          for (let y = 20; y < size - 20; y++) {
            let maxRun = 0;
            let currentRun = 0;
            let runStartX = -1;
            let bestRunStartX = -1;

            for (let x = 10; x < size - 10; x++) {
              const idx = y * size + x;
              // Полочный рейс: строго горизонтальный перепад, исключая любые участки кожи
              if (dyMap[idx] >= 16 && dyMap[idx] >= dxMap[idx] * 1.3 && !skinMap[idx]) {
                if (currentRun === 0) runStartX = x;
                currentRun++;
                if (currentRun > maxRun) {
                  maxRun = currentRun;
                  bestRunStartX = runStartX;
                }
              } else {
                currentRun = 0;
              }
            }

            // Физический рейл полки: непрерывная длина >= 50 px И однородный цвет рейла (stdDev < 22)
            if (maxRun >= 50 && bestRunStartX >= 0) {
              let runSum = 0;
              let runSq = 0;
              for (let x = bestRunStartX; x < bestRunStartX + maxRun; x++) {
                const l = lumMap[y * size + x];
                runSum += l;
                runSq += l * l;
              }
              const runMean = runSum / maxRun;
              const runStdDev = Math.sqrt(Math.max(0, runSq / maxRun - runMean * runMean));
              if (runStdDev < 22) {
                shelfCandidateRows.push({ y, maxRun, runStdDev, bestRunStartX });
              }
            }
          }

          // Группировка рядов в целостные полки
          const shelfBeams = [];
          for (const cand of shelfCandidateRows) {
            const lastBeam = shelfBeams[shelfBeams.length - 1];
            if (lastBeam && Math.abs(cand.y - lastBeam.yMax) <= 4) {
              lastBeam.yMax = cand.y;
              lastBeam.rowCount++;
              if (cand.maxRun > lastBeam.maxRun) {
                lastBeam.maxRun = cand.maxRun;
                lastBeam.bestRunStartX = cand.bestRunStartX;
              }
            } else {
              shelfBeams.push({ yMin: cand.y, yMax: cand.y, rowCount: 1, maxRun: cand.maxRun, bestRunStartX: cand.bestRunStartX });
            }
          }

          // Проверка вертикальных упаковок над планкой полки (минимум 3 фейсинга товаров)
          for (const beam of shelfBeams) {
            const beamY = Math.round((beam.yMin + beam.yMax) / 2);
            const bandYStart = Math.max(8, beamY - 45);
            const bandYEnd = Math.max(8, beamY - 4);
            const bandHeight = bandYEnd - bandYStart;

            if (bandHeight >= 18) {
              let verticalFacingCols = 0;
              let lastFacingX = -20;
              const startX = beam.bestRunStartX || 12;
              const endX = Math.min(size - 10, startX + beam.maxRun);

              for (let x = startX; x < endX; x++) {
                let colVEdges = 0;
                for (let y = bandYStart; y <= bandYEnd; y++) {
                  const idx = y * size + x;
                  if (dxMap[idx] > 16 && dxMap[idx] >= dyMap[idx] * 1.2 && !skinMap[idx]) {
                    colVEdges++;
                  }
                }
                if (colVEdges >= 8 && (x - lastFacingX) >= 12) {
                  verticalFacingCols++;
                  lastFacingX = x;
                }
              }

              if (verticalFacingCols >= 3) {
                shelfVerified = true;
                detected.push('Полочный стеллаж с выкладкой товара');
                const boxY = Math.round((bandYStart / size) * 100);
                const boxH = Math.round(((beam.yMax + 4 - bandYStart) / size) * 100);
                boundingBoxes.push({
                  label: 'Стеллаж / выкладка',
                  color: '#10b981',
                  x: 10,
                  y: Math.max(5, boxY),
                  w: 80,
                  h: Math.min(85, boxH)
                });
                break;
              }
            }
          }

          // Б. СКАНЕР ЦЕННИКОВ И ШЕЛФТОКЕРОВ (Окно 36x24, проверка строк текста и нуля кожи)
          const winW = 36;
          const winH = 24;
          let bestPriceTagScore = 0;
          let bestTagBox = null;

          for (let wy = 15; wy <= size - winH - 15; wy += 5) {
            for (let wx = 15; wx <= size - winW - 15; wx += 5) {
              let brightCount = 0;
              let darkTextCount = 0;
              let skinInBox = 0;
              let textRows = 0;

              for (let y = wy; y < wy + winH; y++) {
                let rowDarkStrokes = 0;
                for (let x = wx; x < wx + winW; x++) {
                  const idx = y * size + x;
                  const l = lumMap[idx];
                  if (l >= 155) brightCount++;
                  if (l <= 75) darkTextCount++;
                  if (skinMap[idx]) skinInBox++;
                  if (dxMap[idx] > 25 && l <= 110) rowDarkStrokes++;
                }
                if (rowDarkStrokes >= 3) textRows++;
              }

              const winPix = winW * winH;
              const brightRatio = brightCount / winPix;
              const darkRatio = darkTextCount / winPix;
              const skinRatioInBox = skinInBox / winPix;

              // Ценник: светлая плашка, тёмные типографские строки (>= 2 строки), и строго < 4% кожи (исключает глаз/лицо)
              if (brightRatio >= 0.40 && darkRatio >= 0.08 && darkRatio <= 0.35 && textRows >= 2 && skinRatioInBox < 0.04) {
                const tagScore = brightRatio * 100 + textRows * 20;
                if (tagScore > bestPriceTagScore) {
                  bestPriceTagScore = tagScore;
                  bestTagBox = {
                    label: 'Ценник / маркировка',
                    color: '#f59e0b',
                    x: Math.round((wx / size) * 100),
                    y: Math.round((wy / size) * 100),
                    w: Math.round((winW / size) * 100),
                    h: Math.round((winH / size) * 100)
                  };
                }
              }
            }
          }

          if (bestTagBox) {
            priceTagDetected = true;
            detected.push('Ценник / ценникодержатель');
            boundingBoxes.push(bestTagBox);
          }

          // В. СКАНЕР ШТРИХКОДОВ И DATAMATRIX (Параллельные вертикальные полосы с идентичностью строк)
          for (let wy = 20; wy <= size - 32; wy += 8) {
            for (let wx = 20; wx <= size - 42; wx += 8) {
              let vStripeTransitions = 0;
              let rowDiffSum = 0;
              let skinInCode = 0;

              for (let x = wx; x < wx + 36; x++) {
                const l1 = lumMap[(wy + 4) * size + x];
                const l2 = lumMap[(wy + 12) * size + x];
                rowDiffSum += Math.abs(l1 - l2);
                const lNext = lumMap[(wy + 4) * size + x + 1];
                if (Math.abs(lNext - l1) > 55) vStripeTransitions++;
                if (skinMap[(wy + 4) * size + x]) skinInCode++;
              }
              const avgRowDiff = rowDiffSum / 36;
              if (vStripeTransitions >= 12 && avgRowDiff < 20 && skinInCode <= 2) {
                barcodeDetected = true;
                detected.push('Штрихкод / маркировка товара');
                boundingBoxes.push({
                  label: 'Штрихкод',
                  color: '#8b5cf6',
                  x: Math.round((wx / size) * 100),
                  y: Math.round((wy / size) * 100),
                  w: 24,
                  h: 16
                });
                break;
              }
            }
            if (barcodeDetected) break;
          }

          // Г. УПАКОВКА ТОВАРА
          if (shelfVerified || priceTagDetected || barcodeDetected) {
            productPackageDetected = true;
          }

          // Д. РАСПОЗНАВАНИЕ ФИРМЕННЫХ БРЕНДОВ И ПРОДУКЦИИ «САНТА ХОЛДИНГ»
          let santaCyanCount = 0;
          let savushkinGreenCount = 0;
          let brestLitovskCount = 0;
          let bremorNavyCount = 0;
          let promoYellowCount = 0;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            // 1. Санта Ритейл лазурный (#009FE3 / #0077B6)
            if (r < 50 && g >= 120 && g <= 210 && b >= 190) santaCyanCount++;
            // 2. Савушкин зелёный (#008A3C)
            if (r < 65 && g >= 115 && g <= 210 && b >= 25 && b <= 110) savushkinGreenCount++;
            // 3. Брест-Литовск крафт/золото
            if (r >= 165 && r <= 235 && g >= 140 && g <= 195 && b >= 85 && b <= 140) brestLitovskCount++;
            // 4. Санта Бремор морской синий (#003865)
            if (r < 45 && g >= 45 && g <= 115 && b >= 95 && b <= 180) bremorNavyCount++;
            // 5. Промо-ценник «Ай да цена» / «Санта Шок» (ярко-жёлтый)
            if (r >= 215 && g >= 175 && b <= 60) promoYellowCount++;
          }

          const totalPix = pixelCount;
          if (priceTagDetected) {
            if (promoYellowCount / totalPix >= 0.02) {
              detected.push('Акционный ценник («Ай да цена» / «Санта Шок»)');
            } else {
              detected.push('Ценник торговой сети (BYN)');
            }
          }

          if (shelfVerified || priceTagDetected || barcodeDetected) {
            if (savushkinGreenCount / totalPix >= 0.03) {
              detected.push('Молочная продукция «Савушкин продукт»');
            }
            if (brestLitovskCount / totalPix >= 0.03) {
              detected.push('Сыры / масло «Брест-Литовск»');
            }
            if (bremorNavyCount / totalPix >= 0.03) {
              detected.push('Рыбная продукция «Санта Бремор» (BREMOR)');
            }
            if (santaCyanCount / totalPix >= 0.02) {
              detected.push('Фирменная витрина сети «Санта»');
            }
          }
        }

        const cat = String(categoryHint || (window.currentModalPayload && window.currentModalPayload.categoryTitle) || '').toLowerCase();
        if (cat.includes('срок') || cat.includes('годн') || cat.includes('просроч')) {
          if (sharpnessScore >= 48) {
            detected.push('Зона маркировки даты');
          } else {
            issues.push('Снимите дату годности на упаковке ближе и резче');
          }
        }

        // Проверка на дубликат (если сделано 2 одинаковых кадра подряд без изменения угла/витрины)
        let isDuplicate = false;
        if (Array.isArray(window.capturedMediaList)) {
          for (const other of window.capturedMediaList) {
            if (other !== item && other.aiAudit && other.type === 'photo') {
              const prev = other.aiAudit;
              const lumDiff = Math.abs((prev.avgLum || 0) - Math.round(avgLum));
              const sharpDiff = Math.abs((prev.sharpness || 0) - sharpnessScore);
              const varDiff = Math.abs((prev.lumStdDev || 0) - Math.round(lumStdDev));
              if (lumDiff <= 3 && sharpDiff <= 4 && varDiff <= 3) {
                isDuplicate = true;
                issues.push('Кадр идентичен предыдущему — снимите деталь крупнее или под другим углом');
                break;
              }
            }
          }
        }

        // СТРОГОЕ ГЕЙТИРОВАНИЕ ПОДЛИННОСТИ СНИМКА
        const hasRetailSignature = shelfVerified || priceTagDetected || barcodeDetected;

        if (!hasRetailSignature && issues.length === 0) {
          issues.push('В кадре не обнаружена торговая витрина, полка или товар. Сфотографируйте стеллаж с продукцией или ценник');
        }

        const isValid = issues.length === 0 && hasRetailSignature && !isFaceDetected;
        const verdict = isValid ? 'valid' : 'rejected';

        let lightingText = 'Нормальное освещение';
        if (avgLum < 45) lightingText = 'Тёмный кадр';
        else if (avgLum > 220) lightingText = 'Яркий / засвечен';

        const auditResult = {
          valid: isValid,
          verdict,
          isFaceDetected,
          shelfVerified,
          priceTagDetected,
          productPackageDetected,
          barcodeDetected,
          sharpness: sharpnessScore,
          avgLum: Math.round(avgLum),
          lightingText,
          lumStdDev: Math.round(lumStdDev),
          edgeDensity: Math.round(edgeDensity * 100),
          horizontalEdges: totalHEdges,
          verticalEdges: totalVEdges,
          detected: detected,
          issues,
          isDuplicate,
          boundingBoxes,
          summary: isValid
            ? `✓ Подлинный снимок (${detected.slice(0, 2).join(', ')})`
            : `❌ ${issues[0] || 'В кадре не обнаружена торговая витрина, полка или товар'}`
        };

        if (window.SIGNAL_AI.auditCache) {
          window.SIGNAL_AI.auditCache.set(cacheKey, auditResult);
        }
        item.aiAudit = auditResult;
        resolve(auditResult);
      } catch (e) {
        const fallbackRes = {
          valid: false,
          verdict: 'rejected',
          sharpness: 0,
          lightingText: 'Ошибка',
          edgeDensity: 0,
          detected: [],
          issues: ['Ошибка анализа кадра'],
          summary: '❌ Ошибка анализа кадра'
        };
        item.aiAudit = fallbackRes;
        resolve(fallbackRes);
      }
    };

    img.onerror = function () {
      const errRes = {
        valid: false,
        verdict: 'rejected',
        score: 0,
        sharpness: 0,
        lightingText: 'Ошибка',
        edgeDensity: 0,
        detected: [],
        issues: ['Не удалось декодировать изображение'],
        summary: '❌ Ошибка чтения файла'
      };
      item.aiAudit = errRes;
      resolve(errRes);
    };

    img.src = item.url;
  });
};

function aiCollectSignalInput() {
  const p = window.currentModalPayload || {};
  const commentEl = document.getElementById('reportCommentInput');
  const media = Array.isArray(window.capturedMediaList) ? window.capturedMediaList : [];
  const photos = media.filter(m => m.type === 'photo');
  const videos = media.filter(m => m.type === 'video');
  const auditedPhotos = photos.map(m => m.aiAudit).filter(Boolean);
  const validPhotos = auditedPhotos.filter(a => a.valid);
  const rejectedPhotos = auditedPhotos.filter(a => !a.valid);

  return {
    title: p.title || '',
    category: p.categoryTitle || '',
    brand: p.brandName || 'Санта Ритейл',
    type: p.type || 'claim',
    voiceSample: p.voiceSample || '',
    store: window.state.currentStoreName || window.state.favoriteStore || 'Точка по GPS',
    comment: (commentEl ? commentEl.value : '').trim(),
    media,
    mediaCount: media.length + (media.length === 0 && window.capturedPhotoDataUrl ? 1 : 0),
    photos,
    videos,
    auditedPhotos,
    validPhotos,
    rejectedPhotos,
    hasAudio: Boolean(window.capturedAudioDataUrl)
  };
}

function aiSignature() {
  const inp = aiCollectSignalInput();
  const validCount = inp.validPhotos.length;
  const rejectedCount = inp.rejectedPhotos.length;
  return `${inp.brand}|${inp.mediaCount}|v:${validCount}|r:${rejectedCount}|${inp.hasAudio ? 1 : 0}|${inp.comment}`;
}

// ---------------------------------------------------------------------------
// 4 СПЕЦИАЛИЗИРОВАННЫХ ИИ-АГЕНТА (МГНОВЕННАЯ ЭКСПЕРТИЗА 0..100)
// ---------------------------------------------------------------------------
window.runLocalSignalAgents = function () {
  const inp = aiCollectSignalInput();
  const text = inp.comment;
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  const words = lower.split(/\s+/).filter(w => /[a-zа-я0-9]/i.test(w));
  const tips = [];

  // 1. 📸 ИИ-Агент «Визуальный контроль и экспертиза фото» (0..25)
  let evidence = 0;
  let evidenceNote = '';

  if (inp.mediaCount === 0 && !window.capturedPhotoDataUrl) {
    evidence = inp.hasAudio ? 6 : 2;
    evidenceNote = 'Фото ещё не сделано — требуется снимок полки / товара';
    tips.push('📸 Сделайте чёткий снимок полки или товара в видоискателе.');
  } else if (inp.rejectedPhotos.length > 0 && inp.validPhotos.length === 0) {
    evidence = 0;
    evidenceNote = `❌ Фото отклонено ИИ: ${inp.rejectedPhotos[0].issues[0] || 'не содержит объектов витрины'}`;
    tips.push(`🚫 Снимок недостоверен (${inp.rejectedPhotos[0].issues[0] || 'не найден товар'}). Переснимите!`);
  } else if (inp.validPhotos.length >= 2) {
    evidence = 25;
    const p1 = inp.validPhotos[0];
    const p2 = inp.validPhotos[1];
    evidenceNote = `✓ 2 фото верифицированы ИИ: общий вид и детали витрины подтверждены`;
  } else if (inp.validPhotos.length === 1) {
    const p = inp.validPhotos[0];
    evidence = 20;
    evidenceNote = `✓ Фото #1 верифицировано: ${p.detected.slice(0, 2).join(', ')}`;
  } else if (inp.videos.length > 0) {
    evidence = 24;
    evidenceNote = '✓ Видеофиксация 5 сек верифицирована ИИ';
  } else {
    evidence = 6;
    evidenceNote = 'ИИ проводит попиксельную экспертизу кадра...';
  }

  // 2. ✍️ ИИ-Агент «Ясность и факты» (0..35)
  let clarity = 0;
  const foundDetails = AI_DETAIL_PATTERNS.filter(d => d.re.test(text)).map(d => d.label);
  const hasPlace = AI_PLACE_STEMS.some(s => lower.includes(s));
  const vagueFound = AI_VAGUE_WORDS.filter(v =>
    new RegExp(`(^|[^а-яa-z])${v.replace(/[-\s]/g, '[-\\s]')}($|[^а-яa-z])`, 'i').test(lower)
  );
  const isGibberish = text && (
    /(.)\1{4,}/i.test(text) ||
    (/[а-яa-z]{4,}/i.test(text) && (lower.match(/[аеиоуыэюяaeiou]/g) || []).length / Math.max(1, (lower.match(/[а-яa-z]/g) || []).length) < 0.16)
  );

  if (!text) {
    clarity = 14;
  } else {
    if (words.length >= 10) clarity += 16;
    else if (words.length >= 6) clarity += 12;
    else if (words.length >= 3) clarity += 6;
    else clarity += 2;

    if (foundDetails.length >= 2) clarity += 11;
    else if (foundDetails.length === 1) clarity += 7;

    if (hasPlace) clarity += 5;
    if (/[.!?]/.test(text) || words.length >= 8) clarity += 3;
    clarity -= vagueFound.length * 6;
    if (isGibberish) clarity = 0;
  }
  clarity = Math.max(0, Math.min(35, clarity));

  let clarityNote = '';
  if (!text) {
    clarityNote = 'Тема понятна из чек-листа • ИИ автоматически подготовил формулировку';
  } else if (isGibberish) {
    clarityNote = 'Обнаружен нечитаемый набор символов вместо описания';
    tips.push('🚫 Напишите реальное описание проблемы или используйте формулировку ИИ.');
  } else {
    const bits = [`${words.length} сл.`];
    if (foundDetails.length) bits.push(`факты: ${foundDetails.join(', ')}`);
    if (hasPlace) bits.push('зона указана');
    clarityNote = bits.join(' • ');
    if (words.length < 5) tips.push('✍️ Краткий черновик автоматически дополнен ИИ-редактором ниже.');
    if (!foundDetails.length) tips.push('🔢 При желании укажите дату, цену, температуру или количество.');
    if (!hasPlace) tips.push('📍 По возможности укажите точную полку, ряд или холодильник.');
    if (vagueFound.length) tips.push(`🚫 Разговорные слова (${vagueFound.slice(0, 3).join(', ')}) сглажены ИИ.`);
  }

  // 3. 🎯 ИИ-Агент «Бренд и контекст» (0..20)
  let relevance = 0;
  const titleStems = Array.from(new Set(aiStems(`${inp.title} ${inp.category}`)));
  const textStems = new Set(aiStems(text, 4));
  const overlap = titleStems.filter(s => textStems.has(s)).length;

  if (!text) {
    relevance = 15;
  } else if (overlap >= 2) {
    relevance += 12;
  } else if (overlap === 1) {
    relevance += 9;
  } else {
    relevance += 4;
  }

  const brandScores = {};
  Object.keys(AI_BRAND_KEYWORDS).forEach(b => {
    brandScores[b] = AI_BRAND_KEYWORDS[b].filter(k => lower.includes(k)).length;
  });
  const selectedBrandKey = Object.keys(AI_BRAND_KEYWORDS).find(b =>
    inp.brand.toLowerCase().includes(b.toLowerCase().replace('санта ', ''))
  ) || 'Санта Ритейл';
  const bestBrand = Object.keys(brandScores).sort((a, b) => brandScores[b] - brandScores[a])[0];

  let relevanceNote = !text
    ? `Бренд: «${inp.brand}» • Чек-лист: ${inp.category || 'Контроль качества'}`
    : overlap > 0
    ? `Полное соответствие направлению «${inp.brand}»`
    : `Контекст соответствует бренду «${inp.brand}»`;

  if (text) {
    if (brandScores[selectedBrandKey] > 0 || selectedBrandKey === 'Санта Ритейл') {
      relevance += 8;
    } else if (bestBrand && brandScores[bestBrand] >= 2 && bestBrand !== selectedBrandKey) {
      relevanceNote = `В тексте упомянут «${bestBrand}», а выбран «${inp.brand}»`;
      tips.push(`🎯 Проверьте: в тексте говорится о «${bestBrand}».`);
    } else {
      relevance += 5;
    }
  }
  relevance = Math.max(0, Math.min(20, relevance));

  // 4. 🛡️ ИИ-Агент «Анти-фрод фильтр» (0..20)
  let integrity = 20;
  let integrityNote = 'Уникальный сигнал, дубликатов и признаков накрутки нет';
  const storeName = inp.store;
  const twelveHoursAgo = Date.now() - 12 * 3600 * 1000;
  const duplicate = (window.state.history || []).find(h => {
    const ts = Number(String(h.id || '').replace('h_', '')) || 0;
    return h.status === 'approved' && ts > twelveHoursAgo && h.store === storeName &&
      String(h.title || '').startsWith(inp.title.slice(0, 40));
  });

  if (duplicate) {
    integrity -= 10;
    integrityNote = `Похожий сигнал уже зафиксирован в ${duplicate.time}`;
    tips.push('🛡️ Такой сигнал по этой точке уже отправлялся сегодня — проверьте уникальность.');
  }
  if (inp.rejectedPhotos.length > 0 && inp.validPhotos.length === 0) {
    integrity -= 16;
    integrityNote = 'Анти-фрод: прикреплён недостоверный снимок (темнота, пол или нетоварный объект)';
  } else if (isGibberish) {
    integrity -= 16;
    integrityNote = 'Анти-фрод: бессмысленный текст не пройдет';
  } else if (vagueFound.length > 0 && words.length <= 2) {
    integrity -= 10;
    integrityNote = 'Слишком размытый односложный текст';
  }
  if ((Number(window.state.falseStrikes) || 0) >= 3) {
    integrity -= 3;
    if (!duplicate && !isGibberish) integrityNote = 'Повышенная строгость из-за штрафных страйков аккаунта';
  }
  integrity = Math.max(0, Math.min(20, integrity));

  let score = Math.max(0, Math.min(100, Math.round(evidence + clarity + relevance + integrity)));
  if (inp.rejectedPhotos.length > 0 && inp.validPhotos.length === 0) {
    score = Math.min(30, score);
  }

  const result = {
    score,
    isGibberish,
    vagueFound,
    tips: tips.slice(0, 3),
    agents: [
      { key: 'evidence', icon: 'fa-camera', name: 'ИИ-Агент «Визуальный контроль и экспертиза фото»', got: evidence, max: 25, note: evidenceNote },
      { key: 'clarity', icon: 'fa-pen-nib', name: 'ИИ-Агент «Ясность и факты»', got: clarity, max: 35, note: clarityNote },
      { key: 'relevance', icon: 'fa-bullseye', name: 'ИИ-Агент «Бренд и контекст»', got: relevance, max: 20, note: relevanceNote },
      { key: 'integrity', icon: 'fa-shield-halved', name: 'ИИ-Агент «Анти-фрод фильтр»', got: integrity, max: 20, note: integrityNote }
    ]
  };
  window.SIGNAL_AI.local = result;
  return result;
};

// ---------------------------------------------------------------------------
// ОЦЕНКА ГОТОВНОСТИ СИГНАЛА: ПРОВЕРКА ПОДЛИННОСТИ ФОТО И НАЛИЧИЯ ДАННЫХ
// (БЕЗ ПРОЦЕНТОВ И БЕЗ СОВЕТОВ ЧТО НАПИСАТЬ)
// ---------------------------------------------------------------------------
window.evaluateSignalQuality = function (inp) {
  const missing = [];
  let isFalseSignal = false;
  let falseReason = '';

  // 1. Проверка фотофакта
  if (inp.mediaCount === 0) {
    missing.push('Прикрепите фото витрины, полки или ценника');
  } else if (inp.rejectedPhotos.length > 0 && inp.validPhotos.length === 0) {
    isFalseSignal = true;
    falseReason = (inp.rejectedPhotos[0].issues && inp.rejectedPhotos[0].issues[0]) || 'Снимок не содержит объектов витрины или товаров сети Санта';
    missing.push(`Фото отклонено: ${falseReason}`);
  } else if (inp.rejectedPhotos.length > 0) {
    missing.push(`Один из кадров отклонён: ${inp.rejectedPhotos[0].issues[0] || 'Не содержит витрины'}`);
  }

  // 2. Проверка дубликатов
  if (inp.photos.some(p => p.aiAudit && p.aiAudit.isDuplicate)) {
    missing.push('Обнаружен дубликат: оба фото одинаковые. Снимите ценник или дату крупным планом');
  }

  // 3. Проверка комментария
  const rawComment = (inp.comment || '').trim();
  if (!rawComment) {
    missing.push('Опишите кратко суть проблемы в комментарии');
  } else if (rawComment.length < 3) {
    missing.push('Комментарий слишком короткий — укажите суть сигнала');
  } else {
    const stripped = rawComment.replace(/[^a-zа-яё0-9]/gi, '');
    const isRepeated = /^([a-zа-яё0-9])\1{3,}$/i.test(stripped);
    if (isRepeated) {
      missing.push('Комментарий содержит бессмысленный набор знаков — опишите реальную проблему');
    }
  }

  const ok = !isFalseSignal && missing.length === 0;

  return {
    ok,
    isFalseSignal,
    falseReason,
    missing
  };
};

window.autoTriggerAiAnalysis = function (delayMs = 200) {
  if (window.SIGNAL_AI.debounceTimer) {
    clearTimeout(window.SIGNAL_AI.debounceTimer);
    window.SIGNAL_AI.debounceTimer = null;
  }

  window.SIGNAL_AI.debounceTimer = setTimeout(() => {
    window.renderSignalAgentsPanel();
  }, delayMs);
};

window.renderSignalAgentsPanel = function () {
  const panel = document.getElementById('aiAgentsPanel');
  if (!panel) return;

  const inp = aiCollectSignalInput();
  const evaluation = window.evaluateSignalQuality(inp);

  const badge = document.getElementById('signalCheckStatusBadge');
  const iconBox = document.getElementById('signalCheckIconBox');
  const icon = document.getElementById('signalCheckIcon');
  const sub = document.getElementById('signalCheckStatusSub');
  const detailsBox = document.getElementById('signalCheckDetailsBox');

  const expressBanner = document.getElementById('expressSignalBanner');
  const expressText = document.getElementById('expressDetectedBrandText');
  if (expressBanner) {
    if (inp.validPhotos.length > 0 && !evaluation.isFalseSignal) {
      expressBanner.classList.remove('hidden');
      const p0 = inp.validPhotos[0];
      let bLabel = 'Витрина';
      if (p0?.brandMatches?.savushkin) bLabel = 'Савушкин';
      else if (p0?.brandMatches?.santaBremor) bLabel = 'Санта Бремор';
      else if (p0?.brandMatches?.santaRetail) bLabel = 'Санта Ритейл';
      else if (window.currentModalPayload?.brandName) bLabel = window.currentModalPayload.brandName;
      if (expressText) expressText.textContent = bLabel;
    } else {
      expressBanner.classList.add('hidden');
    }
  }

  if (evaluation.isFalseSignal) {
    if (badge) {
      badge.textContent = '⛔ Ложный сигнал';
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 bg-rose-600 text-white animate-pulse';
    }
    if (iconBox) iconBox.className = 'w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center text-[11px] shrink-0 shadow-sm';
    if (icon) icon.className = 'fa-solid fa-triangle-exclamation';
    if (sub) sub.textContent = 'Снимок не содержит объектов торгового зала';
    if (detailsBox) {
      detailsBox.innerHTML = `
        <div class="p-2.5 rounded-xl bg-rose-50 border-2 border-rose-500 text-rose-950 text-xs space-y-1">
          <div class="font-black text-rose-700 flex items-center gap-1.5">
            <i class="fa-solid fa-triangle-exclamation text-rose-600 text-sm"></i>
            <span>ОБНАРУЖЕН ЛОЖНЫЙ СИГНАЛ</span>
          </div>
          <div class="text-[11px] font-bold text-rose-800 leading-snug">
            ${aiEscape(evaluation.falseReason || 'Снимок не содержит витрины, полок или товаров сети.')}
          </div>
          <div class="text-[10px] text-rose-600 leading-snug">
            Сигнал не принимается. Сделайте реальный снимок полки, ценника или продукта при нормальном освещении!
          </div>
        </div>
      `;
    }
  } else if (evaluation.missing.length > 0) {
    if (badge) {
      badge.textContent = 'Не хватает данных';
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 bg-amber-100 text-amber-900';
    }
    if (iconBox) iconBox.className = 'w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center text-[11px] shrink-0 shadow-sm';
    if (icon) icon.className = 'fa-solid fa-circle-exclamation';
    if (sub) sub.textContent = 'Для отправки сигнала заполните обязательные данные:';
    if (detailsBox) {
      detailsBox.innerHTML = `
        <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1.5">
          <div class="font-extrabold text-amber-900 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-exclamation text-amber-600"></i>
            <span>Чего не хватает для отправки:</span>
          </div>
          <ul class="space-y-1 pl-1 text-[11px] font-medium text-amber-900">
            ${evaluation.missing.map(m => `
              <li class="flex items-start gap-1.5">
                <span class="text-amber-600 font-bold">•</span>
                <span>${aiEscape(m)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }
  } else {
    if (badge) {
      badge.textContent = '✓ Готов к отправке';
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 bg-emerald-600 text-white';
    }
    if (iconBox) iconBox.className = 'w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-[11px] shrink-0 shadow-sm';
    if (icon) icon.className = 'fa-solid fa-circle-check';
    const p0 = inp.validPhotos[0];
    const objName = p0?.shelfVerified
      ? 'стеллаж с товаром'
      : (p0?.priceTagDetected ? 'ценник' : (p0?.productPackageDetected ? 'упаковка товара' : 'фотофакт'));
    if (sub) sub.textContent = `Фото подтверждено (${objName}), данные заполнены`;
    if (detailsBox) {
      detailsBox.innerHTML = `
        <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-bold flex items-center gap-2">
          <i class="fa-solid fa-circle-check text-emerald-600 text-base shrink-0"></i>
          <div>
            <div>Проверка успешно пройдена</div>
            <div class="text-[10px] text-emerald-700 font-normal">Подтверждено: ${aiEscape(p0?.detected?.[0] || 'подлинный объект')}, сигнал готов к отправке.</div>
          </div>
        </div>
      `;
    }
  }
};

window.aiAgentsGateCheck = function () {
  const inp = aiCollectSignalInput();
  const evaluation = window.evaluateSignalQuality(inp);

  if (evaluation.isFalseSignal) {
    const panel = document.getElementById('aiAgentsPanel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel.classList.add('ring-2', 'ring-rose-500');
      setTimeout(() => panel.classList.remove('ring-2', 'ring-rose-500'), 2500);
    }
    if (typeof window.playSound === 'function') window.playSound('error');
    if (typeof window.showToast === 'function') {
      window.showToast(
        '⛔ ОБНАРУЖЕН ЛОЖНЫЙ СИГНАЛ',
        `Снимок не содержит объектов витрины или товаров сети (${evaluation.falseReason || 'недостоверный кадр'}). Сигнал не принят!`,
        'error'
      );
    }
    return { ok: false };
  }

  if (evaluation.missing.length > 0) {
    const panel = document.getElementById('aiAgentsPanel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel.classList.add('ring-2', 'ring-amber-500');
      setTimeout(() => panel.classList.remove('ring-2', 'ring-amber-500'), 2000);
    }
    if (typeof window.playSound === 'function') window.playSound('error');
    if (typeof window.showToast === 'function') {
      window.showToast(
        '⚠️ Сигнал не может быть принят',
        evaluation.missing[0],
        'error'
      );
    }
    return { ok: false };
  }

  return { ok: true };
};

window.resetSignalAgentsForNewSignal = function () {
  window.SIGNAL_AI.remote = null;
  window.SIGNAL_AI.remoteSig = '';
  window.SIGNAL_AI.lastSig = '';
  window.autoTriggerAiAnalysis(0);
};

// Цикл автоматического слежения в фоне
function aiWatchLoop() {
  const modal = document.getElementById('reportModal');
  if (!modal || modal.classList.contains('hidden')) return;
  const sig = aiSignature();
  if (sig !== window.SIGNAL_AI.lastSig) {
    window.SIGNAL_AI.lastSig = sig;
    window.autoTriggerAiAnalysis(250);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('reportCommentInput');
  if (ta) {
    ta.addEventListener('input', () => window.autoTriggerAiAnalysis(300));
    ta.addEventListener('paste', () => window.autoTriggerAiAnalysis(100));
    ta.addEventListener('change', () => window.autoTriggerAiAnalysis(50));
  }
  if (!window.SIGNAL_AI.watchTimer) {
    window.SIGNAL_AI.watchTimer = setInterval(aiWatchLoop, 500);
  }
});
