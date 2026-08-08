# Tests for dbupdater.py.
#
# Run with: pytest backend/tests/test_dbupdater.py -v
# Requires: pip install pytest boto3 moto

import importlib
import os
import sys

import boto3
import pytest
from moto import mock_aws

VISITOR_TABLE_NAME = "resume-visitor-count-test"
CONNECTIONS_TABLE_NAME = "resume-connection-ids-test"

os.environ["VISITOR_TABLE_NAME"] = VISITOR_TABLE_NAME
os.environ["CONNECTIONS_TABLE_NAME"] = CONNECTIONS_TABLE_NAME
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


@pytest.fixture
def lambda_module():
    """Reloads dbupdater.py inside an active moto mock, same idea as
    the original test_app.py - so its boto3 Table resources get
    created against the mocked DynamoDB, not real AWS."""
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

        dynamodb.create_table(
            TableName=VISITOR_TABLE_NAME,
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        dynamodb.create_table(
            TableName=CONNECTIONS_TABLE_NAME,
            KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "connectionId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        if "dbupdater" in sys.modules:
            importlib.reload(sys.modules["dbupdater"])
        else:
            import dbupdater  # noqa: F401

        yield sys.modules["dbupdater"]


def _connect_event(connection_id="abc123"):
    return {"requestContext": {"routeKey": "$connect", "connectionId": connection_id}}


def _disconnect_event(connection_id="abc123"):
    return {"requestContext": {"routeKey": "$disconnect", "connectionId": connection_id}}


def test_connect_saves_the_connection_id(lambda_module):
    lambda_module.lambda_handler(_connect_event("abc123"), None)

    saved = lambda_module.connections_table.get_item(Key={"connectionId": "abc123"})
    assert "Item" in saved


def test_connect_increments_the_visitor_count(lambda_module):
    lambda_module.lambda_handler(_connect_event("conn-1"), None)
    lambda_module.lambda_handler(_connect_event("conn-2"), None)

    count_item = lambda_module.visitor_table.get_item(Key={"id": "visitor_count"})
    assert count_item["Item"]["count"] == 2


def test_disconnect_removes_the_connection_id(lambda_module):
    lambda_module.lambda_handler(_connect_event("abc123"), None)
    lambda_module.lambda_handler(_disconnect_event("abc123"), None)

    saved = lambda_module.connections_table.get_item(Key={"connectionId": "abc123"})
    assert "Item" not in saved


def test_disconnect_does_not_change_the_count(lambda_module):
    lambda_module.lambda_handler(_connect_event("abc123"), None)
    lambda_module.lambda_handler(_disconnect_event("abc123"), None)

    count_item = lambda_module.visitor_table.get_item(Key={"id": "visitor_count"})
    assert count_item["Item"]["count"] == 1  # still 1, not 0 - disconnect shouldn't undo it
