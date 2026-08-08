# DBStreamProcessor - triggered automatically whenever the DynamoDB
# Stream on VisitorCountTable sees a write (which happens every time
# DBUpdater bumps the count on a new $connect). This is step 8-9 of
# the real-time counter extension.
#
# All it does: figure out the new count from the stream event, then
# push it out to every currently-open WebSocket connection.

import json
import os

import boto3
from botocore.exceptions import ClientError

CONNECTIONS_TABLE_NAME = os.environ.get("CONNECTIONS_TABLE_NAME", "resume-connection-ids")

# set by template.yaml - something like:
# https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
WEBSOCKET_ENDPOINT = os.environ["WEBSOCKET_ENDPOINT"]

dynamodb = boto3.resource("dynamodb")
connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)

# this is a different kind of boto3 client than usual - "apigatewaymanagementapi"
# is specifically for sending a message down an already-open websocket
# connection, not for managing the API Gateway resource itself
apigw_management = boto3.client("apigatewaymanagementapi", endpoint_url=WEBSOCKET_ENDPOINT)


def lambda_handler(event, context):
    new_count = extract_new_count(event)

    if new_count is None:
        # nothing relevant actually changed in this batch (could be a
        # delete, or a write that didn't touch the count field) -
        # nothing to push out
        return {"statusCode": 200}

    message = json.dumps({"count": new_count}).encode("utf-8")

    for connection_id in get_all_connection_ids():
        send_to_connection(connection_id, message)

    return {"statusCode": 200}


def extract_new_count(event):
    """Pulls the new count value out of a DynamoDB Stream event.

    DynamoDB Stream events represent numbers as {"N": "123"} (a string
    inside a dict, not a plain number) - that's just the stream's
    wire format, same idea as how DynamoDB normally represents typed
    attributes.
    """
    for record in event.get("Records", []):
        if record["eventName"] not in ("INSERT", "MODIFY"):
            continue
        new_image = record["dynamodb"].get("NewImage", {})
        if "count" in new_image:
            return int(new_image["count"]["N"])
    return None


def get_all_connection_ids():
    # a full table Scan is fine here - this table only ever holds
    # however many people currently have the resume page open, which
    # realistically is a handful at most, not something that needs a
    # fancier query
    response = connections_table.scan(ProjectionExpression="connectionId")
    return [item["connectionId"] for item in response.get("Items", [])]


def send_to_connection(connection_id, message):
    try:
        apigw_management.post_to_connection(ConnectionId=connection_id, Data=message)
    except ClientError as exc:
        # GoneException means that visitor isn't actually connected
        # anymore (closed the tab, lost network, etc.) but their
        # $disconnect event never made it to DBUpdater - clean up
        # the stale row instead of leaving it there
        if exc.response["Error"]["Code"] == "GoneException":
            connections_table.delete_item(Key={"connectionId": connection_id})
        else:
            print(f"Couldn't send to connection {connection_id}: {exc}")
