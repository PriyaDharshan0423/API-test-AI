"""Streamlit-hosted interface for the API Test AI schema validation workflow."""
from __future__ import annotations

import copy
import json
import os
from typing import Any

import requests
import streamlit as st
import yaml
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

st.set_page_config(page_title="API Test AI", page_icon="🧪", layout="wide")
st.title("🧪 API Test AI")
st.caption("Import an OpenAPI contract, inspect operations, and validate or repair JSON request payloads.")


def api_base_url() -> str:
    try:
        value = st.secrets.get("API_BASE_URL", "")
    except (FileNotFoundError, AttributeError):
        value = ""
    return (value or os.getenv("API_BASE_URL", "")).rstrip("/")


def resolve_local_refs(value: Any, root: dict[str, Any], seen: frozenset[str] = frozenset()) -> Any:
    """Resolve local OpenAPI component references while avoiding circular refs."""
    if isinstance(value, list):
        return [resolve_local_refs(item, root, seen) for item in value]
    if not isinstance(value, dict):
        return value
    ref = value.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/components/") and ref not in seen:
        target: Any = root
        try:
            for segment in ref[2:].split("/"):
                target = target[segment.replace("~1", "/").replace("~0", "~")]
            merged = {**copy.deepcopy(target), **{key: item for key, item in value.items() if key != "$ref"}}
            return resolve_local_refs(merged, root, seen | {ref})
        except (KeyError, TypeError):
            return value
    return {key: resolve_local_refs(item, root, seen) for key, item in value.items()}


