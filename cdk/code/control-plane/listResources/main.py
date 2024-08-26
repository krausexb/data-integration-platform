import json
import os
import logging
from typing import Tuple, Dict, Any, Optional

import boto3
from boto3.session import Session
from botocore.exceptions import BotoCoreError, ClientError

def get_env(key: str) -> str:
    value = os.getenv(key)
    if value is None:
        raise ValueError(f"Environment variable {key} is not set")
    return value

TABLE_NAME = get_env('TABLE_NAME')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(TABLE_NAME)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def get_resource():
    expression_attribute_names = {
        "#status": "status",
        "#platformrolearn": "platformrolearn"
    }
    expression_attribute_values = {
        ':status_value': 'CREATE_COMPLETE'
    }
    filter_expression = "attribute_exists(#status) AND #status = :status_value"

    try:
        response = table.scan(
            FilterExpression=filter_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
            ProjectionExpression='id, #status, #platformrolearn'
        )
        items = response.get('Items', [])
        logger.info(f"DynamoDB get items response: {items}")
        return items
    except ClientError as e: 
        logger.error(f"Error scanning DynamoDB table: {e}")
        raise

def lambda_handler(event, context):
    try:
        response = get_resource()
        return {
            'statusCode': 200,
            'body': json.dumps(response)
        }
    except Exception as e:
        logger.error(f"Error in lambda_handler: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }
