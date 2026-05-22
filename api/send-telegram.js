// api/send-telegram.js
const TG_TOKEN = '8702046980:AAHAEFQ-eONzcb1MF2tRu9zu3H95vPNPxV8';
const TG_CHAT_ID = '7984183942';
const TG_ADMIN_2 = '530361815';

export default async function handler(req, res) {
  // Разрешаем CORS для вашего сайта
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Обрабатываем preflight запрос
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    console.log('Sending message:', message);

    const sendToTelegram = async (chatId) => {
      const response = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text: message, 
          parse_mode: 'HTML' 
        })
      });
      
      const result = await response.json();
      console.log(`Response from ${chatId}:`, result);
      return result.ok;
    };
    
    // Отправляем обоим админам
    const result1 = await sendToTelegram(TG_CHAT_ID);
    const result2 = await sendToTelegram(TG_ADMIN_2);
    
    if (!result1 && !result2) {
      throw new Error('Failed to send to both recipients');
    }
    
    res.status(200).json({ ok: true, results: { TG_CHAT_ID: result1, TG_ADMIN_2: result2 } });
    
  } catch (error) {
    console.error('Telegram API error:', error);
    res.status(500).json({ error: error.message });
  }
}
