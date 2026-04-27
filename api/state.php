<?php
declare(strict_types=1);

const MAX_BODY_BYTES = 8_000_000;
const MAX_PRODUCTS = 10_000;
const MAX_ORDERS = 50_000;
const MAX_USERS = 20_000;
const ALLOWED_ROLES = ['buyer', 'supplier', 'admin'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Allow: GET, POST, OPTIONS');
    http_response_code(204);
    exit;
}

try {
    $pdo = open_db();
    ensure_schema($pdo);

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        respond(200, [
            'ok' => true,
            'state' => read_state($pdo),
        ]);
    }

    if ($method !== 'POST') {
        header('Allow: GET, POST, OPTIONS');
        respond(405, [
            'ok' => false,
            'error' => 'Method not allowed',
        ]);
    }

    $payload = parse_json_body();
    if (!isset($payload['state']) || !is_array($payload['state'])) {
        respond(422, [
            'ok' => false,
            'error' => 'Invalid payload',
        ]);
    }

    $state = sanitize_state($payload['state']);
    write_state($pdo, $state);

    respond(200, [
        'ok' => true,
        'saved' => true,
        'updatedAt' => gmdate('c'),
    ]);
} catch (JsonException) {
    respond(400, [
        'ok' => false,
        'error' => 'Invalid JSON',
    ]);
} catch (Throwable) {
    respond(500, [
        'ok' => false,
        'error' => 'Server error',
    ]);
}

function parse_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        respond(400, [
            'ok' => false,
            'error' => 'Request body is required',
        ]);
    }

    if (strlen($raw) > MAX_BODY_BYTES) {
        respond(413, [
            'ok' => false,
            'error' => 'Payload too large',
        ]);
    }

    $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($decoded)) {
        respond(422, [
            'ok' => false,
            'error' => 'Invalid payload',
        ]);
    }

    return $decoded;
}

