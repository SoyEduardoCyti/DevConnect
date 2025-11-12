<?php
include_once 'config.php';

$database = new Database();
$db = $database->getConnection();

if ($_SERVER['REQUEST_METHOD'] == 'GET') {
    getJobs($db);
} else if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $current_user = verifyToken($db);
    $data = json_decode(file_get_contents("php://input"));
    
    if (isset($data->action)) {
        switch($data->action) {
            case 'add':
                addJob($db, $current_user, $data);
                break;
            case 'update':
                updateJob($db, $current_user, $data);
                break;
            case 'delete':
                deleteJob($db, $current_user, $data);
                break;
            default:
                http_response_code(400);
                echo json_encode(["error" => "Acción no válida"]);
                break;
        }
    } else {
        http_response_code(400);
        echo json_encode(["error" => "Acción no especificada"]);
    }
}

function getJobs($db) {
    try {
        // Cambio: activa = 1 en lugar de TRUE
        $query = "
            SELECT 
                o.id,
                o.titulo,
                o.empresa,
                o.descripcion,
                o.empleador_id,
                u.nombres AS empleador_nombre,
                u.apellidos AS empleador_apellido,
                o.fecha_publicacion,
                STRING_AGG(DISTINCT l.nombre, ',') AS requisitos
            FROM ofertas_trabajo o
            JOIN usuarios u ON o.empleador_id = u.id
            LEFT JOIN oferta_requisitos orq ON o.id = orq.oferta_id
            LEFT JOIN lenguajes l ON orq.lenguaje_id = l.id
            WHERE o.activa = 1
            GROUP BY o.id, o.titulo, o.empresa, o.descripcion, o.empleador_id, 
                     u.nombres, u.apellidos, o.fecha_publicacion
            ORDER BY o.fecha_publicacion DESC
        ";
        
        $stmt = $db->prepare($query);
        $stmt->execute();
        
        $jobs = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $jobs[] = [
                "id" => $row['id'],
                "title" => $row['titulo'],
                "company" => $row['empresa'],
                "description" => $row['descripcion'],
                "employerId" => $row['empleador_id'],
                "employerName" => $row['empleador_nombre'] . ' ' . $row['empleador_apellido'],
                "requirements" => $row['requisitos'] ? explode(',', $row['requisitos']) : [],
                "publicationDate" => $row['fecha_publicacion']
            ];
        }
        
        echo json_encode(["success" => true, "jobs" => $jobs]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Error al obtener ofertas: " . $e->getMessage()]);
    }
}

