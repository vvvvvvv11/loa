<?php
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 1);

// 🔴 ВАЖНО: Ваши ключи Supabase
$supabaseUrl = 'https://fbwbwrqepdjiliiabedh.supabase.co'; 
$supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZid2J3cnFlcGRqaWxpaWFiZWRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTA1NjMsImV4cCI6MjA5NDMyNjU2M30.a4RaEbcicNA0moct5bSjEeLNbsumbp8jDno4bkuWlJA'; 

$adminPassword = 'admin123';

// ========== АВТОРИЗАЦИЯ ==========
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login'])) {
    if ($_POST['password'] === $adminPassword) {
        $_SESSION['admin_logged_in'] = true;
    } else {
        $loginError = "Неверный пароль";
    }
}

if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
<title>LOA Shop Admin — Вход</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
.login-card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border-radius: 24px; padding: 32px 24px; width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,0.1); }
h1 { color: #fff; font-size: 28px; margin-bottom: 8px; text-align: center; }
.sub { color: #888; text-align: center; margin-bottom: 32px; font-size: 14px; }
input { width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: #fff; font-size: 16px; margin-bottom: 20px; }
button { width: 100%; padding: 14px; background: #ffd700; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; color: #000; cursor: pointer; }
button:hover { background: #ffed4a; }
.error { color: #ff4444; text-align: center; margin-bottom: 15px; font-size: 14px; }
</style>
</head>
<body>
<div class="login-card">
    <h1>LOA Shop Admin</h1>
    <div class="sub">Вход в панель управления</div>
    <?php if (isset($loginError)) echo "<div class='error'>$loginError</div>"; ?>
    <form method="POST">
        <input type="password" name="password" placeholder="Пароль" autofocus required>
        <button type="submit" name="login">Войти</button>
    </form>
</div>
</body>
</html>
<?php
exit;
}

// ========== ПРОВЕРКА КЛЮЧЕЙ ==========
if (!$supabaseUrl || !$supabaseKey) {
    die('<h1 style="color:red;text-align:center;margin-top:50px;">⚠️ ОШИБКА: Не указаны ключи Supabase</h1>');
}

// ========== ФУНКЦИЯ ЗАПРОСА К SUPABASE ==========
function supabaseRequest($method, $path, $data = null) {
    global $supabaseUrl, $supabaseKey;
    
    $baseUrl = rtrim($supabaseUrl, '/');
    $fullUrl = "$baseUrl/rest/v1/$path";

    $ch = curl_init($fullUrl);
    $headers = [
        'apikey: ' . $supabaseKey,
        'Authorization: Bearer ' . $supabaseKey,
        'Content-Type: application/json',
        'Prefer: return=representation'
    ];

    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    if ($data) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        return ['error' => $curlError];
    }

    if ($httpCode >= 400) {
        return ['error' => "HTTP $httpCode", 'details' => $response];
    }

    return json_decode($response, true);
}

// ========== ОБРАБОТКА ДЕЙСТВИЙ (POST) ==========
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    
    // 1. Обновление товара
    if (isset($_POST['update_product'])) {
        $id = $_POST['product_id'];
        $updateData = [
            'price_rub' => (int)$_POST['price_rub'],
            'sold_out' => isset($_POST['sold_out'])
        ];
        if (isset($_POST['price_byn']) && $_POST['price_byn'] !== '') $updateData['price_byn'] = (int)$_POST['price_byn'];
        if (isset($_POST['price_usd']) && $_POST['price_usd'] !== '') $updateData['price_usd'] = (int)$_POST['price_usd'];
        
        // Добавляем бейдж
        if (isset($_POST['badge'])) {
            $updateData['badge'] = $_POST['badge'] === '' ? null : $_POST['badge'];
        }
        
        $result = supabaseRequest('PATCH', "products?id=eq.$id", $updateData);
        if (isset($result['error'])) die("Ошибка обновления товара: " . $result['error']);
        
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 2. Скрытие/Показ размера
    if (isset($_POST['toggle_size_hidden'])) {
        $productId = $_POST['size_product_id'];
        $sizeName = $_POST['size_name'];
        $currentHidden = ($_POST['current_hidden'] === '1');
        $newHidden = !$currentHidden;

        $queryParams = http_build_query([
            'product_id' => "eq.$productId",
            'size'       => "eq.$sizeName"
        ]);

        $result = supabaseRequest('PATCH', "sizes?$queryParams", ['hidden' => $newHidden]);
        
        if (isset($result['error'])) {
            die("Ошибка скрытия размера: " . $result['error']);
        }
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 3. Удаление размера
    if (isset($_POST['delete_size'])) {
        $productId = $_POST['delete_size_product'];
        $sizeName = $_POST['delete_size_name'];

        $queryParams = http_build_query([
            'product_id' => "eq.$productId",
            'size'       => "eq.$sizeName"
        ]);

        $result = supabaseRequest('DELETE', "sizes?$queryParams", null);
        
        if (isset($result['error'])) {
            die("Ошибка удаления размера: " . $result['error']);
        }
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 4. Добавление нового размера
    if (isset($_POST['add_new_size'])) {
        $productId = $_POST['new_size_product_id'];
        $newSize = trim($_POST['new_size_name']);
        
        if (!empty($newSize)) {
            $result = supabaseRequest('POST', 'sizes', [
                'product_id' => $productId,
                'size' => $newSize,
                'hidden' => false
            ]);
            if (isset($result['error'])) {
                die("Ошибка добавления размера: " . $result['error']);
            }
        }
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 5. Глобальная скидка
    if (isset($_POST['update_global_discount'])) {
        $discount = (int)$_POST['global_discount'];
        $result = supabaseRequest('PATCH', "settings?id=eq.1", ['global_discount' => $discount]);
        if (isset($result['error'])) die("Ошибка скидки: " . $result['error']);
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 6. Плашка с таймером
    if (isset($_POST['update_timer'])) {
        $enabled = isset($_POST['promo_timer_enabled']) ? true : false;
        $result = supabaseRequest('PATCH', "settings?id=eq.1", ['promo_timer_enabled' => $enabled]);
        if (isset($result['error'])) die("Ошибка таймера: " . $result['error']);
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 7. Добавление промокода
    if (isset($_POST['add_promo'])) {
        $code = trim($_POST['code']);
        $discount = (int)$_POST['discount'];
        
        if (!empty($code) && $discount > 0) {
            $result = supabaseRequest('POST', 'promo_codes', [
                'code' => strtoupper($code),
                'discount' => $discount,
                'active' => true,
                'created_at' => date('Y-m-d H:i:s')
            ]);
            if (isset($result['error'])) {
                die("Ошибка добавления промокода: " . $result['error']);
            }
        }
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 8. Удаление промокода
    if (isset($_POST['delete_promo'])) {
        $code = $_POST['delete_promo'];
        $result = supabaseRequest('DELETE', "promo_codes?code=eq.$code", null);
        if (isset($result['error'])) {
            die("Ошибка удаления промокода: " . $result['error']);
        }
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }

    // 9. Выход
    if (isset($_POST['logout'])) {
        session_destroy();
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
$products = supabaseRequest('GET', 'products?order=id.asc', null);
$sizes = supabaseRequest('GET', 'sizes?order=id.asc', null);
$settings = supabaseRequest('GET', 'settings?id=eq.1', null);
$promoCodes = supabaseRequest('GET', 'promo_codes?order=code.asc', null);

$globalDiscount = 0;
$promoTimerEnabled = false;

if (is_array($settings) && !empty($settings)) {
    $globalDiscount = $settings[0]['global_discount'] ?? 0;
    $promoTimerEnabled = $settings[0]['promo_timer_enabled'] ?? false;
}

if (!is_array($products)) $products = [];
if (!is_array($sizes)) $sizes = [];
if (!is_array($promoCodes)) $promoCodes = [];

// Группировка размеров по товарам
$sizesByProduct = [];
foreach ($sizes as $size) {
    $pid = $size['product_id'];
    if (!isset($sizesByProduct[$pid])) {
        $sizesByProduct[$pid] = [];
    }
    $sizesByProduct[$pid][] = $size;
}

// ========== СТАТИСТИКА МАГАЗИНА ==========
// Общее количество товаров
$totalProducts = count($products);

// Количество товаров с sold_out = true
$soldOutCount = 0;
foreach ($products as $product) {
    if ($product['sold_out'] ?? false) {
        $soldOutCount++;
    }
}

// Количество активных промокодов
$activePromoCount = 0;
foreach ($promoCodes as $promo) {
    if ($promo['active'] ?? false) {
        $activePromoCount++;
    }
}

// Общее количество размеров
$totalSizes = count($sizes);

// Самый дорогой товар
$mostExpensiveProduct = null;
$maxPrice = -1;
foreach ($products as $product) {
    $price = $product['price_rub'] ?? 0;
    if ($price > $maxPrice) {
        $maxPrice = $price;
        $mostExpensiveProduct = $product;
    }
}

// Самый дешёвый товар
$cheapestProduct = null;
$minPrice = PHP_INT_MAX;
foreach ($products as $product) {
    $price = $product['price_rub'] ?? 0;
    if ($price > 0 && $price < $minPrice) {
        $minPrice = $price;
        $cheapestProduct = $product;
    }
}
if ($minPrice === PHP_INT_MAX) {
    $minPrice = -1;
}

?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LOA Shop Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Inter', sans-serif;
    background: #0a0a0a;
    color: #fff;
    padding: 20px;
    min-height: 100vh;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    border-bottom: 2px solid #ffd700;
    padding-bottom: 15px;
}

.header h1 {
    font-size: 28px;
    color: #ffd700;
}

.logout-btn {
    background: #ff4444;
    color: #fff;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
}

.logout-btn:hover {
    background: #ff6666;
}

.container {
    max-width: 1400px;
    margin: 0 auto;
}

.card {
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
    border: 1px solid rgba(255,255,255,0.1);
}

.card h2 {
    margin-bottom: 20px;
    font-size: 20px;
    color: #ffd700;
}

/* Сетка статистики 2-3 колонки на десктопе, 1 на мобильных */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-top: 16px;
}

@media (max-width: 768px) {
    .stats-grid {
        grid-template-columns: 1fr;
    }
}

.stat-item {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
}

.stat-value {
    font-size: 32px;
    font-weight: 600;
    color: #ffd700;
    margin-bottom: 8px;
}

.stat-label {
    font-size: 13px;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.stat-item.product-info {
    text-align: left;
    grid-column: span 1;
}

.stat-item.product-info .stat-label {
    text-transform: capitalize;
    letter-spacing: normal;
    margin-top: 8px;
}

.stat-item.product-info .product-name {
    color: #fff;
    font-size: 14px;
    margin-top: 4px;
    word-break: break-word;
}

.stat-item.product-info .product-price {
    color: #ffd700;
    font-size: 16px;
    font-weight: 600;
    margin-top: 6px;
}

.product-row {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-end;
}

@media (max-width: 768px) {
    .product-row {
        flex-direction: column;
        align-items: stretch;
    }
}

.product-field {
    flex: 1;
    min-width: 100px;
}

.product-field label {
    display: block;
    font-size: 13px;
    color: #aaa;
    margin-bottom: 6px;
    font-weight: 500;
}

.product-field input,
.product-field select {
    width: 100%;
    padding: 10px 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
}

.product-field input:focus,
.product-field select:focus {
    outline: none;
    border-color: #ffd700;
}

.btn-save {
    background: #ffd700;
    color: #000;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    font-size: 14px;
}

.btn-save:hover {
    background: #ffed4a;
}

.btn-delete {
    background: #ff4444;
    color: #fff;
    border: none;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
}

.btn-delete:hover {
    background: #ff6666;
}

.btn-add {
    background: #00c853;
    color: #fff;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
}

.btn-add:hover {
    background: #00dd77;
}

.product-block {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
}

.product-title {
    font-weight: 600;
    margin-bottom: 15px;
    color: #ffd700;
}

.sizes-section {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid rgba(255,255,255,0.1);
}

.sizes-title {
    font-size: 13px;
    font-weight: 600;
    color: #aaa;
    margin-bottom: 10px;
}

.sizes-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.size-item {
    background: rgba(255,255,255,0.1);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    display: flex;
    gap: 8px;
    align-items: center;
}

.hidden-badge {
    color: #ff9800;
    font-size: 12px;
}

.size-toggle-btn,
.delete-size-btn {
    background: none;
    border: none;
    color: #ffd700;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
}

.size-toggle-btn:hover,
.delete-size-btn:hover {
    color: #ffed4a;
}

.add-size-form {
    display: flex;
    gap: 8px;
}

.add-size-form input {
    flex: 1;
    padding: 8px 12px;
}

.btn-add-size {
    background: #4a90e2;
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
}

.btn-add-size:hover {
    background: #6ba3ff;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
}

.checkbox-label input {
    width: auto;
    margin: 0;
}

.promo-form {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.promo-form input {
    flex: 1;
    padding: 10px 12px;
}

.promo-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 16px;
}

.promo-table thead {
    border-bottom: 2px solid rgba(255,255,255,0.2);
}

.promo-table th {
    text-align: left;
    padding: 12px;
    color: #ffd700;
    font-weight: 600;
    font-size: 13px;
}

.promo-table td {
    padding: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.status-active {
    color: #00c853;
    font-weight: 600;
}

.status-inactive {
    color: #ff4444;
    font-weight: 600;
}

.links-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
}

.checkout-link {
    display: block;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    color: #ffd700;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s;
}

.checkout-link:hover {
    background: rgba(255,255,255,0.15);
    border-color: #ffd700;
}

@media (max-width: 768px) {
    body {
        padding: 12px;
    }
    
    .header {
        flex-direction: column;
        gap: 15px;
        text-align: center;
    }
    
    .header h1 {
        font-size: 24px;
    }
    
    .card {
        padding: 16px;
    }
    
    .promo-form {
        flex-direction: column;
    }
}
</style>
</head>
<body>
<div class="header">
    <h1>🏪 LOA Shop Admin</h1>
    <form method="POST" style="margin:0">
        <button type="submit" name="logout" class="logout-btn">🚪 Выход</button>
    </form>
</div>

<div class="container">

    <!-- Блок статистики магазина -->
    <div class="card">
        <h2>📊 Статистика магазина</h2>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-value"><?= $totalProducts ?></div>
                <div class="stat-label">📦 Всего товаров</div>
            </div>

            <div class="stat-item">
                <div class="stat-value"><?= $soldOutCount ?></div>
                <div class="stat-label">🔴 Товаров распродано</div>
            </div>

            <div class="stat-item">
                <div class="stat-value"><?= $activePromoCount ?></div>
                <div class="stat-label">🎫 Активных промокодов</div>
            </div>

            <div class="stat-item">
                <div class="stat-value"><?= $totalSizes ?></div>
                <div class="stat-label">📏 Всего размеров</div>
            </div>

            <?php if ($mostExpensiveProduct): ?>
            <div class="stat-item product-info">
                <div class="stat-label">💎 Самый дорогой товар</div>
                <div class="product-name"><?= htmlspecialchars($mostExpensiveProduct['name'] ?? 'Без названия') ?></div>
                <div class="product-price"><?= number_format($mostExpensiveProduct['price_rub'] ?? 0, 0, ',', ' ') ?> ₽</div>
            </div>
            <?php else: ?>
            <div class="stat-item product-info">
                <div class="stat-label">💎 Самый дорогой товар</div>
                <div class="product-name">Нет данных</div>
            </div>
            <?php endif; ?>

            <?php if ($cheapestProduct && $minPrice > 0): ?>
            <div class="stat-item product-info">
                <div class="stat-label">💰 Самый дешёвый товар</div>
                <div class="product-name"><?= htmlspecialchars($cheapestProduct['name'] ?? 'Без названия') ?></div>
                <div class="product-price"><?= number_format($cheapestProduct['price_rub'] ?? 0, 0, ',', ' ') ?> ₽</div>
            </div>
            <?php else: ?>
            <div class="stat-item product-info">
                <div class="stat-label">💰 Самый дешёвый товар</div>
                <div class="product-name">Нет данных</div>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- Глобальная скидка -->
    <div class="card">
        <h2>💸 Глобальная скидка на все товары</h2>
        <form method="POST">
            <div class="product-row">
                <div class="product-field">
                    <label>Скидка в процентах:</label>
                    <input type="number" name="global_discount" value="<?= $globalDiscount ?>" min="0" max="100" placeholder="0">
                </div>
                <div class="product-field">
                    <button type="submit" name="update_global_discount" class="btn-save">💾 Сохранить</button>
                </div>
            </div>
        </form>
        <?php if ($globalDiscount > 0): ?>
        <div style="margin-top: 15px; padding: 10px; background: #00c853; border-radius: 8px; color: #fff; text-align: center;">
            ✅ Скидка <?= $globalDiscount ?>% активна на все товары
        </div>
        <?php else: ?>
        <div style="margin-top: 15px; padding: 10px; background: #ff4444; border-radius: 8px; color: #fff; text-align: center;">
            ❌ Глобальная скидка отключена
        </div>
        <?php endif; ?>
    </div>

    <!-- Блок управления плашкой с таймером -->
    <div class="card">
        <h2>📢 Верхняя плашка с таймером</h2>
        <form method="POST">
            <div class="product-row">
                <div class="product-field">
                    <label class="checkbox-label">
                        <input type="checkbox" name="promo_timer_enabled" value="1" <?= $promoTimerEnabled ? 'checked' : '' ?>>
                        <span>🕐 Показывать плашку с таймером на сайте</span>
                    </label>
                </div>
                <div class="product-field">
                    <button type="submit" name="update_timer" class="btn-save">💾 Сохранить</button>
                </div>
            </div>
        </form>
        <?php if ($promoTimerEnabled): ?>
        <div style="margin-top: 15px; padding: 10px; background: #00c853; border-radius: 8px; color: #fff; text-align: center;">
            ✅ Плашка с таймером активна
        </div>
        <?php else: ?>
        <div style="margin-top: 15px; padding: 10px; background: #ff4444; border-radius: 8px; color: #fff; text-align: center;">
            ❌ Плашка с таймером отключена
        </div>
        <?php endif; ?>
    </div>

    <!-- Товары и размеры -->
    <div class="card">
        <h2>📦 Товары и размеры</h2>
        <?php if (!is_array($products)): ?>
            <p style="color:red">Ошибка загрузки товаров. Проверьте ключи Supabase.</p>
        <?php else: ?>
            <?php foreach ($products as $product): 
                $pid = $product['id'];
            ?>
            <div class="product-block">
                <div class="product-title"><?= htmlspecialchars($product['name'] ?? $pid) ?> (ID: <?= htmlspecialchars($pid) ?>)</div>
                
                <form method="POST">
                    <div class="product-row">
                        <div class="product-field">
                            <label>💰 Цена (RUB):</label>
                            <input type="number" name="price_rub" value="<?= $product['price_rub'] ?>" style="width:110px">
                        </div>
                        <div class="product-field">
                            <label>💵 Цена (BYN):</label>
                            <input type="number" name="price_byn" value="<?= $product['price_byn'] ?? '' ?>" style="width:110px" placeholder="BYN">
                        </div>
                        <div class="product-field">
                            <label>💲 Цена (USD):</label>
                            <input type="number" name="price_usd" value="<?= $product['price_usd'] ?? '' ?>" style="width:110px" placeholder="USD">
                        </div>
                        <div class="product-field">
                            <label>🏷️ Бейдж</label>
                            <select name="badge" style="width: 100px;">
                                <option value="" <?= empty($product['badge']) ? 'selected' : '' ?>>Нет</option>
                                <option value="HIT" <?= ($product['badge'] ?? '') === 'HIT' ? 'selected' : '' ?>>🔥 HIT</option>
                                <option value="NEW" <?= ($product['badge'] ?? '') === 'NEW' ? 'selected' : '' ?>>🆕 NEW</option>
                                <option value="SALE" <?= ($product['badge'] ?? '') === 'SALE' ? 'selected' : '' ?>>💸 SALE</option>
                                <option value="BESTSELLER" <?= ($product['badge'] ?? '') === 'BESTSELLER' ? 'selected' : '' ?>>⭐ BESTSELLER</option>
                                <option value="LIMITED" <?= ($product['badge'] ?? '') === 'LIMITED' ? 'selected' : '' ?>>⏰ LIMITED</option>
                            </select>
                        </div>
                        <div class="product-field">
                            <label class="checkbox-label">
                                <input type="checkbox" name="sold_out" value="1" <?= $product['sold_out'] ? 'checked' : '' ?>>
                                <span>🔴 SOLD OUT</span>
                            </label>
                        </div>
                        <div class="product-field">
                            <button type="submit" name="update_product" class="btn-save">💾 Сохранить</button>
                        </div>
                    </div>
                    <input type="hidden" name="product_id" value="<?= $pid ?>">
                </form>

                <div class="sizes-section">
                    <div class="sizes-title">📏 Размеры:</div>
                    <div class="sizes-list">
                        <?php
                        $pSizes = $sizesByProduct[$pid] ?? [];
                        if (empty($pSizes)):
                        ?>
                            <span style="color:#666; font-size:13px">Нет добавленных размеров</span>
                        <?php else: 
                            foreach ($pSizes as $s):
                        ?>
                        <div class="size-item">
                            <span><?= htmlspecialchars($s['size']) ?></span>
                            <?php if ($s['hidden']): ?>
                                <span class="hidden-badge">(скрыт)</span>
                            <?php endif; ?>
                            
                            <form method="POST" style="display:inline">
                                <input type="hidden" name="size_product_id" value="<?= $pid ?>">
                                <input type="hidden" name="size_name" value="<?= htmlspecialchars($s['size']) ?>">
                                <input type="hidden" name="current_hidden" value="<?= $s['hidden'] ? '1' : '0' ?>">
                                <button type="submit" name="toggle_size_hidden" class="size-toggle-btn">
                                    <?= $s['hidden'] ? '👁️ Показать' : '🙈 Скрыть' ?>
                                </button>
                            </form>

                            <form method="POST" style="display:inline" onsubmit="return confirm('Удалить размер <?= htmlspecialchars($s['size']) ?>?')">
                                <input type="hidden" name="delete_size_product" value="<?= $pid ?>">
                                <input type="hidden" name="delete_size_name" value="<?= htmlspecialchars($s['size']) ?>">
                                <button type="submit" name="delete_size" class="delete-size-btn" title="Удалить">🗑️</button>
                            </form>
                        </div>
                        <?php 
                            endforeach;
                        endif; 
                        ?>
                    </div>
                    
                    <form method="POST" class="add-size-form">
                        <input type="hidden" name="new_size_product_id" value="<?= $pid ?>">
                        <input type="text" name="new_size_name" placeholder="Новый размер (например, 23 см)" required>
                        <button type="submit" name="add_new_size" class="btn-add-size">➕ Добавить</button>
                    </form>
                </div>
            </div>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>

    <!-- Промокоды -->
    <div class="card">
        <h2>🎫 Промокоды</h2>
        <form method="POST" class="promo-form">
            <input type="text" name="code" placeholder="Код (LOA10)" required>
            <input type="number" name="discount" placeholder="Скидка %" required>
            <button type="submit" name="add_promo" class="btn-add">➕ Добавить</button>
        </form>
        <?php if (!empty($promoCodes)): ?>
        <table class="promo-table">
            <thead>
                <tr><th>Код</th><th>Скидка</th><th>Статус</th><th></th></tr>
            </thead>
            <tbody>
                <?php foreach ($promoCodes as $promo): ?>
                <tr>
                    <td data-label="Код"><?= htmlspecialchars($promo['code']) ?></td>
                    <td data-label="Скидка"><?= $promo['discount'] ?>%</td>
                    <td data-label="Статус"><span class="<?= $promo['active'] ? 'status-active' : 'status-inactive' ?>"><?= $promo['active'] ? '✅ Активен' : '❌ Неактивен' ?></span></td>
                    <td data-label="">
                        <form method="POST" style="margin:0">
                            <button type="submit" name="delete_promo" value="<?= htmlspecialchars($promo['code']) ?>" class="btn-delete" onclick="return confirm('Удалить промокод?')">🗑️ Удалить</button>
                        </form>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php else: ?>
        <p style="color:#aaa;">Промокодов пока нет</p>
        <?php endif; ?>
    </div>

    <!-- Ссылки -->
    <div class="card">
        <h2>🔗 Быстрые ссылки</h2>
        <div class="links-grid">
            <a href="/" class="checkout-link" target="_blank">🏠 На сайт</a>
            <a href="https://supabase.com/dashboard" class="checkout-link" target="_blank">🐘 Supabase Dashboard</a>
        </div>
    </div>
</div>
</body>
</html>
