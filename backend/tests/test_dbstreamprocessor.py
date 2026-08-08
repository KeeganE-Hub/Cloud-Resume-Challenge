# Tests for dbstreamprocessor.py.
#
# Run with: pytest backend/tests/test_dbstreamprocessor.py -v
# Requires: pip install pytest boto3 moto
#
# Note on approach: moto (the AWS-mocking library used elsewhere in
# this project) doesn't have solid support for mocking the
# "apigatewaymanagementapi" post_to_connection call - that's a pretty
# niche corner of AWS. So instead of relying on moto for that part,
# these tests just swap the module's real apigw_management client out
# for a plain unittest.mock object and check what it was called with.
# DynamoDB parts still use moto like normal, since that's well
# supported.

import importlib
import os
import sys
from unittest.mock import MagicMock

import boto3
import pytest
from botocore.exceptions import ClientError
from moto import mock_aws

CONNECTIONS_TABLE_NAME = "resume-connection-ids-test"

os.environ["CONNECTIONS_TABLE_NAME"] = CONNECTIONS_TABLE_NAME
os.environ["WEBSOCKET_ENDPOINT"] = "https://fake-id.execute-api.us-east-1.amazonaws.com/prod"
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


@pytest.fixture
def lambda_module():
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName=CONNECTIONS_TABLE_NAME,
            KeySchema=[{"AttributeName": "connectionId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "connectionId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        if "dbstreamprocessor" in sys.modules:
            importlib.reload(sys.modules["dbstreamprocessor"])
        else:
            import dbstreamprocessor  # noqa: F401

        module = sys.modules["dbstreamprocessor"]

        # swap the real API Gateway client out for a fake one we can
        # inspect, instead of letting it try to make a real network call
        module.apigw_management = MagicMock()

        yield module


def _stream_event(event_name="MODIFY", count=None):
    new_image = {}
    if count is not None:
        new_image["count"] = {"N": str(count)}

    return {
        "Records": [
            {
                "eventName": event_name,
                "dynamodb": {"NewImage": new_image},
            }
        ]
    }


def test_extract_new_count_reads_the_count_field(lambda_module):
    event = _stream_event(count=5)
    assert lambda_module.extract_new_count(event) == 5


def test_extract_new_count_ignores_deletes(lambda_module):
    # a DELETE record has no NewImage at all, since the item is gone
    event = {"Records": [{"eventName": "REMOVE", "dynamodb": {}}]}
    assert lambda_module.extract_new_count(event) is None


def test_extract_new_count_handles_missing_count_field(lambda_module):
    event = _stream_event(count=None)
    assert lambda_module.extract_new_count(event) is None


def test_pushes_the_new_count_to_every_open_connection(lambda_module):
    lambda_module.connections_table.put_item(Item={"connectionId": "conn-1"})
    lambda_module.connections_table.put_item(Item={"connectionId": "conn-2"})

    lambda_module.lambda_handler(_stream_event(count=7), None)

    assert lambda_module.apigw_management.post_to_connection.call_count == 2


def test_no_connections_means_nothing_gets_sent(lambda_module):
    lambda_module.lambda_handler(_stream_event(count=3), None)

    lambda_module.apigw_management.post_to_connection.assert_not_called()


def test_gone_connection_gets_cleaned_up(lambda_module):
    lambda_module.connections_table.put_item(Item={"connectionId": "stale-conn"})

    # simulate what AWS raises when a connection is no longer open
    gone_error = ClientError(
        error_response={"Error": {"Code": "GoneException", "Message": "Gone"}},
        operation_name="PostToConnection",
    )
    lambda_module.apigw_management.post_to_connection.side_effect = gone_error

    lambda_module.lambda_handler(_stream_event(count=1), None)

    saved = lambda_module.connections_table.get_item(Key={"connectionId": "stale-conn"})
    assert "Item" not in saved
