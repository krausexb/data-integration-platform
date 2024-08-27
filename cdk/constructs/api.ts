import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export interface ApiProps {
  listResourcesFunction: lambda.IFunction;
  updateResourceFunction: lambda.IFunction;
  swaggerUIFunction: lambda.IFunction;
  createResourceIntegration: apigateway.AwsIntegration;
  deleteResourceIntegration: apigateway.AwsIntegration;
}

export class Api extends Construct {

    public readonly apigateway: apigateway.RestApi;

    constructor(scope: Construct, id: string, props: ApiProps) {
        super(scope, id);

        this.apigateway = new apigateway.RestApi(this, 'ControlPlaneApi', {
        restApiName: 'Control Plane Service',
        description: 'This service handles CRUD operations for resources.'
        });

        const docs = this.apigateway.root.addResource('docs');
        docs.addMethod('GET', new apigateway.LambdaIntegration(props.swaggerUIFunction))
        docs.addProxy({
            anyMethod: true,
            defaultIntegration: new apigateway.LambdaIntegration(props.swaggerUIFunction)
        })

        const controlPlane = this.apigateway.root.addResource('api');
        
        const projects = controlPlane.addResource('projects');
        const listResources = projects.addResource('list');
        
        const project = controlPlane.addResource('project');
        const createResource = project.addResource('create');

        const projectWithId = project.addResource('{id}');
        const updateResource = projectWithId.addResource('update');
        const deleteResource = projectWithId.addResource('delete');
        
        const createProjectRequestModel = new apigateway.Model(this, 'createProjectRequestModel', {
            restApi: this.apigateway,
            contentType: 'application/json',
            description: 'Validate if all required inputs are provided by the requestor',
            modelName: 'createProjectRequestModel',
            schema : {
                type: apigateway.JsonSchemaType.OBJECT,
                required: ["PollSchedule", "PollUrl", "SecretArn", "TenantAccountRoleArn", "KinesisStreamArn"],
                properties: {
                    PollSchedule: { type: apigateway.JsonSchemaType.STRING },
                    PollUrl: { type: apigateway.JsonSchemaType.STRING },
                    SecretArn: { type: apigateway.JsonSchemaType.STRING },
                    TenantAccountRoleArn: { type: apigateway.JsonSchemaType.STRING },
                    KinesisStreamArn: { type: apigateway.JsonSchemaType.STRING }
                }
            }
        })

        createResource.addMethod('POST', props.createResourceIntegration, {
        methodResponses: [
            { statusCode: '200' },
            { statusCode: '400' },
            { statusCode: '500' }
        ],
        requestValidator: new apigateway.RequestValidator(this, 'createResourceRequestValidator', {
            restApi: this.apigateway,
            validateRequestParameters: false,
            validateRequestBody: true,
        }),
        requestModels: {
            "application/json": createProjectRequestModel,
        }
        });
        deleteResource.addMethod('DELETE', props.deleteResourceIntegration, {
        methodResponses: [
            { statusCode: '200' },
            { statusCode: '400' },
            { statusCode: '500' }
        ],
        requestParameters: {
            'method.request.path.id': true
        },
        requestValidator: new apigateway.RequestValidator(this, 'deleteResourceRequestValidator', {
            restApi: this.apigateway,
            validateRequestParameters: true,
            validateRequestBody: false
        }),
        });
        listResources.addMethod('GET', new apigateway.LambdaIntegration(props.listResourcesFunction), {
        methodResponses: [
            { statusCode: '200' },
            { statusCode: '400' },
            { statusCode: '500' }
        ],
        });
        updateResource.addMethod('PUT', new apigateway.LambdaIntegration(props.updateResourceFunction), {
        methodResponses: [
            { statusCode: '200' },
            { statusCode: '400' },
            { statusCode: '500' }
        ],
        requestParameters: {
            'method.request.path.id': true
        },
        requestValidator: new apigateway.RequestValidator(this, 'updateResourceRequestValidator', {
            restApi: this.apigateway,
            validateRequestParameters: true,
            validateRequestBody: false
        }),
        });
    }
}
