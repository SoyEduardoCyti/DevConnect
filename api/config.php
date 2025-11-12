<?php

date_default_timezone_set('America/Mexico_City');
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

class Database {
    // CONFIGURACIÓN PARA SUPABASE POSTGRESQL
    private $host = "db.mhmlwgsrzmqtsvfofcpw.supabase.co";
    private $db_name = "postgres";
    private $username = "postgres";
    private $password = "pXH2CbbDXAZkPKOb"; // ⚠️ CAMBIA ESTO por tu contraseña real
    private $port = "5432";
    public $conn;

    public function getConnection() {
        $this->conn = null;
        try {
            // Cadena de conexión para PostgreSQL
            $dsn = "pgsql:host=" . $this->host . 
                   ";port=" . $this->port . 
                   ";dbname=" . $this->db_name;
            
            $this->conn = new PDO(
                $dsn,
                $this->username,
                $this->password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ]
            );
        } catch(PDOException $exception) {
            http_response_code(500);
            echo json_encode([
                "error" => "Error de conexión a la base de datos",
                "details" => $exception->getMessage()
            ]);
            exit;
        }
        return $this->conn;
    }
}

function getAuthorizationHeader() {
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER['Authorization']);
    } else if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers = trim($_SERVER['HTTP_AUTHORIZATION']);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $requestHeaders = array_combine(
            array_map('ucwords', array_keys($requestHeaders)), 
            array_values($requestHeaders)
        );
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }
    return $headers;
}

function getBearerToken() {
    $headers = getAuthorizationHeader();
    if (!empty($headers)) {
        if (preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
            return $matches[1];
        }
    }
    return null;
}

function verifyToken($db) {
    $token = getBearerToken();
    if (!$token) {
        http_response_code(401);
        echo json_encode(["error" => "Token no proporcionado"]);
        exit;
    }

    try {
        $query = "SELECT u.*, tu.nombre as tipo 
                  FROM usuarios u 
                  JOIN tipo_usuario tu ON u.tipo_id = tu.id 
                  WHERE u.id = ? AND u.activo = TRUE";
        $stmt = $db->prepare($query);
        $stmt->execute([$token]);
        
        if ($stmt->rowCount() > 0) {
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            return $user;
        } else {
            http_response_code(401);
            echo json_encode(["error" => "Token inválido"]);
            exit;
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            "error" => "Error al verificar token",
            "details" => $e->getMessage()
        ]);
        exit;
    }
}
?>