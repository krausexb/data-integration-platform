import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ApiSqsIntegrationProps {
  queueVisibilityTimeout: number;
  requestTemplate: {
        [contentType: string]: string;
    };
}

export class ApiSqsIntegration extends Construct {
    public readonly queue: sqs.Queue;
    public readonly role: iam.Role;
    public readonly integration: apigateway.AwsIntegration;

    constructor(scope: Construct, id: string, props: ApiSqsIntegrationProps) {
        super(scope, id);

        this.queue = new sqs.Queue(this, 'JobQueue', {
            visibilityTimeout: cdk.Duration.seconds(props.queueVisibilityTimeout)
        });

        const integrationRole = new iam.Role(this, 'integration-role', {
            assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        });

        this.queue.grantSendMessages(integrationRole);

        this.integration = new apigateway.AwsIntegration({
            service: 'sqs',
            path: `${process.env.CDK_DEFAULT_ACCOUNT}/${this.queue.queueName}`,
            integrationHttpMethod: 'POST',
            options: {
                credentialsRole: integrationRole,
                requestParameters: {
                    'integration.request.header.Content-Type': `'application/x-www-form-urlencoded'`,
                },
                requestTemplates: props.requestTemplate,
                integrationResponses: [
                    {
                        statusCode: '200',
                        responseTemplates: {
                            'application/json': `#set($inputRoot = $input.path('$'))
                                {
                                "JobId": "$inputRoot.SendMessageResponse.SendMessageResult.MessageId"
                                }`,
                        }
                    },
                    {
                        statusCode: '400',
                    },
                    {
                        statusCode: '500',
                    }
                ]
            }
        });
    }
}

