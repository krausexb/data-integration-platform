import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as scheduler from 'aws-cdk-lib/aws-scheduler'

export class DataPlane extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /*
    CloudFormation Parameters that are used to pass project information during project creation from code/control-plane/createResource
    */

    const TenantId = new cdk.CfnParameter(this, 'TenantId', {
      type: 'String',
      description: 'Provide the id of the tenant'
    });
  
    const PollSchedule = new cdk.CfnParameter(this, 'PollSchedule', {
      type: 'String',
      description: 'Provide the schedule for polling the target system'
    });

    const DynamoDBTableName = new cdk.CfnParameter(this, 'DynamoDBTableName', {
      type: 'String',
      description: 'Name of the DynamoDB Table'
    });

    const DynamoDBPrimaryKey = new cdk.CfnParameter(this, 'DynamoDBPrimaryKey', {
      type: 'String',
      description: 'Name of the DynamoDB Table Primary Key'
    });

    const SecretsManagerArn = new cdk.CfnParameter(this, 'SecretsManagerArn', {
      type: 'String',
      description: 'Secrets Manager Secret ARN in the customer Account'
    });

    const TargetSystemURL = new cdk.CfnParameter(this, 'TargetSystemURL', {
      type: 'String',
      description: 'Secrets Manager Secret ARN in the customer Account'
    });

    const TenantAccountRoleArn = new cdk.CfnParameter(this, 'TenantAccountRoleArn', {
      type: 'String',
      description: 'Tenant Account Role ARN'
    });
    
    const StreamArn = new cdk.CfnParameter(this, 'StreamArn', {
      type: 'String',
      description: 'ARN of the Kinesis Stream'
    });

    const StreamPartitionKey = new cdk.CfnParameter(this, 'StreamPartitionKey', {
      type: 'String',
      description: 'PartitionKey of the Kinesis Stream'
    });

    /*
    IAM Role scheduleExecutionRole is used to grant EventBridge Schedules permission to invoke the pollerHandler function
    */
  
    const scheduleExecutionRole = new iam.Role(this, 'ScheduleExectionRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });

    /*
    Lambda Function Execution role that allows the function to assume a cross-account role in the tenants account.
    */

    const SecretsManagerPolicy = new iam.Policy(this, 'SecretsManagerPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'sts:AssumeRole'
          ],
          resources: [
            TenantAccountRoleArn.valueAsString,
          ]
        })
      ]
    })


    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    lambdaExecutionRole.attachInlinePolicy(SecretsManagerPolicy)
    lambdaExecutionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    lambdaExecutionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"));

    /*
    Lambda function that polls the external API
    */
    const pollerHandler = new lambda.Function(this, 'pollerHandler', {
      functionName: 'tenant-' + TenantId.valueAsString + '-pollerHandler',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('code/data-plane/poller'),
      handler: 'main.lambda_handler',
      timeout: cdk.Duration.seconds(60),
      role: lambdaExecutionRole,
      environment: {
        'SCHEDULE_INTERVAL': PollSchedule.valueAsString,
        'SECRETS_MANAGER_SECRET': SecretsManagerArn.valueAsString,
        'DYNAMODB_TABLE_NAME': DynamoDBTableName.valueAsString,
        'DYNAMODB_PRIMARY_KEY': DynamoDBPrimaryKey.valueAsString,
        'TARGET_SYSTEM_URL': TargetSystemURL.valueAsString,
        'TENANT_ROLE_ARN': TenantAccountRoleArn.valueAsString,
        'STREAM_ARN': StreamArn.valueAsString,
        'STREAM_PARTITION_KEY': StreamPartitionKey.valueAsString
      }
    });

    /*
    Schedule that invokes the Lambda function for polling the external API
    */
    const lambdaScheduler = new scheduler.CfnSchedule(this, 'LambdaScheduler', {
      target: {
        arn: pollerHandler.functionArn,
        roleArn: scheduleExecutionRole.roleArn,
      },
      scheduleExpression: PollSchedule.valueAsString,
      flexibleTimeWindow: {
        mode: "OFF",
      }
    })

    pollerHandler.grantInvoke(scheduleExecutionRole)

    /*
    This output is provided to the customer. The Tenant needs to update its CloudFormation Stack to include this Role ARN.
    */
    new cdk.CfnOutput(this, 'ProjectConsumerRoleArn', {
      description: "The IAM Role ARN that the central platform uses to access your resources",
      value: lambdaExecutionRole.roleArn
    });

  }
}
