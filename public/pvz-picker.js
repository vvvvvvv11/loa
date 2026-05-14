/**
 * pvz-picker.js — скрипт выбора ПВЗ (пункты выдачи)
 * 
 * Подключить на странице оформления заказа:
 *   <script src="/public/pvz-picker.js"></script>
 *
 * HTML-разметка (минимальная):
 *   <input id="city" type="text" placeholder="Город">
 *   <button id="btn-pvz">Выбрать ПВЗ</button>
 *   <input id="pvz-address" type="text" placeholder="Адрес отделения" readonly>
 *
 * Настройки:
 */
const PVZ_CONFIG = {
  cityInputId:    'cityInput',        // id поля "Город"
  addressInputId: 'pvz-address',      // id поля "Адрес отделения"
  buttonId:       'searchBtn',        // id кнопки
  pvzDataUrl:     '/public/pvz.json', // URL файла с данными ПВЗ
};

// ──────────────────────────────────────────────
// Основная логика
// ──────────────────────────────────────────────
(function () {
  'use strict';

  let pvzData = null;

  // Стили модального окна
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
    #pvz-search-row { display:flex; gap:8px; margin-bottom:8px; }
    #pvz-city-input {
      flex:1; padding:10px 12px; border:1px solid #ddd; border-radius:6px;
      font-size:15px; font-family:inherit;
    }
    #pvz-city-input:focus { outline:none; border-color:#0066cc; }
    #pvz-search-btn {
      padding:10px 20px; background:#0066cc; color:#fff; border:none;
      border-radius:6px; cursor:pointer; font-size:15px; white-space:nowrap;
      font-weight:600; transition:background .15s;
    }
    #pvz-search-btn:hover { background:#0052a3; }
    #pvz-search-btn:active { transform:scale(0.98); }
    #pvz-status { 
      font-size:14px; color:#666; min-height:20px; 
      padding:8px; background:#f9f9f9; border-radius:4px;
    }
    #pvz-list {
      overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;
    }
    .pvz-item {
      border:1px solid #e0e0e0; border-radius:8px; padding:12px 14px;
      cursor:pointer; transition:background .15s, border-color .15s;
      background:#fff;
    }
    .pvz-item:hover { 
      background:#f0f6ff; 
      border-color:#0066cc; 
      box-shadow: 0 2px 8px rgba(0,102,204,.1);
    }
    .pvz-item.selected { 
      background:#e6f0ff; 
      border-color:#0052a3;
      box-shadow: 0 2px 12px rgba(0,102,204,.2);
    }
    .pvz-item-address { 
      font-weight:600; 
      font-size:15px; 
      color:#111; 
      margin-bottom:4px;
    }
    .pvz-item-hours { 
      font-size:13px; 
      color:#0066cc; 
      margin-top:4px;
      font-weight:500;
    }
    .pvz-item-comment { 
      font-size:12px; 
      color:#888; 
      margin-top:3px; 
      font-style:italic;
    }
    #pvz-footer { 
      display:flex; 
      justify-content:flex-end; 
      gap:8px; 
      margin-top:8px;
      border-top:1px solid #eee;
      padding-top:12px;
    }
    #pvz-confirm-btn {
      padding:10px 24px; 
      background:#28a745; 
      color:#fff; 
      border:none;
      border-radius:6px; 
      cursor:pointer; 
      font-size:15px; 
      display:none;
      font-weight:600;
      transition:background .15s;
    }
    #pvz-confirm-btn:hover { background:#218838; }
    #pvz-confirm-btn:disabled { background:#ccc; cursor:not-allowed; }
    #pvz-close-btn {
      padding:10px 24px; 
      background:#fff; 
      color:#555; 
      border:1px solid #ddd;
      border-radius:6px; 
      cursor:pointer; 
      font-size:15px;
      transition:background .15s;
      font-weight:500;
    }
    #pvz-close-btn:hover { background:#f5f5f5; }
    
    @media (max-width: 600px) {
      #pvz-modal {
        width:100%;
        height:100%;
        border-radius:0;
        padding:16px;
      }
      #pvz-search-row {
        flex-direction:column;
      }
      #pvz-search-btn {
        width:100%;
      }
    }
  `;

  function injectStyles() {
    const existing = document.getElementById('pvz-styles');
    if (existing) return; // Избегаем дублирования стилей

    const s = document.createElement('style');
    s.id = 'pvz-styles';
    s.textContent = MODAL_CSS;
    document.head.appendChild(s);
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'pvz-overlay';
    overlay.innerHTML = `
      <div id="pvz-modal">
        <h3>📍 Выберите пункт выдачи</h3>
        <div id="pvz-search-row">
          <input id="pvz-city-input" type="text" placeholder="Введите город или регион" autocomplete="off">
          <button id="pvz-search-btn">🔍 Найти</button>
        </div>
        <div id="pvz-status">Введите город для поиска</div>
        <div id="pvz-list"></div>
        <div id="pvz-footer">
          <button id="pvz-close-btn">Отмена</button>
          <button id="pvz-confirm-btn">✅ Выбрать</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  async function loadPvzData() {
    if (pvzData) return pvzData;

    try {
      const response = await fetch(PVZ_CONFIG.pvzDataUrl);
      if (!response.ok) throw new Error('Failed to load PVZ data');
      pvzData = await response.json();
      return pvzData;
    } catch (err) {
      console.error('PVZ data load error:', err);
      return null;
    }
  }

  function init() {
    injectStyles();
    const overlay = buildModal();

    const cityInput    = document.getElementById(PVZ_CONFIG.cityInputId);
    const addressInput = document.getElementById(PVZ_CONFIG.addressInputId);
    const searchBtn    = document.getElementById(PVZ_CONFIG.buttonId);
    
    if (!searchBtn) return console.error('PVZ button not found');

    const modalCity    = overlay.querySelector('#pvz-city-input');
    const modalSearchBtn = overlay.querySelector('#pvz-search-btn');
    const status       = overlay.querySelector('#pvz-status');
    const list         = overlay.querySelector('#pvz-list');
    const confirmBtn   = overlay.querySelector('#pvz-confirm-btn');
    const closeBtn     = overlay.querySelector('#pvz-close-btn');

    let selectedPvz = null;

    // Открыть модальное окно
    searchBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      if (!pvzData) {
        status.textContent = '⏳ Загрузка данных...';
        pvzData = await loadPvzData();
        if (!pvzData) {
          status.textContent = '❌ Ошибка загрузки данных';
          return;
        }
      }

      modalCity.value = cityInput ? cityInput.value.trim() : '';
      overlay.classList.add('active');
      list.innerHTML = '';
      status.textContent = 'Введите город для поиска';
      confirmBtn.style.display = 'none';
      selectedPvz = null;
      
      if (modalCity.value) {
        searchPvz(modalCity.value);
      } else {
        modalCity.focus();
      }
    });

    // Закрыть
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { 
      if (e.target === overlay) close(); 
    });

    // Поиск
    modalSearchBtn.addEventListener('click', () => searchPvz(modalCity.value.trim()));
    modalCity.addEventListener('keydown', e => { 
      if (e.key === 'Enter') {
        e.preventDefault();
        searchPvz(modalCity.value.trim());
      }
    });

    // Подтверждение выбора
    confirmBtn.addEventListener('click', () => {
      if (!selectedPvz) return;
      if (addressInput) {
        addressInput.value = selectedPvz.address || selectedPvz;
      }
      
      // Сохраняем данные в localStorage
      localStorage.setItem('selectedPvz', JSON.stringify(selectedPvz));
      localStorage.setItem('selectedCity', modalCity.value.trim());
      
      close();

      // Показываем тост подтверждения
      showToast('✅ Пункт выдачи выбран');
    });

    function close() { 
      overlay.classList.remove('active'); 
    }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.style.cssText = `
        position:fixed; bottom:20px; left:20px; background:rgba(0,0,0,.9);
        color:#fff; padding:14px 20px; border-radius:50px; font-size:13px;
        z-index:10000; animation:slideUp .3s ease;
      `;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }

    async function searchPvz(city) {
      if (!city) { 
        status.textContent = '⚠️ Введите название города'; 
        return; 
      }

      status.textContent = '🔍 Поиск…';
      list.innerHTML = '';
      confirmBtn.style.display = 'none';
      selectedPvz = null;

      try {
        // Поиск в pvzData
        const foundCity = Object.keys(pvzData || {}).find(key =>
          key.toLowerCase().includes(city.toLowerCase()) || 
          city.toLowerCase().includes(key.toLowerCase())
        );

        if (!foundCity) {
          status.textContent = `❌ Пункты выдачи для «${city}» не найдены. Попробуйте другой город.`;
          return;
        }

        const pvzArray = pvzData[foundCity] || [];
        if (pvzArray.length === 0) {
          status.textContent = `❌ Для «${foundCity}» нет доступных пунктов выдачи.`;
          return;
        }

        status.textContent = `✅ Найдено ${pvzArray.length} пунктов выдачи в ${foundCity}:`;

        pvzArray.forEach((pvz, index) => {
          const el = document.createElement('div');
          el.className = 'pvz-item';
          el.dataset.index = index;
          
          const address = typeof pvz === 'string' ? pvz : (pvz.address || 'Не указан');
          const hours = pvz.hours ? `🕐 ${pvz.hours}` : '';
          const comment = pvz.comment ? `📝 ${pvz.comment}` : '';

          el.innerHTML = `
            <div class="pvz-item-address">📍 ${address}</div>
            ${hours ? `<div class="pvz-item-hours">${hours}</div>` : ''}
            ${comment ? `<div class="pvz-item-comment">${comment}</div>` : ''}
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
        status.textContent = '❌ Ошибка при поиске. Проверьте подключение.';
        console.error('PVZ search error:', err);
      }
    }
  }

  // Инициализировать после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Экспортируем для внешнего использования
  window.PVZPicker = {
    loadData: loadPvzData,
    searchCity: (city) => {
      const modalCity = document.getElementById('pvz-city-input');
      if (modalCity) modalCity.value = city;
    }
  };
})();
