### CI/CD Process for Updating Data-Plane Stack

1. `AWS_REGION=eu-central-1 cdk --no-execute --parameters DynamoDBTableName=b --parameters DynamoDBPrimaryKey=c --parameters SecretsManagerArn=d --parameters TargetSystemURL=e --parameters TenantId=e --parameters PollSchedule=e deploy DataPlane`
2. `AWS_REGION=eu-central-1 cdk synth DataPlane > Stack.yaml`
3. Upload Stack file to S3 Bucket
4. Test Deployment
5. Share Stack File name with Control Plane