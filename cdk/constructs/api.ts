import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export interface ApiProps {
  listResourcesFunction: lambda.IFunction;
  updateResourceFunction: lambda.IFunction;
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

        const controlPlane = this.apigateway.root.addResource('api');
        
        const projects = controlPlane.addResource('projects');
        const listResources = projects.addResource('list');
        
        const project = controlPlane.addResource('project');
        const createResource = project.addResource('create');

        const projectWithId = project.addResource('{id}');
        const updateResource = projectWithId.addResource('update');
        const deleteResource = projectWithId.addResource('delete');
        
        createResource.addMethod('POST', props.createResourceIntegration, {
        methodResponses: [
            { statusCode: '200' },
            { statusCode: '400' },
            { statusCode: '500' }
        ]
        });
        deleteResource.addMethod('DELETE', props.deleteResourceIntegration, {
        methodResponses: [
            { statusCode: '200' },
            { statusCode: '400' },
            { statusCode: '500' }
        ]
        });
        listResources.addMethod('GET', new apigateway.LambdaIntegration(props.listResourcesFunction));
        updateResource.addMethod('PUT', new apigateway.LambdaIntegration(props.updateResourceFunction));
    }
}