function open_db(): PDO
{
    $cfg = db_config();
    $dbName = validate_database_name((string) $cfg['database']);

    $baseDsn = sprintf(
        'mysql:host=%s;port=%d;charset=%s',
        (string) $cfg['host'],
        (int) $cfg['port'],
        (string) $cfg['charset']
    );

    $base = new PDO($baseDsn, (string) $cfg['username'], (string) $cfg['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $base->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $base = null;

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        (string) $cfg['host'],
        (int) $cfg['port'],
        $dbName,
        (string) $cfg['charset']
    );

    return new PDO($dsn, (string) $cfg['username'], (string) $cfg['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function ensure_schema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS app_state (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            state_json LONGTEXT NOT NULL,
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                ON UPDATE CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS users (
            id INT UNSIGNED NOT NULL PRIMARY KEY,
            role VARCHAR(32) NOT NULL,
            company VARCHAR(190) NOT NULL,
            email VARCHAR(190) NOT NULL,
            password VARCHAR(255) NOT NULL,
            contact_name VARCHAR(190) NOT NULL DEFAULT \'\',
            phone VARCHAR(40) NOT NULL DEFAULT \'\',
            address VARCHAR(255) NOT NULL DEFAULT \'\',
            business_type VARCHAR(80) NOT NULL DEFAULT \'\',
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                ON UPDATE CURRENT_TIMESTAMP(6),
            UNIQUE KEY uq_users_email_role (email, role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function read_state(PDO $pdo): ?array
{
    $stmt = $pdo->query('SELECT state_json FROM app_state WHERE id = 1 LIMIT 1');
    $row = $stmt->fetch();

    $hasStateRow = $row && isset($row['state_json']);
    $decoded = $hasStateRow ? json_decode((string) $row['state_json'], true) : [];
    if (!is_array($decoded)) {
        $decoded = [];
    }

    $users = read_users($pdo);
    if ($users !== []) {
        $decoded['users'] = $users;
        $decoded['nextUserId'] = max((int) ($decoded['nextUserId'] ?? 1), max_user_id($users) + 1);
    }

    if (!$hasStateRow && $users === []) {
        return null;
    }

    return $decoded;
}

function write_state(PDO $pdo, array $state): void
{
    $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Failed to encode state');
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO app_state (id, state_json, updated_at)
             VALUES (1, :state_json, UTC_TIMESTAMP(6))
             ON DUPLICATE KEY UPDATE
               state_json = VALUES(state_json),
               updated_at = UTC_TIMESTAMP(6)'
        );

        $stmt->execute([
            ':state_json' => $json,
        ]);

        $users = is_array($state['users'] ?? null) ? $state['users'] : [];
        sync_users($pdo, $users);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function read_users(PDO $pdo): array
{
    $stmt = $pdo->query(
        'SELECT id, role, company, email, password, contact_name, phone, address, business_type, created_at
         FROM users
         ORDER BY id ASC'
    );

    $rows = $stmt->fetchAll();
    if (!is_array($rows)) {
        return [];
    }

    $users = [];
    foreach ($rows as $row) {
        $users[] = [
            'id' => (int) ($row['id'] ?? 0),
            'role' => (string) ($row['role'] ?? 'buyer'),
            'company' => (string) ($row['company'] ?? ''),
            'email' => strtolower(trim((string) ($row['email'] ?? ''))),
            'password' => (string) ($row['password'] ?? ''),
            'contactName' => (string) ($row['contact_name'] ?? ''),
            'phone' => (string) ($row['phone'] ?? ''),
            'address' => (string) ($row['address'] ?? ''),
            'businessType' => (string) ($row['business_type'] ?? ''),
            'createdAt' => (string) ($row['created_at'] ?? ''),
        ];
    }

    return $users;
}

function sync_users(PDO $pdo, array $users): void
{
    $pdo->exec('DELETE FROM users');
    if ($users === []) {
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO users (
            id, role, company, email, password, contact_name, phone, address, business_type, created_at, updated_at
         ) VALUES (
            :id, :role, :company, :email, :password, :contact_name, :phone, :address, :business_type, :created_at, UTC_TIMESTAMP(6)
         )'
    );

    foreach ($users as $user) {
        $stmt->execute([
            ':id' => (int) ($user['id'] ?? 0),
            ':role' => (string) ($user['role'] ?? 'buyer'),
            ':company' => (string) ($user['company'] ?? ''),
            ':email' => strtolower(trim((string) ($user['email'] ?? ''))),
            ':password' => (string) ($user['password'] ?? ''),
            ':contact_name' => (string) ($user['contactName'] ?? ''),
            ':phone' => (string) ($user['phone'] ?? ''),
            ':address' => (string) ($user['address'] ?? ''),
            ':business_type' => (string) ($user['businessType'] ?? ''),
            ':created_at' => normalize_datetime_for_db((string) ($user['createdAt'] ?? '')),
        ]);
    }
}

function sanitize_state(array $input): array
{
    $users = sanitize_users(is_array($input['users'] ?? null) ? $input['users'] : []);

    $state = [
        'products' => is_array($input['products'] ?? null) ? array_values($input['products']) : [],
        'orders' => is_array($input['orders'] ?? null) ? array_values($input['orders']) : [],
        'carts' => is_array($input['carts'] ?? null) ? $input['carts'] : (object) [],
        'announcements' => is_array($input['announcements'] ?? null) ? array_values($input['announcements']) : [],
        'nextProductId' => max(1, (int) ($input['nextProductId'] ?? 1)),
        'nextOrderId' => max(1, (int) ($input['nextOrderId'] ?? 1)),
        'nextNoticeId' => max(1, (int) ($input['nextNoticeId'] ?? 1)),
        'users' => $users,
        'nextUserId' => max(1, (int) ($input['nextUserId'] ?? 1), max_user_id($users) + 1),
        'session' => null,
    ];

    if (count($state['products']) > MAX_PRODUCTS || count($state['orders']) > MAX_ORDERS || count($state['users']) > MAX_USERS) {
        throw new RuntimeException('State too large');
    }

    return $state;
}

function sanitize_users(array $users): array
{
    $clean = [];
    foreach ($users as $index => $user) {
        if (!is_array($user)) {
            continue;
        }

        $role = strtolower(trim((string) ($user['role'] ?? 'buyer')));
        if (!in_array($role, ALLOWED_ROLES, true)) {
            $role = 'buyer';
        }

        $clean[] = [
            'id' => max(1, (int) ($user['id'] ?? ($index + 1))),
            'role' => $role,
            'company' => trim((string) ($user['company'] ?? '')),
            'email' => strtolower(trim((string) ($user['email'] ?? ''))),
            'password' => (string) ($user['password'] ?? ''),
            'contactName' => trim((string) ($user['contactName'] ?? '')),
            'phone' => trim((string) ($user['phone'] ?? '')),
            'address' => trim((string) ($user['address'] ?? '')),
            'businessType' => trim((string) ($user['businessType'] ?? '')),
            'createdAt' => normalize_datetime_for_db((string) ($user['createdAt'] ?? '')),
        ];
    }

    return $clean;
}

function normalize_datetime_for_db(string $value): string
{
    try {
        $dt = new DateTimeImmutable($value !== '' ? $value : 'now', new DateTimeZone('UTC'));
    } catch (Throwable) {
        $dt = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
}

function max_user_id(array $users): int
{
    $max = 0;
    foreach ($users as $user) {
        if (is_array($user)) {
            $max = max($max, (int) ($user['id'] ?? 0));
        }
    }

    return $max;
}

function db_config(): array
{
    $cfg = [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'foodsupply_b2b',
        'username' => 'root',
        'password' => '',
        'charset' => 'utf8mb4',
    ];

    $localConfigFile = __DIR__ . DIRECTORY_SEPARATOR . 'db_config.php';
    if (is_file($localConfigFile)) {
        $local = require $localConfigFile;
        if (is_array($local)) {
            $cfg = array_merge($cfg, $local);
        }
    }

    $cfg['host'] = env_or('B2B_DB_HOST', (string) $cfg['host']);
    $cfg['database'] = env_or('B2B_DB_NAME', (string) $cfg['database']);
    $cfg['username'] = env_or('B2B_DB_USER', (string) $cfg['username']);
    $cfg['password'] = env_or('B2B_DB_PASS', (string) $cfg['password']);
    $cfg['charset'] = env_or('B2B_DB_CHARSET', (string) $cfg['charset']);

    $port = (int) env_or('B2B_DB_PORT', (string) $cfg['port']);
    $cfg['port'] = $port > 0 ? $port : 3306;

    return $cfg;
}

function env_or(string $name, string $fallback): string
{
    $value = getenv($name);
    return ($value === false || $value === '') ? $fallback : $value;
}

function validate_database_name(string $name): string
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $name)) {
        throw new RuntimeException('Invalid database name');
    }

    return $name;
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
