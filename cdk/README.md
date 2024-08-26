## Components

### lib/control-plane

Contains the control plane code, that is used to provision an API.
This API can be used by platform customers, to create new projects.

### lib/data-plane

Contains the data plane code/template, which gets deployed by the control plane.
During Deployment, this cdk code gets packaged and templated into an CloudFormation, which is later used by the control plane for the deployment of projects.

### templates/tenant-stack

Contains the tenant/platform customer resources, like the target ingestion resource, IAM Role and Secrets.
Customers first need to deploy this stack and then provide the CloudFormation Outputs as inputs for their control plane actions.

## Deployment 

The deployment of the data and control plane is facilitated through a Makefile.
To deploy the control plane, run: `make controlplane`
To deploy the data plane, run: `make dataplane`
