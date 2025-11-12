<?php
include_once 'config.php';

$database = new Database();
$db = $database->getConnection();

if ($db) {
    echo json_encode([
        "success" => true,
        "message" => "Conexión exitosa a Supabase",
        "server_info" => $db->getAttribute(PDO::ATTR_SERVER_INFO)
    ]);
} else {
    echo json_encode([
        "success" => false,
        "message" => "Error de conexión"
    ]);
}
?>