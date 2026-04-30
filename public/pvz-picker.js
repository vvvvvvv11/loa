/**
 * pvz-picker.js — скрипт выбора ПВЗ
 * 
 * Подключить на странице оформления заказа:
 *   <script src="/pvz-picker.js"></script>
 *
 * HTML-разметка (минимальная):
 *   <input id="city" type="text" placeholder="Город">
 *   <button id="btn-pvz">Выбрать ПВЗ на карте</button>
 *   <input id="pvz-address" type="text" placeholder="Адрес отделения" readonly>
 *
 * Настройки — измените под свой сайт:
 */
const PVZ_CONFIG = {
  cityInputId:    'city',           // id поля "Город"
  addressInputId: 'pvz-address',    // id поля "Адрес отделения"
  buttonId:       'btn-pvz',        // id кнопки
  apiUrl:         '/get-pvz.php',   // URL эндпоинта
};

// ──────────────────────────────────────────────
// Основная логика (не трогать)
// ──────────────────────────────────────────────
(function () {
  'use strict';

  // Стили модального окна (инлайн, без внешних зависимостей)
  const MODAL_CSS = `
    #pvz-overlay {
      display:none; position:fixed; inset:0; background:rgba(0,0,0,.5);
      z-index:9999; align-items:center; justify-content:center;
    }
    #pvz-overlay.active { display:flex; }
    #pvz-modal {
      background:#fff; border-radius:10px; padding:24px;
      width:min(560px, 95vw); max-height:80vh; display:flex;
      flex-direction:column; gap:12px; box-shadow:0 8px 32px rgba(0,0,0,.2);
      font-family:system-ui,sans-serif;
    }
    #pvz-modal h3 { margin:0; font-size:18px; color:#222; }
    #pvz-search-row { display:flex; gap:8px; }
    #pvz-city-input {
      flex:1; padding:8px 12px; border:1px solid #ccc; border-radius:6px;
      font-size:15px;
    }
    #pvz-search-btn {
      padding:8px 16px; background:#0066cc; color:#fff; border:none;
      border-radius:6px; cursor:pointer; font-size:15px; white-space:nowrap;
    }
    #pvz-search-btn:hover { background:#0052a3; }
    #pvz-status { font-size:14px; color:#666; min-height:20px; }
    #pvz-list {
      overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;
    }
    .pvz-item {
      border:1px solid #e0e0e0; border-radius:8px; padding:12px 14px;
      cursor:pointer; transition:background .15s, border-color .15s;
    }
    .pvz-item:hover { background:#f0f6ff; border-color:#0066cc; }
    .pvz-item.selected { background:#e6f0ff; border-color:#0052a3; }
    .pvz-item-address { font-weight:600; font-size:15px; color:#111; }
    .pvz-item-city { font-size:13px; color:#888; margin-top:2px; }
    .pvz-item-hours { font-size:13px; color:#555; margin-top:4px; }
    .pvz-item-comment { font-size:12px; color:#888; margin-top:2px; }
    #pvz-footer { display:flex; justify-content:flex-end; gap:8px; }
    #pvz-confirm-btn {
      padding:9px 20px; background:#28a745; color:#fff; border:none;
      border-radius:6px; cursor:pointer; font-size:15px; display:none;
    }
    #pvz-confirm-btn:hover { background:#218838; }
    #pvz-close-btn {
      padding:9px 20px; background:#fff; color:#555; border:1px solid #ccc;
      border-radius:6px; cursor:pointer; font-size:15px;
    }
    #pvz-close-btn:hover { background:#f5f5f5; }
  `;

  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = MODAL_CSS;
    document.head.appendChild(s);
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'pvz-overlay';
    overlay.innerHTML = `
      <div id="pvz-modal">
        <h3>Выберите пункт выдачи</h3>
        <div id="pvz-search-row">
          <input id="pvz-city-input" type="text" placeholder="Введите город">
          <button id="pvz-search-btn">Найти</button>
        </div>
        <div id="pvz-status">Введите город для поиска</div>
        <div id="pvz-list"></div>
        <div id="pvz-footer">
          <button id="pvz-close-btn">Закрыть</button>
          <button id="pvz-confirm-btn">Выбрать этот ПВЗ ✓</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function init() {
    const btn = document.getElementById(PVZ_CONFIG.buttonId);
    if (!btn) return;

    injectStyles();
    const overlay = buildModal();

    const cityInput    = document.getElementById(PVZ_CONFIG.cityInputId);
    const addressInput = document.getElementById(PVZ_CONFIG.addressInputId);
    const modalCity    = overlay.querySelector('#pvz-city-input');
    const searchBtn    = overlay.querySelector('#pvz-search-btn');
    const status       = overlay.querySelector('#pvz-status');
    const list         = overlay.querySelector('#pvz-list');
    const confirmBtn   = overlay.querySelector('#pvz-confirm-btn');
    const closeBtn     = overlay.querySelector('#pvz-close-btn');

    let selectedPvz = null;

    // Открыть модальное окно
    btn.addEventListener('click', () => {
      modalCity.value = cityInput ? cityInput.value.trim() : '';
      overlay.classList.add('active');
      list.innerHTML = '';
      status.textContent = 'Введите город для поиска';
      confirmBtn.style.display = 'none';
      selectedPvz = null;
      if (modalCity.value) searchPvz(modalCity.value);
      else modalCity.focus();
    });

    // Закрыть
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Поиск
    searchBtn.addEventListener('click', () => searchPvz(modalCity.value.trim()));
    modalCity.addEventListener('keydown', e => { if (e.key === 'Enter') searchPvz(modalCity.value.trim()); });

    // Подтверждение выбора
    confirmBtn.addEventListener('click', () => {
      if (!selectedPvz) return;
      if (addressInput) addressInput.value = selectedPvz.address;
      // Обновляем поле города, если было нечёткое совпадение
      if (cityInput && selectedPvz.city) cityInput.value = selectedPvz.city;
      close();
    });

    function close() { overlay.classList.remove('active'); }

    async function searchPvz(city) {
      if (!city) { status.textContent = '⚠ Введите название города'; return; }

      status.textContent = '🔍 Поиск…';
      list.innerHTML = '';
      confirmBtn.style.display = 'none';
      selectedPvz = null;

      try {
        const resp = await fetch(`${PVZ_CONFIG.apiUrl}?city=${encodeURIComponent(city)}`);
        const data = await resp.json();

        if (data.error) { status.textContent = '❌ ' + data.error; return; }
        if (!Array.isArray(data) || data.length === 0) {
          status.textContent = `Пункты выдачи для «${city}» не найдены. Попробуйте другой город.`;
          return;
        }

        status.textContent = `Найдено ${data.length} пунктов выдачи:`;
        data.forEach(pvz => {
          const el = document.createElement('div');
          el.className = 'pvz-item';
          el.innerHTML = `
            <div class="pvz-item-address">📍 ${pvz.address || '—'}</div>
            ${pvz.city ? `<div class="pvz-item-city">${pvz.city}</div>` : ''}
            ${pvz.hours   ? `<div class="pvz-item-hours">🕐 ${pvz.hours}</div>` : ''}
            ${pvz.comment ? `<div class="pvz-item-comment">${pvz.comment}</div>` : ''}
          `;
          el.addEventListener('click', () => {
            list.querySelectorAll('.pvz-item').forEach(i => i.classList.remove('selected'));
            el.classList.add('selected');
            selectedPvz = pvz;
            confirmBtn.style.display = 'inline-block';
            confirmBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          list.appendChild(el);
        });
      } catch (err) {
        status.textContent = '❌ Ошибка сети. Проверьте подключение.';
        console.error('PVZ fetch error:', err);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
