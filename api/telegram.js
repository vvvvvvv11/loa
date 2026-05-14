/**
 * telegram.js — интеграция с Telegram Bot API и Firestore
 * 
 * Обработка команд от Telegram бота для управления статусами заказов
 * Использует Firebase Firestore для хранения и обновления заказов
 */

// ===== КОНФИГУРАЦИЯ =====
const TELEGRAM_CONFIG = {
  // Токен бота (получить от @BotFather)
  TOKEN: '8702046980:AAGhDyL4ArgIZckT3PxusNVDHpX6E_cVjOA',
  
  // Допустимые ID чатов (администраторы)
  ALLOWED_CHAT_IDS: ['530361815', '7984183942'],
  
  // Firebase конфигурация
  FIREBASE_PROJECT_ID: 'loashop-32ffd',
  FIREBASE_API_KEY: 'AIzaSyBOgb-nMQ3_QhShDOEjDxhmXRv-LSoL9OY',
};

// ===== СТАТУСЫ ЗАКАЗОВ =====
const VALID_STATUSES = {
  bought: '✅ Выкуплено',
  shipped: '🚚 Отправлено',
  delivered: '🎉 Доставлено',
  cancelled: '❌ Отменён',
  refund: '↩️ Возврат',
};

// ===== ОТПРАВКА СООБЩЕНИЯ В TELEGRAM =====
async function sendTG(chatId, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_CONFIG.TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram error:', data);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

// ===== ПОЛУЧЕНИЕ ДОКУМЕНТА ИЗ FIRESTORE =====
async function getFirestoreDoc(collectionName, docId) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${TELEGRAM_CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}?key=${TELEGRAM_CONFIG.FIREBASE_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('Firestore error:', data);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to get Firestore doc:', error);
    return null;
  }
}

// ===== ОБНОВЛЕНИЕ СТАТУСА В FIRESTORE =====
async function updateOrderStatus(docId, newStatus) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${TELEGRAM_CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents/orders/${docId}?updateMask.fieldPaths=status&updateMask.fieldPaths=status_updated_at&key=${TELEGRAM_CONFIG.FIREBASE_API_KEY}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          status: { stringValue: newStatus },
          status_updated_at: { timestampValue: new Date().toISOString() }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firestore update error:', data);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to update Firestore doc:', error);
    return false;
  }
}

// ===== ПОЛУЧЕНИЕ ПОЛЕЙ ИЗ ДОКУМЕНТА =====
function getFieldValue(doc, fieldName, defaultValue = '—') {
  if (!doc || !doc.fields) return defaultValue;
  
  const field = doc.fields[fieldName];
  if (!field) return defaultValue;
  
  // Поддержка разных типов данных Firestore
  if (field.stringValue) return field.stringValue;
  if (field.integerValue) return field.integerValue;
  if (field.doubleValue) return field.doubleValue;
  if (field.booleanValue) return field.booleanValue;
  if (field.arrayValue) return field.arrayValue.values || [];
  
  return defaultValue;
}