function addJob($db, $user, $data) {
    if ($user['tipo'] != 'empleador') {
        http_response_code(403);
        echo json_encode(["error" => "Solo los empleadores pueden crear ofertas"]);
        return;
    }
    
    $required_fields = ['title', 'company', 'description'];
    foreach ($required_fields as $field) {
        if (!isset($data->$field)) {
            http_response_code(400);
            echo json_encode(["error" => "Campo requerido: $field"]);
            return;
        }
    }

    try {
        // Cambio: retornar el ID usando RETURNING
        $query = "INSERT INTO ofertas_trabajo (titulo, empresa, descripcion, empleador_id, activa) 
                  VALUES (?, ?, ?, ?, 1) RETURNING id";
        $stmt = $db->prepare($query);
        $stmt->execute([
            $data->title,
            $data->company,
            $data->description,
            $user['id']
        ]);
        
        $job_id = $stmt->fetch(PDO::FETCH_ASSOC)['id'];
        
        if (isset($data->requirements) && is_array($data->requirements)) {
            insertJobRequirements($db, $job_id, $data->requirements);
        }
        
        echo json_encode([
            "success" => true,
            "message" => "Oferta creada exitosamente",
            "job_id" => $job_id
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Error al crear oferta: " . $e->getMessage()]);
    }
}

function updateJob($db, $user, $data) {
    if ($user['tipo'] != 'empleador') {
        http_response_code(403);
        echo json_encode(["error" => "Solo los empleadores pueden editar ofertas"]);
        return;
    }
    
    if (!isset($data->jobId)) {
        http_response_code(400);
        echo json_encode(["error" => "ID de oferta requerido"]);
        return;
    }
    
    $required_fields = ['title', 'company', 'description'];
    foreach ($required_fields as $field) {
        if (!isset($data->$field)) {
            http_response_code(400);
            echo json_encode(["error" => "Campo requerido: $field"]);
            return;
        }
    }

    try {
        // Verificar que sea propietario
        $check_query = "SELECT empleador_id FROM ofertas_trabajo WHERE id = ?";
        $check_stmt = $db->prepare($check_query);
        $check_stmt->execute([$data->jobId]);
        
        if ($check_stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(["error" => "Oferta no encontrada"]);
            return;
        }
        
        $oferta = $check_stmt->fetch(PDO::FETCH_ASSOC);
        if ($oferta['empleador_id'] != $user['id']) {
            http_response_code(403);
            echo json_encode(["error" => "No tienes permiso para editar esta oferta"]);
            return;
        }
        
        $query = "UPDATE ofertas_trabajo SET titulo = ?, empresa = ?, descripcion = ? WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([
            $data->title,
            $data->company,
            $data->description,
            $data->jobId
        ]);
        
        // Eliminar requisitos antiguos
        $delete_req = "DELETE FROM oferta_requisitos WHERE oferta_id = ?";
        $delete_stmt = $db->prepare($delete_req);
        $delete_stmt->execute([$data->jobId]);
        
        // Insertar nuevos requisitos
        if (isset($data->requirements) && is_array($data->requirements)) {
            insertJobRequirements($db, $data->jobId, $data->requirements);
        }
        
        echo json_encode([
            "success" => true,
            "message" => "Oferta actualizada exitosamente"
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Error al actualizar oferta: " . $e->getMessage()]);
    }
}

function deleteJob($db, $user, $data) {
    if ($user['tipo'] != 'empleador') {
        http_response_code(403);
        echo json_encode(["error" => "Solo los empleadores pueden eliminar ofertas"]);
        return;
    }
    
    if (!isset($data->jobId)) {
        http_response_code(400);
        echo json_encode(["error" => "ID de oferta requerido"]);
        return;
    }

    try {
        // Verificar que sea propietario
        $check_query = "SELECT empleador_id FROM ofertas_trabajo WHERE id = ?";
        $check_stmt = $db->prepare($check_query);
        $check_stmt->execute([$data->jobId]);
        
        if ($check_stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(["error" => "Oferta no encontrada"]);
            return;
        }
        
        $oferta = $check_stmt->fetch(PDO::FETCH_ASSOC);
        if ($oferta['empleador_id'] != $user['id']) {
            http_response_code(403);
            echo json_encode(["error" => "No tienes permiso para eliminar esta oferta"]);
            return;
        }
        
        // Eliminar requisitos
        $delete_req = "DELETE FROM oferta_requisitos WHERE oferta_id = ?";
        $delete_stmt = $db->prepare($delete_req);
        $delete_stmt->execute([$data->jobId]);
        
        // Marcar como inactiva (cambio: = 0 en lugar de FALSE)
        $query = "UPDATE ofertas_trabajo SET activa = 0 WHERE id = ?";
        $stmt = $db->prepare($query);
        $stmt->execute([$data->jobId]);
        
        echo json_encode([
            "success" => true,
            "message" => "Oferta eliminada exitosamente"
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Error al eliminar oferta: " . $e->getMessage()]);
    }
}

function insertJobRequirements($db, $job_id, $requirements) {
    foreach ($requirements as $req_name) {
        try {
            $lang_query = "SELECT id FROM lenguajes WHERE nombre = ?";
            $lang_stmt = $db->prepare($lang_query);
            $lang_stmt->execute([$req_name]);
            
            if ($lang_stmt->rowCount() > 0) {
                $language_id = $lang_stmt->fetch(PDO::FETCH_ASSOC)['id'];
            } else {
                $insert_lang = "INSERT INTO lenguajes (nombre) VALUES (?) RETURNING id";
                $insert_stmt = $db->prepare($insert_lang);
                $insert_stmt->execute([$req_name]);
                $language_id = $insert_stmt->fetch(PDO::FETCH_ASSOC)['id'];
            }
            
            $req_query = "INSERT INTO oferta_requisitos (oferta_id, lenguaje_id) 
                         VALUES (?, ?) 
                         ON CONFLICT DO NOTHING";
            $req_stmt = $db->prepare($req_query);
            $req_stmt->execute([$job_id, $language_id]);
        } catch (PDOException $e) {
            continue;
        }
    }
}
?>