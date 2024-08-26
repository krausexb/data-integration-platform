import json
import os
import logging
from typing import Tuple, Dict, Any

import boto3
from boto3.session import Session
from botocore.exceptions import BotoCoreError, ClientError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def get_env(key: str) -> str:
    value = os.getenv(key)
    if value is None:
        raise ValueError(f"Environment variable {key} is not set")
    return value

def create_clients(role_session_name: str) -> Tuple[boto3.client, boto3.client]:
    try:
        client = boto3.client('sts')
        current_identity = client.get_caller_identity()
        logger.info(f"Current identity: {current_identity}")

        tenant_role_arn = get_env("TENANT_ROLE_ARN")
        response = client.assume_role(RoleArn=tenant_role_arn, RoleSessionName=role_session_name)
        
        tenant_session = Session(
            aws_access_key_id=response['Credentials']['AccessKeyId'],
            aws_secret_access_key=response['Credentials']['SecretAccessKey'],
            aws_session_token=response['Credentials']['SessionToken']
        )

        tenant_client = tenant_session.client('sts')
        tenant_identity = tenant_client.get_caller_identity()
        logger.info(f"Tenant identity: {tenant_identity}")

        secrets_manager_client = tenant_session.client('secretsmanager')
        kinesis_client = tenant_session.client('kinesis')

        return secrets_manager_client, kinesis_client
    except (BotoCoreError, ClientError) as e:
        logger.error(f"Error creating clients: {str(e)}")
        raise

def call_target_system(secret_value: Dict[str, Any]) -> str:
    target_url = get_env("TARGET_SYSTEM_URL")

    logger.info(f"Calling endpoint {target_url} with Secret: {secret_value}")
    # TODO: Implement actual API call here

    payload = {"temperature": 22.00, "tag": "Site/1/Line/2/Foo/Bar"}
    return json.dumps(payload)

def put_record(kinesis_client: boto3.client, stream_arn: str, partition_key: str, payload: str) -> Dict[str, Any]:
    try:
        response = kinesis_client.put_record(
            StreamARN=stream_arn,
            Data=payload,
            PartitionKey=partition_key
        )
        return response
    except (BotoCoreError, ClientError) as e:
        logger.error(f"Error putting record to Kinesis: {str(e)}")
        raise


def lambda_handler(event, context):
    try:
        secrets_manager_client, kinesis_client = create_clients(context.aws_request_id)

        secret_arn = get_env("SECRETS_MANAGER_SECRET")
        secret_value = secrets_manager_client.get_secret_value(
            SecretId=secret_arn
        )

        stream_arn=get_env("STREAM_ARN")
        partition_key=get_env("STREAM_PARTITION_KEY")
        payload = call_target_system(secret_value)
        response = put_record(kinesis_client, stream_arn, partition_key, payload)

        logger.info(f"Kinesis put_record response: {response}")

        return {
            'statusCode': 200,
            'body': json.dumps(response)
        }
    except Exception as e:
        logger.error(f"Error in lambda_handler: {str(e)}")

        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }