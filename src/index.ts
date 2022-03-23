import { App } from 'aws-cdk-lib/core';
import { MqttBridgeStack } from './MqttBridgeStack';

function main() {
    const app = new App()
    const stack = new MqttBridgeStack(app);
}

main()
