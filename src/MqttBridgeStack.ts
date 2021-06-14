import { App, CfnParameter, Stack } from '@aws-cdk/core';
import { Cluster, ContainerImage, Ec2Service, Ec2TaskDefinition } from '@aws-cdk/aws-ecs'
import { InstanceClass, InstanceSize, InstanceType, Vpc } from "@aws-cdk/aws-ec2"
import {} from "@aws-cdk/aws-iot"

export class MqttBridgeStack extends Stack {
    constructor(parent: App) {
        super(parent, MqttBridgeStack.getStackName());

        const mqttTopicPrefixParam = new CfnParameter(this, 'MqttTopicPrefix', {
            type: "String",
            description: "MQTT topic prefix found in your account information"
        })

        const accountDeviceClientIdParam = new CfnParameter(this, 'AccountDeviceClientId', {
            type: "String",
            description: "Client ID for your account device"
        })

        const mqttEndpointParam = new CfnParameter(this, 'MqttEndpointParam', {
            type: "String",
            description: "Nrfcloud MQTT endpoint"
        })

        const accountDeviceClientCert = new CfnParameter(this, 'AccountDeviceClientCert', {
            type: "String",
            description: "Client certificate for your account device"
        })

        const accountDeviceClientKey = new CfnParameter(this, 'AccountDeviceClientKey', {
            type: "String",
            description: "Client key for your account device"
        })

        const vpc = new Vpc(this, 'MqttBridgeVpc', {
            maxAzs: 2
        })

        const cluster = new Cluster(this, 'MqttBridgeCluster', {vpc})

        cluster.addCapacity('MqttBridgeClusterInstances', {
            associatePublicIpAddress: false,
            instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
            maxCapacity: 1,
        })

        const taskDef = new Ec2TaskDefinition(this, 'MqttBridgeTask')
        taskDef.addContainer('MqttBridgeContainer', {
            image: ContainerImage.fromRegistry("public.ecr.aws/q9u9d6w7/nrfcloud-bridge:latest"),
            memoryLimitMiB: 2048,
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
                NRFCLOUD_CLIENT_CERT: accountDeviceClientCert.value.toString(),
                NRFCLOUD_CLIENT_KEY: accountDeviceClientKey.value.toString()
            }
        })

        const service = new Ec2Service(this, 'MqttBridgeService', {
            cluster,
            taskDefinition: taskDef,
            assignPublicIp: false,
            desiredCount: 1,
        })
    }

    static getStackName() {
        return 'nrfcloud-mqtt-bridge'
    }
}
