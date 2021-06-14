import { App } from '@aws-cdk/core';
import { MqttBridgeStack } from './MqttBridgeStack';

const app = new App()
new MqttBridgeStack(app);
app.synth();
