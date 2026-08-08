# Lambda function for the resume site's visitor counter - REST version.
#
# All this does is bump a number in DynamoDB by 1 and send back the
# new total as JSON. The DynamoDB table just has one row that looks
# like: { "id": "visitor_count", "count": 42 }
#
# NOTE: this is the original REST-based counter from Part 3. It's
# being kept alongside the newer WebSocket version (Part 8) on
# purpose, so the live site keeps working while the WebSocket setup
# is still in progress. Once that's fully tested and working, this
# file - and the VisitorCountFunction/VisitorCountApi resources in
# template.yaml - can be deleted as a cleanup step.

import json
import os
import boto3

TABLE_NAME = os.environ.get("TABLE_NAME", "resume-visitor-count")
ITEM_ID = "visitor_count"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
}


def lambda_handler(event, context):
    method = event.get("httpMethod", "GET")

    # Browsers send an OPTIONS request first to check if they're allowed
    # to make the real GET request (this is just how CORS works). We
    # don't need to do anything, just say "yeah go ahead."
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        # update_item with this expression is the "atomic increment" trick -
        # it adds 1 to whatever the count currently is, in a single step,
        # so two people loading the page at the same time can't overwrite
        # each other's update
        response = table.update_item(
            Key={"id": ITEM_ID},
            UpdateExpression="SET #c = if_not_exists(#c, :start) + :inc",
            ExpressionAttributeNames={"#c": "count"},
            ExpressionAttributeValues={":start": 0, ":inc": 1},
            ReturnValues="UPDATED_NEW",
        )
        new_count = int(response["Attributes"]["count"])

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"count": new_count}),
        }

    except Exception as exc:
        # something went wrong talking to DynamoDB - log it so it shows
        # up in CloudWatch, and send back a generic error instead of
        # crashing
        print(f"Error updating visitor count: {exc}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Could not update visitor count"}),
        }