// ===== WEBHOOK HANDLER (для Node.js/Express) =====
async function handleTelegramWebhook(req) {
  if (req.method !== 'POST') {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  try {
    const message = req.body && req.body.message;
    if (!message) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const chatId = String(message.chat && message.chat.id);
    const text = (message.text || '').trim().replace(/@\w+/, '').trim();
    const userName = message.from ? (message.from.first_name || 'User') : 'Unknown';

    console.log(`[Telegram] ${userName} (${chatId}): ${text}`);

    // Проверка доступа
    if (!TELEGRAM_CONFIG.ALLOWED_CHAT_IDS.includes(chatId)) {
      await sendTG(chatId, '⛔ <b>У вас нет доступа.</b>\n\nЭта команда доступна только администраторам.');
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Команда /start или /help
    if (text === '/start' || text === '/help') {
      const helpText = `👋 <b>LOA Admin Bot</b>

Используйте команды для управления статусом заказов:

<code>/status_DOCID_bought</code> — ✅ Выкуплено
<code>/status_DOCID_shipped</code> — 🚚 Отправлено
<code>/status_DOCID_delivered</code> — 🎉 Доставлено
<code>/status_DOCID_cancelled</code> — ❌ Отменён
<code>/status_DOCID_refund</code> — ↩️ Возврат

Пример:
<code>/status_abc12345_shipped</code>

Команды отправляются автоматически при создании заказа.`;

      await sendTG(chatId, helpText);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Парсинг команды изменения статуса: /status_DOCID_STATUS
    const match = text.match(/^\/status_([a-zA-Z0-9_-]+)_([a-z]+)$/);
    if (!match) {
      await sendTG(chatId, '❓ <b>Команда не распознана</b>\n\nИспользуйте <code>/help</code> для списка команд.');
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const docId = match[1];
    const newStatus = match[2];

    // Проверка корректности статуса
    if (!VALID_STATUSES[newStatus]) {
      await sendTG(chatId, `❌ <b>Неизвестный статус:</b> <code>${newStatus}</code>\n\nДоступные статусы: ${Object.keys(VALID_STATUSES).join(', ')}`);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Получение заказа из Firestore
    const doc = await getFirestoreDoc('orders', docId);
    if (!doc || doc.error) {
      await sendTG(chatId, `⚠️ <b>Заказ не найден</b>\n\nДокумент: <code>${docId}</code>\n\nПроверьте ID и попробуйте снова.`);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Обновление статуса в Firestore
    const updateSuccess = await updateOrderStatus(docId, newStatus);
    if (!updateSuccess) {
      await sendTG(chatId, '❌ <b>Ошибка обновления</b>\n\nПроверьте права доступа Firestore и попробуйте снова.');
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Формирование ответного сообщения
    const shortId = docId.slice(-6).toUpperCase();
    const customerName = getFieldValue(doc, 'name', 'Unknown Customer');
    const items = getFieldValue(doc, 'items', '—');
    const total = getFieldValue(doc, 'total', '—');
    const statusLabel = VALID_STATUSES[newStatus];

    const confirmMessage = `${statusLabel}

<b>Заказ #${shortId} обновлён!</b>

👤 <b>Клиент:</b> ${customerName}
📦 <b>Товары:</b> ${items}
💰 <b>Сумма:</b> ${total}

<b>Новый статус:</b> ${statusLabel}
⏰ <b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;

    await sendTG(chatId, confirmMessage);

    console.log(`[Telegram] Order ${docId} status updated to ${newStatus}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}

// ===== ОТПРАВКА УВЕДОМЛЕНИЯ О НОВОМ ЗАКАЗЕ =====
async function notifyNewOrder(orderId, orderData) {
  if (!TELEGRAM_CONFIG.TOKEN) {
    console.warn('⚠️ Telegram TOKEN не установлен');
    return false;
  }

  try {
    const chatId = TELEGRAM_CONFIG.ALLOWED_CHAT_IDS[0]; // Отправляем первому админу
    const shortId = (orderId || '').slice(-6).toUpperCase();
    
    const message = `🎉 <b>НОВЫЙ ЗАКАЗ!</b>

<b>ID:</b> <code>#${shortId}</code>

👤 <b>Клиент:</b> ${orderData.name || '—'}
📱 <b>Телефон:</b> <code>${orderData.phone || '—'}</code>
📧 <b>Email:</b> <code>${orderData.email || '—'}</code>

📦 <b>Товары:</b> ${orderData.items || '—'}
💰 <b>Сумма:</b> <b>${orderData.total || '—'}</b>

🚚 <b>Способ доставки:</b> ${orderData.deliveryMethod === 'pickup' ? `🏪 ПВЗ: ${orderData.pvz}` : `🏠 Адрес: ${orderData.address}`}

📝 <b>Примечание:</b> ${orderData.note || 'Отсутствует'}

<b>Быстрые команды:</b>
/status_${orderId}_bought — Выкуплено
/status_${orderId}_shipped — Отправлено
/status_${orderId}_delivered — Доставлено
/status_${orderId}_cancelled — Отменён
/status_${orderId}_refund — Возврат`;

    await sendTG(chatId, message);
    return true;
  } catch (error) {
    console.error('Failed to notify new order:', error);
    return false;
  }
}

// ===== ОТПРАВКА УВЕДОМЛЕНИЯ ОБ ИЗМЕНЕНИИ СТАТУСА =====
async function notifyStatusChange(orderId, oldStatus, newStatus, customerData) {
  if (!TELEGRAM_CONFIG.TOKEN) return false;

  try {
    const chatId = TELEGRAM_CONFIG.ALLOWED_CHAT_IDS[0];
    const shortId = (orderId || '').slice(-6).toUpperCase();
    const oldStatusLabel = VALID_STATUSES[oldStatus] || oldStatus;
    const newStatusLabel = VALID_STATUSES[newStatus] || newStatus;

    const message = `📊 <b>ИЗМЕНЕНИЕ СТАТУСА ЗАКАЗА</b>

🆔 <b>Заказ:</b> <code>#${shortId}</code>
👤 <b>Клиент:</b> ${customerData?.name || '—'}

<b>Статус изменился:</b>
${oldStatusLabel} → ${newStatusLabel}

⏰ <b>Время обновления:</b> ${new Date().toLocaleString('ru-RU')}`;

    await sendTG(chatId, message);
    return true;
  } catch (error) {
    console.error('Failed to notify status change:', error);
    return false;
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ TELEGRAM БОТА =====
function initTelegramBot(token, allowedChatIds) {
  TELEGRAM_CONFIG.TOKEN = token;
  if (allowedChatIds && Array.isArray(allowedChatIds)) {
    TELEGRAM_CONFIG.ALLOWED_CHAT_IDS = allowedChatIds;
  }
  console.log('✅ Telegram bot initialized');
}

// ===== ЭКСПОРТИРОВАНИЕ ДЛЯ РАЗНЫХ ОКРУЖЕНИЙ =====

// Для Node.js/Express
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TELEGRAM_CONFIG,
    VALID_STATUSES,
    sendTG,
    getFirestoreDoc,
    updateOrderStatus,
    getFieldValue,
    handleTelegramWebhook,
    notifyNewOrder,
    notifyStatusChange,
    initTelegramBot
  };
}

// Для браузера
if (typeof window !== 'undefined') {
  window.TelegramBot = {
    TELEGRAM_CONFIG,
    VALID_STATUSES,
    sendTG,
    notifyNewOrder,
    notifyStatusChange,
    initTelegramBot
  };
}
