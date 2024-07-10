import {App, Duration, Stack} from 'aws-cdk-lib';
import {Cluster, ContainerImage, FargateService, FargateTaskDefinition, LogDriver, Secret} from 'aws-cdk-lib/aws-ecs'
import {InstanceClass, InstanceSize, InstanceType, NatProvider, Vpc} from "aws-cdk-lib/aws-ec2"
import {StringParameter} from "aws-cdk-lib/aws-ssm"
import ajv = require("ajv");

const Ajv = new ajv.default();

interface Config {
    mqttEndpoint: string;
    mqttTopicPrefix: string;
    accountDeviceClientId: string;
    accountDeviceCertSSMParam: string;
    accountDeviceKeySSMParam: string;
    iotCertSSMParam: string;
    iotKeySSMParam: string;
    nrfcloudMqttEndpoint: string;
}

export class MqttBridgeStack extends Stack {
    constructor(parent: App) {
        super(parent, MqttBridgeStack.getStackName());

        const config = this.getConfig();

        const accountDeviceClientCertSSMParam = StringParameter.fromStringParameterName(this, "AccountDeviceClientCertSSMParamValue", config.accountDeviceCertSSMParam)
        const accountDeviceClientKeySSMParam = StringParameter.fromStringParameterName(this, "AccountDeviceClientKeySSMParamValue", config.accountDeviceKeySSMParam)

        const iotKeySSMParam = StringParameter.fromStringParameterName(this, "IotKeySSMParamValue", config.iotKeySSMParam);
        const iotCertSSMParam = StringParameter.fromStringParameterName(this, "IotCertSSMParamValue", config.iotCertSSMParam)

        const cluster = new Cluster(this, 'MqttBridgeCluster', {
            enableFargateCapacityProviders: true,
            vpc: new Vpc(this, 'MqttBridgeVpc', {
                maxAzs: 1,
                natGatewayProvider: NatProvider.instanceV2({
                    instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO)
                })
            })
        })

        const taskDef = new FargateTaskDefinition(this, 'MqttBridgeTask', {
            memoryLimitMiB: 1024,
            cpu: 512
        })
        taskDef.addContainer('MqttBridgeContainer', {
            image: ContainerImage.fromRegistry("public.ecr.aws/q9u9d6w7/nrfcloud-bridge:latest"),
            memoryLimitMiB: 1024,
            logging: LogDriver.awsLogs({
                streamPrefix: "nrfcloud-bridge"
            }),
            secrets: {
                NRFCLOUD_CLIENT_CERT: Secret.fromSsmParameter(accountDeviceClientCertSSMParam),
                NRFCLOUD_CLIENT_KEY: Secret.fromSsmParameter(accountDeviceClientKeySSMParam),
                IOT_CERT: Secret.fromSsmParameter(iotCertSSMParam),
                IOT_KEY: Secret.fromSsmParameter(iotKeySSMParam)
            },
            environment: {
                NRFCLOUD_CA: "-----BEGIN CERTIFICATE-----\n" +
                    "MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\n" +
                    "ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\n" +
                    "b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\n" +
                    "MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\n" +
                    "b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\n" +
                    "ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n" +
                    "9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\n" +
                    "IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\n" +
                    "VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n" +
                    "93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\n" +
                    "jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\n" +
                    "AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\n" +
                    "A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\n" +
                    "U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\n" +
                    "N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\n" +
                    "o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n" +
                    "5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\n" +
                    "rqXRfboQnoZsG4q5WTP468SQvvG5\n" +
                    "-----END CERTIFICATE-----",
                // TODO: protect these better somehow
                MOSQUITTO_CONFIG: `
connection nrfcloud-bridge
address ${config.nrfcloudMqttEndpoint}:8883
local_clientid nrfcloud-bridge-local
remote_clientid ${config.accountDeviceClientId}
bridge_protocol_version mqttv311
bridge_cafile /mosquitto/config/nrfcloud_ca.crt
bridge_certfile /mosquitto/config/nrfcloud_client_cert.crt
bridge_keyfile /mosquitto/config/nrfcloud_client_key.key
bridge_insecure false
cleansession true
start_type automatic
notifications false

topic m/# in 1 data/ ${config.mqttTopicPrefix}

connection iot-bridge
address ${config.mqttEndpoint}:8883
bridge_cafile /mosquitto/config/nrfcloud_ca.crt
bridge_certfile /mosquitto/config/iot_cert.crt
bridge_keyfile /mosquitto/config/iot_key.key
bridge_insecure false
cleansession true
start_type automatic
notifications false

topic # out 1
`
            }
        })

        const service = new FargateService(this, 'MqttBridgeService', {
            cluster,
            taskDefinition: taskDef,
            assignPublicIp: false,
            desiredCount: 1,
        })
    }

    private getConfig(): Config {
        const config: Config = {
            accountDeviceCertSSMParam: this.node.tryGetContext("accountDeviceCertSSMParam"),
            accountDeviceClientId: this.node.tryGetContext("accountDeviceClientId"),
            mqttEndpoint: this.node.tryGetContext("mqttEndpoint"),
            accountDeviceKeySSMParam: this.node.tryGetContext("accountDeviceKeySSMParam"),
            mqttTopicPrefix: this.node.tryGetContext("mqttTopicPrefix"),
            nrfcloudMqttEndpoint: this.node.tryGetContext("nrfcloudMqttEndpoint"),
            iotCertSSMParam: this.node.tryGetContext("iotCertSSMParam"),
            iotKeySSMParam: this.node.tryGetContext("iotKeySSMParam")
        }

        const valid = Ajv.validate({
            type: "object",
            properties: {
                accountDeviceCertSSMParam: {
                    type: "string"
                },
                accountDeviceClientId: {
                    type: "string"
                },
                mqttEndpoint: {
                    type: "string"
                },
                accountDeviceKeySSMParam: {
                    type: "string"
                },
                mqttTopicPrefix: {
                    type: "string"
                },
                nrfcloudMqttEndpoint: {
                    type: "string"
                },
                iotKeySSMParam: {
                    type: "string"
                },
                iotCertSSMParam: {
                    type: "string"
                }
            },
            required: ["mqttTopicPrefix", "accountDeviceKeySSMParam", "mqttEndpoint", "accountDeviceClientId",
                "accountDeviceCertSSMParam", "nrfcloudMqttEndpoint", "iotCertSSMParam", "iotKeySSMParam"]
        }, config)

        if (!valid) {
            throw Error(`Context Validation Error Occurred: ${Ajv.errorsText()}`);
        }

        return config;
    }

    static getStackName() {
        return 'nrfcloud-mqtt-bridge'
    }
}
