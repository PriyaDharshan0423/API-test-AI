from typing import Any

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def extract_operations(document: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize OpenAPI paths into endpoint records while retaining schemas."""
    operations = []
    for path, path_item in document.get("paths", {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS or not isinstance(operation, dict):
                continue
            request_body = operation.get("requestBody", {})
            content = request_body.get("content", {}) if isinstance(request_body, dict) else {}
            json_content = content.get("application/json", {})
            operations.append({
                "path": path,
                "method": method.upper(),
                "operationId": operation.get("operationId"),
                "summary": operation.get("summary", ""),
                "requestSchema": json_content.get("schema"),
                "responses": operation.get("responses", {}),
                "tags": operation.get("tags", []),
            })
    return operations
