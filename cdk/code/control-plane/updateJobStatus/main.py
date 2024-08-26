import json
import os
import logging
from typing import Tuple, Dict, Any, Optional

import boto3
from boto3.session import Session
from botocore.exceptions import BotoCoreError, ClientError

TABLE_NAME = os.environ['TABLE_NAME']
action_list = ['CREATE_COMPLETE', 'CREATE_FAILED', 'UPDATE_COMPLETE', 'UPDATE_FAILED', 'DELETE_COMPLETE', 'DELETE_FAILED']

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(TABLE_NAME)
cloudformation = boto3.client('cloudformation')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def get_env(key: str) -> str:
    value = os.getenv(key)
    if value is None:
        raise ValueError(f"Environment variable {key} is not set")
    return value

def get_tenant_id(stack: Dict[str, Any]) -> Optional[str]:
    for tag in stack['Tags']:
        if tag['Key'] == 'TenantId':
            return tag['Value']
    return None

def get_project_consumer_role_arn(stack: Dict[str, Any]) -> str:
    if 'Outputs' in stack:
        for output in stack['Outputs']:
            if output['OutputKey'] == 'ProjectConsumerRoleArn':
                return output['OutputValue']
    return "NOT_PROVISIONED"

def update_dynamodb_item(tenant_id: str, cf_action: str, project_consumer_role_arn: str) -> Dict[str, Any]:
    try:
        response = table.update_item(
            Key={'id': tenant_id},
            UpdateExpression="set #attr = :val, #attr2 = :val2",
            ExpressionAttributeNames={
                "#attr": "status",
                "#attr2": "platformrolearn"
            },
            ExpressionAttributeValues={
                ":val": cf_action,
                ":val2": project_consumer_role_arn
            }
        )
        return response
    except ClientError as e:
        logger.error(f"Error updating DynamoDB item: {e}")
        raise

def event_handler(event: Dict[str, Any]) -> Dict[str, Any]:
    cf_action = event['detail']['status-details']['status']
    cf_stack_id = event['detail']['stack-id']

    if 'tenant' not in cf_stack_id:
        logger.info("Skipping... Not a managed tenant stack")
        return {"message": "Skipping... Not a managed tenant stack"}
    
    logger.info(f'Cloudformation Action: {cf_action} for Cloudformation Stack: {cf_stack_id}')

    try:
        stack = cloudformation.describe_stacks(
            StackName=cf_stack_id,
            NextToken="1"
        )['Stacks'][0]
    except ClientError as e:
        logger.error(f"Error describing stack: {e}")
        raise

    tenant_id = get_tenant_id(stack)
    if not tenant_id:
        logger.error(f"No TenantId found for stack: {cf_stack_id}")
        return {"error": "No TenantId found"}
    
    logger.info(f'Tenant ID: {tenant_id}')

    project_consumer_role_arn = get_project_consumer_role_arn(stack)
    logger.info(f'ProjectConsumerRoleArn: {project_consumer_role_arn}')
    logger.info(f"Full stack details: {stack}")
    
    response = update_dynamodb_item(tenant_id, cf_action, project_consumer_role_arn)
    logger.info(f"DynamoDB update item response: {response}")
    return response

def lambda_handler(event, context):
    try:
        response = event_handler(event)
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
