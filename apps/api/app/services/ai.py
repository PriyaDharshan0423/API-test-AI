import json
from openai import AsyncOpenAI
from app.core.config import settings


async def repair_payload(payload: object, schema: dict, issues: list[dict]) -> dict:
    """Return an AI repair when configured; otherwise a safe schema-based starter."""
    if settings.openai_api_key:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "Repair the JSON instance to satisfy the given JSON Schema. Preserve existing user data. For unknown required values use type-appropriate placeholders. Return only the structured result."},
                {"role": "user", "content": json.dumps({"payload": payload, "schema": schema, "issues": issues})},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "payload_repair",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "payload_json": {"type": "string"},
                            "explanation": {"type": "string"},
                        },
                        "required": ["payload_json", "explanation"],
                        "additionalProperties": False,
                    },
                },
            },
        )
        result = json.loads(response.choices[0].message.content or "{}")
        return json.loads(result["payload_json"])
    return _fill_required(payload if isinstance(payload, dict) else {}, schema)


def _fill_required(payload: dict, schema: dict) -> dict:
    fixed = dict(payload)
    properties = schema.get("properties", {})
    for key in schema.get("required", []):
        if key not in fixed:
            prop = properties.get(key, {})
            kind = prop.get("type")
            fixed[key] = {"string": "string", "integer": 0, "number": 0, "boolean": False, "array": [], "object": {}}.get(kind, None)
            if "enum" in prop:
                fixed[key] = prop["enum"][0]
    for key, value in list(fixed.items()):
        prop = properties.get(key, {})
        if prop.get("type") == "object" and isinstance(value, dict):
            fixed[key] = _fill_required(value, prop)
    return fixed
