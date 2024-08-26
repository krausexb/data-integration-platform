#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/control-plane/control-plane-stack';
import { DataPlane } from '../lib/data-plane/data-plane-stack';


const app = new cdk.App();
new CdkStack(app, 'CdkStack', {
    cloudwatchLogRetentionDays: 14
});

new DataPlane(app, 'DataPlane', {
    cloudwatchLogRetentionDays: 14
});