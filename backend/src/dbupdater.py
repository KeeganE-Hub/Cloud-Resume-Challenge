# DBUpdater - handles the $connect and $disconnect events for the
# WebSocket API. This is step 6 of the real-time counter extension.
#
# $connect  -> save this visitor's connection ID, and bump the count
# $disconnect -> just remove their connection ID - the count itself
#                doesn't go down when someone leaves

import os
import time

import boto3

VISITOR_TABLE_NAME = os.environ.get("VISITOR_TABLE_NAME", "resume-visitor-count")
CONNECTIONS_TABLE_NAME = os.environ.get("CONNECTIONS_TABLE_NAME", "resume-connection-ids")
ITEM_ID = "visitor_count"

# how long a connection ID is allowed to sit in the table before
# DynamoDB automatically deletes it, in case $disconnect never
# actually fires for some reason (closed laptop lid, crashed tab,
# lost network - browsers don't always get a chance to say goodbye)
CONNECTION_TTL_SECONDS = 2 * 60 * 60  # 2 hours

dynamodb = boto3.resource("dynamodb")
visitor_table = dynamodb.Table(VISITOR_TABLE_NAME)
connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)


def lambda_handler(event, context):
    route_key = event["requestContext"]["routeKey"]
    connection_id = event["requestContext"]["connectionId"]

    if route_key == "$connect":
        return handle_connect(connection_id)

    if route_key == "$disconnect":
        return handle_disconnect(connection_id)

    # this function is only ever wired up to $connect and $disconnect,
    # so we shouldn't normally land here - but return something sane
    # instead of just blowing up if we ever do
    return {"statusCode": 200}


def handle_connect(connection_id):
    # remember this connection so DBStreamProcessor knows who to push
    # the updated count out to later
    connections_table.put_item(Item={
        "connectionId": connection_id,
        "ttl": int(time.time()) + CONNECTION_TTL_SECONDS,
    })

    # bump the count - this write is what triggers the DynamoDB Stream,
    # which is what actually causes the new number to get pushed out
    # (see dbstreamprocessor.py). Same atomic increment trick as
    # before: it adds 1 in a single step so two people connecting at
    # the same instant can't overwrite each other's update.
    visitor_table.update_item(
        Key={"id": ITEM_ID},
        UpdateExpression="SET #c = if_not_exists(#c, :start) + :inc",
        ExpressionAttributeNames={"#c": "count"},
        ExpressionAttributeValues={":start": 0, ":inc": 1},
    )

    return {"statusCode": 200}


def handle_disconnect(connection_id):
    # someone closing the page isn't "undoing" their visit, so this
    # only cleans up their connection ID - it never touches the count
    connections_table.delete_item(Key={"connectionId": connection_id})
    return {"statusCode": 200}
