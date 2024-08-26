dataplane:
	@if [ -z "$(PROJECT_AWS_ACCOUNT_ID)" ]; then \
		echo "WARNING: PROJECT_AWS_ACCOUNT_ID is not set. Export the ACCOUNT_ID where you want to deploy the platform"; \
	else \
		echo "PROJECT_AWS_ACCOUNT_ID is set to: $(PROJECT_AWS_ACCOUNT_ID)"; \
		echo "Deploying Dataplane Stack"; \
		AWS_REGION=eu-central-1 cdk --no-execute --parameters StreamArn=b --parameters StreamPartitionKey=b --parameters TenantAccountRoleArn=b --parameters SecretsManagerArn=b --parameters DynamoDBTableName=b --parameters DynamoDBPrimaryKey=c --parameters TargetSystemURL=e --parameters TenantId=e --parameters PollSchedule=e deploy DataPlane; \
		AWS_REGION=eu-central-1 cdk synth DataPlane > Stack.yaml; \
		AWS_REGION=eu-central-1 aws s3 cp ./Stack.yaml s3://cloudformation-templates-${PROJECT_AWS_ACCOUNT_ID}/template.yaml; \
	fi

controlplane:
	@if [ -z "$(PROJECT_AWS_ACCOUNT_ID)" ]; then \
		echo "WARNING: PROJECT_AWS_ACCOUNT_ID is not set. Export the ACCOUNT_ID where you want to deploy the platform"; \
	else \
		echo "PROJECT_AWS_ACCOUNT_ID is set to: $(PROJECT_AWS_ACCOUNT_ID)"; \
		echo "Deploying Controlplane Stack"; \
		AWS_REGION=eu-central-1 cdk deploy CdkStack; \
	fi