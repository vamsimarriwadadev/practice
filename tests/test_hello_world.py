# tests/test_hello_world.py

import pytest
from conftest import invoke

FUNCTION = "dev-hello-world"


def test_hello_with_name(lambda_client):
    result = invoke(lambda_client, FUNCTION, {"name": "Vamsi"})
    assert result["statusCode"] == 200

    import json
    body = json.loads(result["body"])
    assert body["message"] == "Hello, Vamsi!"


def test_hello_default_name(lambda_client):
    """No name in payload — should fall back to 'World'."""
    result = invoke(lambda_client, FUNCTION, {})
    assert result["statusCode"] == 200

    import json
    body = json.loads(result["body"])
    assert body["message"] == "Hello, World!"


def test_hello_empty_string_name(lambda_client):
    """Empty string name is passed through as-is."""
    result = invoke(lambda_client, FUNCTION, {"name": ""})
    assert result["statusCode"] == 200

    import json
    body = json.loads(result["body"])
    # empty string is falsy → falls back to 'World'
    assert "World" in body["message"]


def test_function_exists(lambda_client):
    """Sanity check — function must be deployed before tests run."""
    response = lambda_client.get_function(FunctionName=FUNCTION)
    assert response["Configuration"]["FunctionName"] == FUNCTION
    assert response["Configuration"]["Runtime"] == "python3.12"
