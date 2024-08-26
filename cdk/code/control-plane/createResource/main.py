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
TEMPLATE_URL = get_env('TEMPLATE_URL')

cloudformation = boto3.client('cloudformation')
dynamodb = boto3.client('dynamodb')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def insert_resource_to_ddb(stack_id: str, message_id: str) -> Dict[str, Any]:
    try:
        response = dynamodb.put_item(
            TableName=TABLE_NAME,
            Item={
                'id': {'S': message_id},
                'stack_id': {'S': stack_id},
                'status': {'S': 'PROVISIONING'}
            }
        )
        logger.info(f"Inserted resource to DynamoDB: {response}")
        return response
    except ClientError as e:
        logger.error(f"Error inserting resource to DynamoDB: {e}")
        raise

def create_stack(template_url: str, resource_id: str, poll_schedule: str, poll_url: str, 
                 secrets_arn: str, role_arn: str, kinesis_stream_arn: str) -> Dict[str, Any]:
    try:
        response = cloudformation.create_stack(
            StackName=f'tenant-{resource_id}',
            TemplateURL=template_url,
            Parameters=[
                {'ParameterKey': 'TenantId', 'ParameterValue': resource_id},
                {'ParameterKey': 'PollSchedule', 'ParameterValue': poll_schedule},
                {'ParameterKey': 'DynamoDBTableName', 'ParameterValue': TABLE_NAME},
                {'ParameterKey': 'DynamoDBPrimaryKey', 'ParameterValue': resource_id},
                {'ParameterKey': 'TargetSystemURL', 'ParameterValue': poll_url},
                {'ParameterKey': 'SecretsManagerArn', 'ParameterValue': secrets_arn},
                {'ParameterKey': 'TenantAccountRoleArn', 'ParameterValue': role_arn},
                {'ParameterKey': 'StreamArn', 'ParameterValue': kinesis_stream_arn},
                {'ParameterKey': 'StreamPartitionKey', 'ParameterValue': '001'}
            ],
            Capabilities=['CAPABILITY_NAMED_IAM', 'CAPABILITY_IAM'],
            Tags=[{'Key': 'TenantId', 'Value': resource_id}]
        )
        logger.info(f"Created stack: {response}")
        return response
    except ClientError as e:
        logger.error(f"Error creating CloudFormation stack: {e}")
        raise

def process_sqs_message(event: Dict[str, Any]) -> Dict[str, Any]:
    request_body = event['Records'][0]['body']
    try:
        payload = json.loads(request_body)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in request body: {e}")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid request body'})
        }

    message_id = event['Records'][0]['messageId']
    poll_schedule = payload.get('PollSchedule')
    poll_url = payload.get('PollUrl')
    secrets_arn = payload.get('SecretArn')
    role_arn = payload.get('TenantAccountRoleArn')
    kinesis_stream_arn = payload.get('KinesisStreamArn')

    logger.info(f'Creating Stack with Properties - poll_schedule: {poll_schedule}, poll_url: {poll_url}, secrets_arn: {secrets_arn}')
    stack_id = create_stack(TEMPLATE_URL, message_id, poll_schedule, poll_url, secrets_arn, role_arn, kinesis_stream_arn)['StackId']
    logger.info(f'Created Stack with StackId: {stack_id}')

    response = insert_resource_to_ddb(stack_id, message_id)

    return {
        'statusCode': 200,
        'body': json.dumps(response)
    }

def lambda_handler(event, context):
    try:
        return process_sqs_message(event)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f"An unexpected error occurred: {str(e)}"})
        }