def operation_rows(document: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    paths = document.get("paths", {})
    if not isinstance(paths, dict):
        return rows
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() not in {"get", "post", "put", "patch", "delete", "head", "options"} or not isinstance(operation, dict):
                continue
            body = operation.get("requestBody", {})
            body = resolve_local_refs(body, document) if isinstance(body, dict) else {}
            content = body.get("content", {})
            content = content if isinstance(content, dict) else {}
            media = content.get("application/json") or next((item for item in content.values() if isinstance(item, dict) and "schema" in item), {})
            schema = media.get("schema", {"type": "object"}) if isinstance(media, dict) else {"type": "object"}
            schema = resolve_local_refs(schema, document) if isinstance(schema, dict) else {"type": "object"}
            rows.append({
                "key": f"{method.upper()} {path}",
                "method": method.upper(),
                "path": path,
                "summary": operation.get("summary") or operation.get("operationId") or "Untitled operation",
                "schema": schema,
            })
    return rows


def validate_payload(payload: Any, schema: dict[str, Any]) -> list[dict[str, str]]:
    try:
        validator = Draft202012Validator(schema)
        issues = []
        for error in sorted(validator.iter_errors(payload), key=lambda item: list(map(str, item.absolute_path))):
            path = ".".join(map(str, error.absolute_path)) or "$"
            message = error.message
            if error.validator == "required":
                missing = [key for key in error.validator_value if key not in (error.instance or {})]
                message = f"Add the required field{'s' if len(missing) != 1 else ''}: {', '.join(missing)}."
            elif error.validator == "type":
                expected = error.validator_value if isinstance(error.validator_value, str) else " or ".join(error.validator_value)
                message = f"This value must be {expected}."
            elif error.validator == "enum":
                message = f"Choose one of: {', '.join(map(str, error.validator_value))}."
            issues.append({"path": path, "keyword": str(error.validator), "message": message})
        return issues
    except SchemaError as error:
        return [{"path": "$schema", "keyword": "schema", "message": f"The imported schema is invalid: {error.message}"}]


def example_for(schema: dict[str, Any]) -> Any:
    if "example" in schema:
        return schema["example"]
    if "default" in schema:
        return schema["default"]
    if schema.get("enum"):
        return schema["enum"][0]
    kind = schema.get("type")
    return {"string": "string", "integer": 0, "number": 0, "boolean": False, "array": [], "object": {}}.get(kind)


def fill_required(payload: Any, schema: dict[str, Any]) -> Any:
    if schema.get("type") == "object" and isinstance(payload, dict):
        fixed = dict(payload)
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in fixed:
                fixed[key] = example_for(properties.get(key, {}))
        for key, value in list(fixed.items()):
            prop = properties.get(key, {})
            if isinstance(prop, dict) and isinstance(value, dict):
                fixed[key] = fill_required(value, prop)
        return fixed
    return payload


with st.sidebar:
    st.header("Workspace")
    st.caption("API Test AI · Streamlit edition")
    backend_url = api_base_url()
    if backend_url:
        st.success("AI repair backend configured")
    else:
        st.info("Local schema validation is ready. Set API_BASE_URL in Streamlit secrets to enable backend AI repair.")
    st.divider()
    st.markdown("**Deploy entry point**")
    st.code("streamlit_app.py", language="text")

uploaded = st.file_uploader("Import an OpenAPI or Swagger spec", type=["json", "yaml", "yml"])
if uploaded is not None:
    try:
        parsed = yaml.safe_load(uploaded.getvalue())
        if not isinstance(parsed, dict) or not ("openapi" in parsed or "swagger" in parsed):
            raise ValueError("The file must contain an OpenAPI or Swagger document.")
        st.session_state["openapi_document"] = parsed
        st.session_state["openapi_filename"] = uploaded.name
    except Exception as error:
        st.error(f"Could not parse this API spec: {error}")

document = st.session_state.get("openapi_document")
if not document:
    st.info("Upload an OpenAPI JSON or YAML file to explore operations. You can also try a small sample contract below.")
    if st.button("Load sample Customer API"):
        st.session_state["openapi_document"] = {
            "openapi": "3.0.0",
            "info": {"title": "Customer API", "version": "1.0.0"},
            "paths": {"/v1/customers": {"post": {"summary": "Create a customer", "requestBody": {"content": {"application/json": {"schema": {"type": "object", "required": ["customerId", "name"], "properties": {"customerId": {"type": "string"}, "name": {"type": "string"}}, "additionalProperties": False}}}}, "responses": {"201": {"description": "Created"}}}}},
        }
        st.rerun()
    st.stop()

operations = operation_rows(document)
st.subheader(f"{document.get('info', {}).get('title', 'Imported API')} · {len(operations)} operations")
if not operations:
    st.warning("No supported HTTP operations were found in this document.")
    st.stop()

selection = st.selectbox("Choose an endpoint", options=operations, format_func=lambda op: f"{op['method']}  {op['path']}  —  {op['summary']}", key="operation_choice")
left, right = st.columns([1, 1], gap="large")
with left:
    st.markdown("#### Request payload")
    initial = st.session_state.get("payload_text", json.dumps({"customerId": "CUST001", "name": "John Doe"}, indent=2))
    payload_text = st.text_area("JSON body", value=initial, height=290, label_visibility="collapsed", key="payload_editor")
    action_validate, action_fix = st.columns(2)
    validate_clicked = action_validate.button("Validate payload", type="primary", use_container_width=True)
    fix_clicked = action_fix.button("Suggest repair", use_container_width=True)
with right:
    st.markdown("#### Request schema")
    st.json(selection["schema"], expanded=True)
    st.markdown("#### Test ideas")
    required = selection["schema"].get("required", []) if isinstance(selection["schema"], dict) else []
    st.write("✅ Valid request using schema examples")
    for field in required:
        st.write(f"⚠️ Negative case: omit required field `{field}`")

if validate_clicked or fix_clicked:
    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError as error:
        st.error(f"Malformed JSON at line {error.lineno}, column {error.colno}: {error.msg}")
        st.stop()

    if fix_clicked:
        if backend_url:
            try:
                response = requests.post(f"{backend_url}/api/v1/fix", json={"payload": payload, "schema": selection["schema"]}, timeout=30)
                response.raise_for_status()
                repaired = response.json()["payload"]
            except requests.RequestException as error:
                st.error(f"AI backend repair failed: {error}")
                st.stop()
        else:
            repaired = fill_required(payload, selection["schema"])
        payload_text = json.dumps(repaired, indent=2)
        st.session_state["payload_text"] = payload_text
        issues_after_fix = validate_payload(repaired, selection["schema"])
        if issues_after_fix:
            st.warning("Repair suggestion applied. Review the remaining schema issues.")
        else:
            st.success("Suggested payload now matches the schema. Review it before use.")
        st.code(payload_text, language="json")
    else:
        issues = validate_payload(payload, selection["schema"])
        if issues:
            st.error(f"Payload has {len(issues)} schema issue(s).")
            st.dataframe(issues, use_container_width=True, hide_index=True)
        else:
            st.success("Payload matches the endpoint schema.")

st.caption("Imported specs, payloads, and session state are not persisted. AI repair requires your own secured API deployment and API_BASE_URL secret.")
