from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from typing import Literal
import json
import yaml
from app.services.ai import repair_payload
from app.services.validation import validate_payload

router = APIRouter()


class ValidateRequest(BaseModel):
    payload: object
    json_schema: dict = Field(alias="schema")


class FixRequest(ValidateRequest):
    pass


class GenerateRequest(BaseModel):
    json_schema: dict = Field(alias="schema")
    count: int = Field(default=5, ge=1, le=50)
    include_negative: bool = True


class ExportRequest(BaseModel):
    framework: Literal["jest", "playwright", "rest-assured", "postman"]
    tests: list[dict]


@router.post("/validate")
async def validate(request: ValidateRequest):
    return validate_payload(request.payload, request.json_schema)


@router.post("/fix")
async def fix(request: FixRequest):
    result = validate_payload(request.payload, request.json_schema)
    repaired = await repair_payload(request.payload, request.json_schema, result["issues"])
    return {"payload": repaired, "validation": validate_payload(repaired, request.json_schema)}


@router.post("/openapi/import")
async def import_openapi(file: UploadFile = File(...)):
    if file.size and file.size > 5_000_000:
        raise HTTPException(status_code=413, detail="OpenAPI document exceeds 5 MB.")
    try:
        contents = await file.read()
        document = yaml.safe_load(contents)
        if not isinstance(document, dict) or "openapi" not in document and "swagger" not in document:
            raise ValueError("Expected an OpenAPI or Swagger document.")
        endpoints = []
        for path, methods in document.get("paths", {}).items():
            for method, operation in methods.items():
                if method.lower() in {"get", "post", "put", "patch", "delete", "head", "options"} and isinstance(operation, dict):
                    request_body = operation.get("requestBody", {})
                    content = request_body.get("content", {}) if isinstance(request_body, dict) else {}
                    json_schema = content.get("application/json", {}).get("schema") if isinstance(content.get("application/json", {}), dict) else None
                    endpoints.append({"path": path, "method": method.upper(), "summary": operation.get("summary", operation.get("operationId", "")), "operationId": operation.get("operationId"), "requestSchema": json_schema})
        return {"title": document.get("info", {}).get("title", "Imported API"), "version": document.get("info", {}).get("version", ""), "endpoints": endpoints, "count": len(endpoints)}
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse OpenAPI document: {exc}") from exc


@router.post("/collections/import")
async def import_postman_collection(file: UploadFile = File(...)):
    try:
        collection = json.loads(await file.read())
        if not isinstance(collection, dict) or "item" not in collection:
            raise ValueError("Expected a Postman Collection with an item array.")
        requests = []

        def visit(items):
            for item in items if isinstance(items, list) else []:
                if isinstance(item, dict) and isinstance(item.get("request"), dict):
                    request = item["request"]
                    url = request.get("url", "")
                    if isinstance(url, dict):
                        url = url.get("raw", "")
                    requests.append({"name": item.get("name", "Untitled request"), "method": request.get("method", "GET"), "url": url})
                elif isinstance(item, dict):
                    visit(item.get("item", []))

        visit(collection.get("item", []))
        return {"name": collection.get("info", {}).get("name", "Imported collection"), "requests": requests, "count": len(requests)}
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse Postman collection: {exc}") from exc


@router.post("/tests/generate")
async def generate_tests(request: GenerateRequest):
    properties = request.json_schema.get("properties", {})
    required = request.json_schema.get("required", [])
    positive = {key: _example(properties.get(key, {})) for key in required}
    tests = [{"name": "Valid required fields", "kind": "positive", "payload": positive}]
    if request.include_negative:
        for key in required:
            tests.append({"name": f"Missing required field: {key}", "kind": "negative", "payload": {k: v for k, v in positive.items() if k != key}})
    return {"tests": tests[:request.count], "count": min(len(tests), request.count)}


@router.post("/tests/export")
async def export_tests(request: ExportRequest):
    serialized = json.dumps(request.tests, indent=2)
    if request.framework == "jest":
        code = f"const cases = {serialized};\ndescribe('generated API cases', () => {{\n  test.each(cases)('$name', async (testCase) => {{\n    // Connect your API client and assert testCase.expected here.\n    expect(testCase.payload).toBeDefined();\n  }});\n}});"
    elif request.framework == "playwright":
        code = f"import {{ test, expect }} from '@playwright/test';\n\nconst cases = {serialized};\nfor (const testCase of cases) {{\n  test(testCase.name, async ({{ request }}) => {{\n    // Add the target URL and expected response assertions for your API.\n    expect(testCase.payload).toBeDefined();\n  }});\n}}"
    elif request.framework == "rest-assured":
        code = "// Adapt generated cases to your DTO and base URI before running.\n" + "\n".join(f"// {case.get('name', 'Generated case')}\n// given().contentType(JSON).body(/* payload */).when().post(\"/\").then().statusCode(/* expected */);" for case in request.tests)
    else:
        code = json.dumps({"info": {"name": "API Test AI generated tests", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"}, "item": [{"name": case.get("name", "Generated case"), "request": {"method": "POST", "url": "{{baseUrl}}", "body": {"mode": "raw", "raw": json.dumps(case.get("payload", {})), "options": {"raw": {"language": "json"}}}}} for case in request.tests]}, indent=2)
    return {"framework": request.framework, "code": code}


def _example(prop: dict):
    if "example" in prop:
        return prop["example"]
    if "enum" in prop and prop["enum"]:
        return prop["enum"][0]
    kind = prop.get("type")
    return {"string": "example", "integer": 1, "number": 1.0, "boolean": True, "array": [], "object": {}}.get(kind)
