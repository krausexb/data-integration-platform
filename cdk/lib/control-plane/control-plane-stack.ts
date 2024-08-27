import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventtargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ApiSqsIntegration } from '../../constructs/api-sqs-integration';
import { Api } from '../../constructs/api';

export interface ControlPlaneProps {
  cloudwatchLogRetentionDays: number;
}

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ControlPlaneProps) {
    super(scope, id);

    /* 
    Main DynamoDB Table storing Project Data. TODO: Currently the table schema does not support pooled tenant separation
    */
    const resourceTable = new dynamodb.Table(this, 'ResourceTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
    });
  
    /* 
    Async API Gateway to SQS Pattern to implement storage first pattern and process events safely with Lambda.
    */ 
    const createProjectApiIntegration = new ApiSqsIntegration(this, 'api-sqs-integration-create-resource', {
      queueVisibilityTimeout: 600,
      requestTemplate: {
        'application/json': 'Action=SendMessage&MessageBody=$input.body'
      },
    })

    /* 
    Async API Gateway to SQS Pattern to implement storage first pattern and process events safely with Lambda.
    Request template does include request attribute in SQS message.
    */ 
    const deleteProjectApiIntegration = new ApiSqsIntegration(this, 'api-sqs-integration-delete-resource', {
      queueVisibilityTimeout: 600,
      requestTemplate: {
        'application/json': 'Action=SendMessage&MessageBody=$input.body&MessageAttribute.1.Name=projectId&MessageAttribute.1.Value.StringValue=$method.request.path.id&MessageAttribute.1.Value.DataType=String'
      },
    })
   
    /* 
    This Bucket is used to host the CloudFormation Templates for the data Plane. Control plane does access templates from this bucket for infrastructure deployment.
    */ 
    const templateBucket = new s3.Bucket(this, 'templateBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      bucketName: 'cloudformation-templates-' + this.account
    })

    /* 
    Handler responsible for creating new projects. TODO: Implement principle of least privilege for IAM Permissions.
    */ 
    const createResourceHandler = new lambda.Function(this, 'createResourceHandler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('code/control-plane/createResource'),
      handler: 'main.lambda_handler',
      logRetention: props.cloudwatchLogRetentionDays,
      environment: {
        'TEMPLATE_URL': 'https://' + 'cloudformation-templates-' + this.account + '.s3.eu-central-1.amazonaws.com/template.yaml',
        'TABLE_NAME': resourceTable.tableName
      }
    });
    createResourceHandler.addEventSource(new eventsources.SqsEventSource(createProjectApiIntegration.queue));
    resourceTable.grantReadWriteData(createResourceHandler);
    templateBucket.grantRead(createResourceHandler);
    createResourceHandler.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    /* 
    Function is responsible for handling CloudFormation Status Events. Main use case is to update DynamoDB Table when a stack provisioning succeeded.
    */ 
    const updateJobStatus = new lambda.Function(this, 'updateJobStatus', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('code/control-plane/updateJobStatus'),
      handler: 'main.lambda_handler',
      logRetention: props.cloudwatchLogRetentionDays,
      environment: {
        'TABLE_NAME': resourceTable.tableName
      }
    });
    resourceTable.grantReadWriteData(updateJobStatus);
    updateJobStatus.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'));

    const updateJobStatusRule = new events.Rule(this, 'updateJobStatusRule', {
      eventPattern: {
        source: ['aws.cloudformation'],
        detailType: ['CloudFormation Stack Status Change'],
        detail: {
          'status-details': {
            status: ['CREATE_COMPLETE', 'CREATE_FAILED', 'UPDATE_COMPLETE', 'UPDATE_FAILED', 'DELETE_COMPLETE', 'DELETE_FAILED']
          }
        }
      }
    });

    updateJobStatusRule.addTarget(new eventtargets.LambdaFunction(updateJobStatus, {
      retryAttempts: 10,
    }))

    /* 
    Function is responsible for returning all projects. Currently filters after table scan. TODO: Refactor to Query to effectively not scan all items. Makes sense since deleted project amount grows over time.
    */ 
    const listResourcesHandler = new lambda.Function(this, 'listResourcesHandler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('code/control-plane/listResources'),
      handler: 'main.lambda_handler',
      logRetention: props.cloudwatchLogRetentionDays,
      environment: {
        'TABLE_NAME': resourceTable.tableName
      }
    });
    resourceTable.grantReadData(listResourcesHandler);

    /* 
    Not implemented yet. TODO: Implement update action
    */ 
    const updateResourceHandler = new lambda.Function(this, 'updateResourceHandler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('code/control-plane/updateResource'),
      logRetention: props.cloudwatchLogRetentionDays,
      handler: 'main.lambda_handler'
    });

    /* 
    Function responsible for deleting projects.
    */ 
    const deleteResourceHandler = new lambda.Function(this, 'deleteResourceHandler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('code/control-plane/deleteResource'),
      handler: 'main.lambda_handler',
      logRetention: props.cloudwatchLogRetentionDays,
      environment: {
        'TABLE_NAME': resourceTable.tableName
      }
    });
    deleteResourceHandler.addEventSource(new eventsources.SqsEventSource(deleteProjectApiIntegration.queue));
    deleteResourceHandler.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
    resourceTable.grantReadWriteData(deleteResourceHandler);

    const swaggerUI = new lambdaNodejs.NodejsFunction(this, 'swaggerUI', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'code/docs/app.js',
      timeout: cdk.Duration.seconds(30),
      bundling: {
        // nodeModules: [
        //   'swagger-ui-express',
        //   'express'
        // ],
      },
    });

    // const swaggerUI = new lambda.Function(this, 'swaggerUI', {
    //   runtime: lambda.Runtime.NODEJS_20_X,
    //   timeout: cdk.Duration.seconds(30),
    //   logRetention: props.cloudwatchLogRetentionDays,
    //   handler: 'app.handler',
    //   code: lambda.Code.fromAsset('code/docs/', {
    //     bundling: {
    //       image: lambda.Runtime.NODEJS_20_X.bundlingImage,
    //       command: [
    //         'bash', '-c',
    //         'npm install && npm run build && cp -r node_modules dist/ && cp package.json dist/'
    //       ]
    //     }
    //   })
    //   //code: lambda.Code.fromAsset('code/docs/')
    // });
    swaggerUI.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    /* 
    Construct that provisions an API Gateway and sets up routes for the different handlers.
    */ 
    const api = new Api(this, 'api', {
      listResourcesFunction: listResourcesHandler,
      createResourceIntegration: createProjectApiIntegration.integration,
      deleteResourceIntegration: deleteProjectApiIntegration.integration,
      updateResourceFunction: updateResourceHandler,
      swaggerUIFunction: swaggerUI
    });
  }
}
