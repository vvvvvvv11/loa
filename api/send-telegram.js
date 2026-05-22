// ✅ ТОКЕН ТОЛЬКО ЗДЕСЬ (на сервере, пользователи не увидят)
const TG_TOKEN = '8702046980:AAHAEFQ-eONzcb1MF2tRu9zu3H95vPNPxV8';
const TG_CHAT_ID = '7984183942';
const TG_ADMIN_2 = '530361815';

export default async function handler(req, res) {
  const { message } = req.body;
  
  const sendToTelegram = async (chatId) => {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  };
  
  await sendToTelegram(TG_CHAT_ID);
  await sendToTelegram(TG_ADMIN_2);
  
  res.json({ ok: true });
}