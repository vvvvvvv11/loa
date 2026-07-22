// Принимает уведомления ЮKassa о смене статуса платежа. В отличие от ЮMoney, у ЮKassa нет
// подписи в теле запроса — подлинность проверяется двумя способами (оба входят в
// официальную рекомендацию ЮKassa):
//   1. IP-адрес отправителя должен входить в опубликованный список ЮKassa.
//   2. Главное: НЕ доверяем статусу из тела уведомления — сразу перезапрашиваем платёж
//      по его id через GET с собственным секретным ключом и верим только этому ответу.
//      Так подделать уведомление нельзя, даже подобрав IP.
//
// URL этой функции нужно один раз вручную указать в личном кабинете ЮKassa:
// Интеграция → HTTP-уведомления → включить событие payment.succeeded.
//
// Деплой (из папки Сайты/loashop):
//   supabase functions deploy yookassa-webhook --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SHOP_ID = Deno.env.get('YOOKASSA_SHOP_ID');
const SECRET_KEY = Deno.env.get('YOOKASSA_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// https://yookassa.ru/developers/using-api/webhooks#ip
const YOOKASSA_IPV4_RANGES = ['185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25', '77.75.154.128/25'];
const YOOKASSA_IPV4_SINGLE = ['77.75.156.11', '77.75.156.35'];

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const toInt = (addr: string) => addr.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}

function isYooKassaIp(ip: string): boolean {
  if (ip.includes(':')) return ip.startsWith('2a02:5180:'); // единственный IPv6-диапазон из списка
  return YOOKASSA_IPV4_SINGLE.includes(ip) || YOOKASSA_IPV4_RANGES.some((cidr) => ipInCidr(ip, cidr));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (!SHOP_ID || !SECRET_KEY) {
    console.error('YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не настроены');
    return new Response('Server misconfigured', { status: 500 });
  }

  const forwardedFor = req.headers.get('x-forwarded-for') || '';
  const clientIp = forwardedFor.split(',')[0].trim();
  if (clientIp && !isYooKassaIp(clientIp)) {
    console.error('Уведомление с неожиданного IP', { clientIp });
    return new Response('Forbidden', { status: 403 });
  }

  let notification: any;
  try {
    notification = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (notification.event !== 'payment.succeeded') {
    // Другие события (canceled, waiting_for_capture и т.д.) сейчас не обрабатываем
    return new Response('OK', { status: 200 });
  }

  const paymentId = notification.object?.id;
  if (!paymentId) {
    return new Response('Missing payment id', { status: 400 });
  }

  // Не верим статусу из тела уведомления — перезапрашиваем сами через API
  const auth = btoa(`${SHOP_ID}:${SECRET_KEY}`);
  const ykResponse = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!ykResponse.ok) {
    console.error('Не удалось перепроверить платёж', { paymentId, status: ykResponse.status });
    return new Response('Verification failed', { status: 502 });
  }
  const verified = await ykResponse.json();

  if (verified.status !== 'succeeded') {
    // Реальный статус на сервере ЮKassa не совпадает с тем, что заявлено в уведомлении — игнорируем
    return new Response('OK', { status: 200 });
  }

  const orderId = verified.metadata?.order_id;
  if (!orderId) {
    console.error('В платеже нет metadata.order_id', { paymentId });
    return new Response('OK', { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('total, payment_status')
    .eq('id', orderId)
    .maybeSingle();

  if (fetchErr || !order) {
    console.error('Заказ не найден для metadata.order_id', { orderId });
    return new Response('Order not found', { status: 404 });
  }

  const paidAmount = parseFloat(verified.amount?.value);
  const orderTotal = parseFloat(String(order.total).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - orderTotal) > 0.01) {
    console.error('Сумма платежа не совпадает с заказом', { orderId, paidAmount, orderTotal });
    return new Response('Amount mismatch', { status: 400 });
  }

  if (order.payment_status === 'paid') {
    // Уведомление могло прийти повторно — не обрабатываем дважды
    return new Response('OK', { status: 200 });
  }

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', payment_operation_id: paymentId })
    .eq('id', orderId);

  if (updateErr) {
    console.error('Не удалось обновить заказ', updateErr);
    return new Response('Update failed', { status: 500 });
  }

  console.log('Оплата подтверждена', { orderId, paidAmount });
  return new Response('OK', { status: 200 });
});
