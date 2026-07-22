// Создаёт платёж в ЮKassa для уже существующего заказа и возвращает ссылку на оплату
// (confirmation_url), куда браузер перенаправляет покупателя.
//
// ВАЖНО: сумма берётся из БАЗЫ (по order_id), а не от клиента — иначе кто угодно мог бы
// прислать любую сумму. Секретный ключ ЮKassa здесь виден только серверу (эта функция),
// в браузер он никогда не попадает.
//
// Деплой (из папки Сайты/loashop):
//   supabase functions deploy create-payment --no-verify-jwt
//
// Секреты (Shop ID не секретный, но проще хранить вместе с ключом):
//   supabase secrets set YOOKASSA_SHOP_ID=твой_shop_id
//   supabase secrets set YOOKASSA_SECRET_KEY=твой_секретный_ключ

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SHOP_ID = Deno.env.get('YOOKASSA_SHOP_ID');
const SECRET_KEY = Deno.env.get('YOOKASSA_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') || 'https://loashop.ru';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }
  if (!SHOP_ID || !SECRET_KEY) {
    console.error('YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не настроены (supabase secrets set ...)');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: corsHeaders });
  }

  let orderId: string | undefined;
  try {
    const body = await req.json();
    orderId = body.order_id;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }
  if (!orderId) {
    return new Response(JSON.stringify({ error: 'Missing order_id' }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (fetchErr || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
  }
  if (order.status !== 'new' || order.payment_status !== 'awaiting') {
    return new Response(JSON.stringify({ error: 'Order is not payable' }), { status: 400, headers: corsHeaders });
  }

  const amountValue = parseFloat(String(order.total).replace(/[^\d.]/g, '')).toFixed(2);
  const shortId = orderId.slice(-6).toUpperCase();

  const auth = btoa(`${SHOP_ID}:${SECRET_KEY}`);

  const ykResponse = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Idempotence-Key': orderId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: { value: amountValue, currency: 'RUB' },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: `${SITE_URL}/index.html?paid=true&order=${orderId}`,
      },
      description: `Заказ LOA №${shortId}`,
      metadata: { order_id: orderId },
    }),
  });

  if (!ykResponse.ok) {
    const errText = await ykResponse.text();
    console.error('Ошибка создания платежа ЮKassa', { status: ykResponse.status, errText });
    return new Response(JSON.stringify({ error: 'Payment creation failed' }), { status: 502, headers: corsHeaders });
  }

  const payment = await ykResponse.json();

  await supabase.from('orders').update({ payment_operation_id: payment.id }).eq('id', orderId);

  return new Response(
    JSON.stringify({ confirmation_url: payment.confirmation?.confirmation_url }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
