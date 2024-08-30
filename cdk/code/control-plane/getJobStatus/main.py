import json
import logging
import os
from typing import Tuple, Dict, Any, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ['TABLE_NAME']

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(TABLE_NAME)

def get_dynamodb_item(tenant_id: str) -> Dict[str, Any]:
    try:
        logging.info(f'Getting object from DynamoDB, Key: {tenant_id}')
        response = table.get_item(
            Key={'id': tenant_id},
            AttributesToGet=["status"]
        )
        return response
    except ClientError as e:
        logger.error(f"Error getting DynamoDB item: {e}")
        raise

def get_job_id(event):
    job_id = event['pathParameters'].get('id', '')
    logger.info(f'Get Status for Job ID {job_id}')

    if not job_id:
        logger.error('job_id ID is empty')
        return {
            'statusCode': 400,
            'body': json.dumps('Resource ID is empty')
        }
    
    return job_id

def lambda_handler(event, context):
    try:
        job_id = get_job_id(event)
        item = get_dynamodb_item(job_id)
        response = item['Item']
        return {
            'statusCode': 200,
            'body': json.dumps(response)
        }
    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }
