from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError


def validate_payload(payload: object, schema: dict) -> dict:
    """Validate an instance against a JSON Schema and return actionable issues."""
    try:
        validator = Draft202012Validator(schema)
        issues = []
        for error in sorted(validator.iter_errors(payload), key=lambda item: list(map(str, item.absolute_path))):
            path = ".".join(str(part) for part in error.absolute_path) or "$"
            issues.append({
                "path": path,
                "keyword": error.validator,
                "message": error.message,
                "plainEnglish": _explain(error),
            })
        return {"valid": not issues, "issues": issues}
    except SchemaError as exc:
        return {"valid": False, "issues": [{"path": "$schema", "keyword": "schema", "message": exc.message, "plainEnglish": "The supplied schema is invalid."}]}


def _explain(error) -> str:
    if error.validator == "required":
        missing = [key for key in error.validator_value if key not in (error.instance or {})]
        return f"Add the required field{'s' if len(missing) != 1 else ''}: {', '.join(missing)}."
    if error.validator == "type":
        expected = error.validator_value if isinstance(error.validator_value, str) else " or ".join(error.validator_value)
        return f"This value must be {expected}; received {type(error.instance).__name__}."
    if error.validator == "enum":
        return f"Choose one of the allowed values: {', '.join(map(str, error.validator_value))}."
    if error.validator == "additionalProperties":
        return "Remove properties that are not defined by the schema."
    return error.message
