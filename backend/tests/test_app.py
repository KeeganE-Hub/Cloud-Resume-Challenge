# Tests for the REST version of the visitor counter (app.py).
#
# Run with:  pytest backend/tests/test_app.py -v
# Requires:  pip install pytest boto3 moto
#
# NOTE: kept alongside test_dbupdater.py / test_dbstreamprocessor.py
# while the WebSocket version (Part 8) is still being set up. Delete
# alongside app.py once the REST path is fully retired.

import importlib
import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

TABLE_NAME = "resume-visitor-count-test"

os.environ["TABLE_NAME"] = TABLE_NAME
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


@pytest.fixture
def lambda_module():
    """Reload app.py inside an active moto mock so its boto3 Table
    resource is created against the mocked DynamoDB, not real AWS."""
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        if "app" in sys.modules:
            importlib.reload(sys.modules["app"])
        else:
            import app  # noqa: F401

        yield sys.modules["app"]


def _gateway_event(method="GET"):
    return {"httpMethod": method}


def test_first_request_returns_count_one(lambda_module):
    result = lambda_module.lambda_handler(_gateway_event(), None)
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    assert body["count"] == 1


def test_count_increments_on_each_call(lambda_module):
    lambda_module.lambda_handler(_gateway_event(), None)
    lambda_module.lambda_handler(_gateway_event(), None)
    result = lambda_module.lambda_handler(_gateway_event(), None)
    body = json.loads(result["body"])

    assert body["count"] == 3


def test_response_has_cors_header(lambda_module):
    result = lambda_module.lambda_handler(_gateway_event(), None)

    assert result["headers"]["Access-Control-Allow-Origin"] == "*"


def test_options_request_is_acknowledged_without_incrementing(lambda_module):
    preflight = lambda_module.lambda_handler(_gateway_event("OPTIONS"), None)
    assert preflight["statusCode"] == 200

    result = lambda_module.lambda_handler(_gateway_event("GET"), None)
    body = json.loads(result["body"])
    assert body["count"] == 1  # OPTIONS call should not have incremented it
