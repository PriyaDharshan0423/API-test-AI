from app.services.validation import validate_payload


def test_valid_payload_passes():
    result = validate_payload({"customerId": "CUST001", "name": "John Doe"}, {
        "type": "object",
        "required": ["customerId", "name"],
        "properties": {"customerId": {"type": "string"}, "name": {"type": "string"}},
    })
    assert result["valid"] is True
    assert result["issues"] == []


def test_missing_required_field_is_explained():
    result = validate_payload({"name": "John Doe"}, {
        "type": "object",
        "required": ["customerId"],
        "properties": {"customerId": {"type": "string"}},
    })
    assert result["valid"] is False
    assert result["issues"][0]["path"] == "$"
    assert "customerId" in result["issues"][0]["plainEnglish"]


def test_type_mismatch_is_reported():
    result = validate_payload({"customerId": 123}, {
        "type": "object", "properties": {"customerId": {"type": "string"}},
    })
    assert result["valid"] is False
    assert result["issues"][0]["keyword"] == "type"
