import json
import logging
import os
from typing import Dict, Any, Optional

import boto3
from botocore.exceptions import ClientError

def get_env(key: str) -> str:
    value = os.getenv(key)
    if value is None:
        raise ValueError(f"Environment variable {key} is not set")
    return value

TABLE_NAME = get_env('TABLE_NAME')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(TABLE_NAME)
cloudformation = boto3.client('cloudformation')
VALID_STATUS = ["CREATE_COMPLETE", "CREATE_FAILED", "UPDATE_COMPLETE", "UPDATE_FAILED"]

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Check if resource exists in DDB Table and that the Status is one of ["CREATE_COMPLETE", "CREATE_FAILED", "UPDATE_COMPLETE", "UPDATE_FAILED"]

def resource_exists_and_is_deployed(resource_id: str) -> Optional[str]:
    logger.info(f'Checking if resource: {resource_id} exists')
    try:
        response = table.get_item(Key={'id': resource_id})
    except ClientError as e:
        logger.error(f"Error getting item from DynamoDB: {e}")
        return None

    item = response.get('Item', {})
    stack_id = item.get('stack_id')
    stack_status = item.get('status')
    logger.info(f'Stack ID: {stack_id}, Stack Status: {stack_status}')
    
    if stack_status not in VALID_STATUS:
        logger.warning(f'Stack {stack_id} cant be deleted, stack status is {stack_status}')
        return None

    return stack_id

def delete_stack(stack_id: str) -> Dict[str, Any]:
    try:
        response = cloudformation.delete_stack(StackName=stack_id)
        logger.info(f'CloudFormation Delete Stack Response: {response}')
        return response
    except ClientError as e:
        logger.error(f"Error deleting CloudFormation stack: {e}")
        raise

def process_delete_project(event: Dict[str, Any]) -> Dict[str, Any]:
    resource_id = event['Records'][0]['messageAttributes'].get('projectId', {}).get('stringValue')
    if not resource_id:
        logger.error('Resource ID is empty')
        return {
            'statusCode': 400,
            'body': json.dumps('Resource ID is empty')
        }
    
    logger.info(f'Deleting resource: {resource_id}')

    stack_id = resource_exists_and_is_deployed(resource_id)
    if stack_id:
        logger.info(f'Deleting Stack: {stack_id}')
        response = delete_stack(stack_id)
        logger.info(f'Delete Stack response: {response}')
    else:
        response = f'Resource: {resource_id} does not exist or has already been deleted'
        logger.info(response)

    return {
        'statusCode': 200,
        'body': json.dumps(response)
    }

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    logger.info(f'Processing Delete Project Event: {event}')
    try:
        return process_delete_project(event)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"An error occurred: {str(e)}")
        }