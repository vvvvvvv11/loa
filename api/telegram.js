// api/telegram.js
// Работает без firebase-admin — использует Firebase REST API напрямую

const TG_TOKEN = '8702046980:AAGhDyL4ArgIZckT3PxusNVDHpX6E_cVjOA';
const ALLOWED_CHAT_IDS = ['530361815', '7984183942'];
const FIREBASE_PROJECT_ID = 'loashop-32ffd';
const FIREBASE_API_KEY = 'AIzaSyBOgb-nMQ3_QhShDOEjDxhmXRv-LSoL9OY';

const VALID_STATUSES = {
  bought:    '✅ Выкуплено',
  china:     '📦 На складе в Китае',
  shipped:   '🚚 Отправлено',
  delivered: '🎉 Доставлено',
  cancelled: '❌ Отменён',
  refund:    '↩️ Возврат',
};

async function sendTG(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function getFirestoreDoc(docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/orders/${docId}?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function updateOrderStatus(docId, statusKey) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/orders/${docId}?updateMask.fieldPaths=status&updateMask.fieldPaths=statusUpdatedAt&key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        status: { stringValue: statusKey },
        statusUpdatedAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const message = req.body?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = String(message.chat?.id);
    const text = message.text?.trim() || '';

    if (!ALLOWED_CHAT_IDS.includes(chatId)) {
      await sendTG(chatId, '⛔ У вас нет доступа.');
      return res.status(200).json({ ok: true });
    }

    // /start или /help
    if (text === '/start' || text === '/help') {
      await sendTG(chatId,
        '👋 <b>LOA Admin Bot</b>\n\n' +
        'Используй команды из уведомлений о заказе:\n' +
        '<code>/status_DOCID_bought</code> — Выкуплено\n' +
        '<code>/status_DOCID_china</code> — Склад в Китае\n' +
        '<code>/status_DOCID_shipped</code> — Отправлено\n' +
        '<code>/status_DOCID_delivered</code> — Доставлено\n' +
        '<code>/status_DOCID_cancelled</code> — Отменён\n' +
        '<code>/status_DOCID_refund</code> — Возврат'
      );
      return res.status(200).json({ ok: true });
    }

    // Парсим /status_DOCID_statuskey
    const match = text.replace(/@\w+/, '').trim().match(/^\/status_([a-zA-Z0-9]+)_([a-z]+)$/);
    if (!match) return res.status(200).json({ ok: true });

    const docId = match[1];
    const statusKey = match[2];

    if (!VALID_STATUSES[statusKey]) {
      await sendTG(chatId, `❓ Неизвестный статус: <code>${statusKey}</code>`);
      return res.status(200).json({ ok: true });
    }

    // Получаем заказ
    const doc = await getFirestoreDoc(docId);
    if (!doc || doc.error) {
      await sendTG(chatId, `⚠️ Заказ <code>${docId}</code> не найден.`);
      return res.status(200).json({ ok: true });
    }

    // Обновляем статус
    const ok = await updateOrderStatus(docId, statusKey);
    if (!ok) {
      await sendTG(chatId, '❌ Ошибка обновления. Проверь права Firestore.');
      return res.status(200).json({ ok: true });
    }

    const fields = doc.fields || {};
    const name = fields.name?.stringValue || '—';
    const items = fields.items?.stringValue || '—';
    const total = fields.total?.stringValue || '—';
    const shortId = docId.slice(-6).toUpperCase();
    const statusLabel = VALID_STATUSES[statusKey];

    await sendTG(chatId,
      `${statusLabel}\n\n` +
      `Заказ <b>#${shortId}</b> обновлён!\n` +
      `👤 Клиент: ${name}\n` +
      `📦 Товары: ${items}\n` +
      `💰 Сумма: ${total}\n\n` +
      `Статус изменён на: <b>${statusLabel}</b>`
    );

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
