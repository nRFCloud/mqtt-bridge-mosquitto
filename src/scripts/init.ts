import yargs = require("yargs");
import needle = require("needle");
import { v4 } from "uuid"
import { GetParameterCommand, ParameterType, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm"
import {
    AttachPolicyCommand,
    CreateKeysAndCertificateCommand,
    CreatePolicyCommand,
    DescribeEndpointCommand,
    IoTClient
} from '@aws-sdk/client-iot';
import { join } from "path"
import { promises as fs } from "fs"

const NRFCLOUD_CLIENT_CERT_PARAM = 'NrfCloudClientCert';
const NRFCLOUD_CLIENT_KEY_PARAM = 'NrfCloudClientKey';
const NRFCLOUD_MQTT_DEVICE_ID = 'NrfCloudMqttTeamDeviceId';
const LOCAL_CLIENT_CERT_PARAM = 'LocalIotClientCert';
const LOCAL_CLIENT_KEY_PARAM = 'LocalIotClientKey';
const CONTEXT_FILE = join(__dirname, "..", "..", "cdk.context.json")

const Iot = new IoTClient({})
const SSM = new SSMClient({})


const args = yargs.command('$0 <apiKey>', 'Initialize context', (yargs) => {
    yargs.positional("apiKey", {
        type: "string",
        description: "Your nRF Cloud API key.",
        demandOption: true,
    }).option('endpoint', {
        type: "string",
        description: "The nRF Cloud REST API host endpoint.",
        default: "https://api.nrfCloud.com",
        alias: "e"
    }).option('reset', {
        type: 'boolean',
        default: false,
        description: "Regenerate all credentials. This will regenerate your MQTT Team Device certificate."
    })
}, initializeContext).help('h').argv

interface CliInput {
    apiKey: string;
    endpoint: string;
    reset: boolean;
}

interface CertificateCredentials {
    clientCert: string;
    privateKey: string;
}

interface MqttTeamDevice extends CertificateCredentials {
    clientId: string;
}

interface ContextInfo {
    mqttTopicPrefix: string;
    mqttTeamDeviceKeySSMParam: string;
    mqttTeamDeviceCertSSMParam: string;
    nrfCloudMqttEndpoint: string;
    mqttEndpoint: string;
    mqttTeamDeviceClientId: string;
    localIotClientKeySSMParam: string;
    localIotClientCertSSMParam: string;
}

async function initializeContext(input: CliInput) {
    // Verify context file is valid
    await getExistingContext()
    const accountInfo = await getAccountInfo(input);
    const iotEndpoint = (await Iot.send(new DescribeEndpointCommand({endpointType: "iot:Data-ATS"}))).endpointAddress
    console.log(`AWS IoT endpoint: ${iotEndpoint}`)
    console.log("Retrieved nRF Cloud account info:")
    console.log(JSON.stringify(accountInfo, null, 2))
    await ensureNrfCloudCredentials(input);
    await saveLocalIotClientCredentialsToSSM(input);
    console.log("Saving context info")
    const context = {
        mqttTeamDeviceCertSSMParam: NRFCLOUD_CLIENT_CERT_PARAM,
        mqttTeamDeviceKeySSMParam: NRFCLOUD_CLIENT_KEY_PARAM,
        mqttTeamDeviceClientId: accountInfo.mqttTeamDeviceClientId,
        localIotClientCertSSMParam: LOCAL_CLIENT_CERT_PARAM,
        localIotClientKeySSMParam: LOCAL_CLIENT_KEY_PARAM,
        mqttEndpoint: iotEndpoint,
        mqttTopicPrefix: accountInfo.mqttTopicPrefix,
        nrfCloudMqttEndpoint: accountInfo.mqttEndpoint
    }
    console.log(JSON.stringify(context, null, 2))
    await saveContextInfo(context)
}

async function saveContextInfo(context: ContextInfo) {
    const currentContext = await getExistingContext();
    const data = {
        ...currentContext,
        ...context
    };
    await fs.writeFile(CONTEXT_FILE, JSON.stringify(data, null, 2))
}

async function getNrfCloudCredentialsSSM(): Promise<CertificateCredentials> {
    const nrfCloudClientCertResponse = await SSM.send(new GetParameterCommand({
        Name: NRFCLOUD_CLIENT_CERT_PARAM
    })).catch(err => null)
    const nrfCloudClientKeyResponse = await SSM.send(new GetParameterCommand({
        Name: NRFCLOUD_CLIENT_KEY_PARAM
    })).catch(err => null)

    return {
        clientCert: nrfCloudClientCertResponse?.Parameter?.Value,
        privateKey: nrfCloudClientKeyResponse?.Parameter?.Value
    }
}

async function getLocalIotClientCredentialsSSM(): Promise<CertificateCredentials> {
    const localIotClientCertResponse = await SSM.send(new GetParameterCommand({
        Name: LOCAL_CLIENT_CERT_PARAM
    })).catch(err => null)
    const localIotClientKeyResponse = await SSM.send(new GetParameterCommand({
        Name: LOCAL_CLIENT_KEY_PARAM
    })).catch(err => null)

    return {
        clientCert: localIotClientCertResponse?.Parameter?.Value,
        privateKey: localIotClientKeyResponse?.Parameter?.Value
    }
}

async function generateNrfCloudCredentials(config: CliInput): Promise<MqttTeamDevice> {
    const mqttTeamDevice = await needle("post", `${config.endpoint}/v1/devices/mqtt-team`, undefined, {
        json: true,
        headers: {
            Authorization: `Bearer ${config.apiKey}`
        }
    });

    return {
        clientId: mqttTeamDevice.body.clientId,
        clientCert: mqttTeamDevice.body.clientCert,
        privateKey: mqttTeamDevice.body.privateKey
    }
}

async function saveMqttTeamDeviceDataToSSM(teamDevice: MqttTeamDevice) {
    await SSM.send(new PutParameterCommand({
        Name: NRFCLOUD_CLIENT_CERT_PARAM,
        Value: teamDevice.clientCert,
        Type: ParameterType.STRING
    }))
    await SSM.send(new PutParameterCommand({
        Name: NRFCLOUD_CLIENT_KEY_PARAM,
        Value: teamDevice.privateKey,
        Type: ParameterType.STRING
    }))
    await SSM.send(new PutParameterCommand({
        Name: NRFCLOUD_MQTT_DEVICE_ID,
        Value: teamDevice.clientId,
        Type: ParameterType.STRING
    }))
}

async function ensureNrfCloudCredentials(config: CliInput) {
    const res = await getNrfCloudCredentialsSSM();
    if (res.privateKey == null || res.clientCert == null || config.reset) {
        console.log("Generating new MQTT Team Device credentials")
        const credentials = await generateNrfCloudCredentials(config);
        await saveMqttTeamDeviceDataToSSM(credentials)
        console.log(`Saved new MQTT Team Device credentials to ${NRFCLOUD_CLIENT_CERT_PARAM} and ${NRFCLOUD_CLIENT_KEY_PARAM}`)
    } else {
        console.log(`Existing MQTT Team Device credentials were present in ${NRFCLOUD_CLIENT_CERT_PARAM} and ${NRFCLOUD_CLIENT_KEY_PARAM}`)
    }
}

async function generateLocalIotClientCredentials(): Promise<CertificateCredentials> {
    const policyName = `nrfcloud-mqtt-bridge-policy-${v4()}`;
    console.log(`Creating iot policy ${policyName}`)
    const policy = await Iot.send(new CreatePolicyCommand({
        policyDocument: '{"Version": "2012-10-17","Statement": [{"Effect": "Allow","Action": "iot:*","Resource": "*"}]}',
        policyName
    }))
    const credentials = await Iot.send(new CreateKeysAndCertificateCommand({
        setAsActive: true
    }))
    await Iot.send(new AttachPolicyCommand({
        policyName,
        target: credentials.certificateArn
    }))

    return {
        clientCert: credentials.certificatePem,
        privateKey: credentials.keyPair.PrivateKey,
    }
}

async function saveIotCredentialsSSM(credentials: CertificateCredentials) {
    await SSM.send(new PutParameterCommand({
        Name: LOCAL_CLIENT_CERT_PARAM,
        Value: credentials.clientCert,
        Type: ParameterType.STRING
    }))
    await SSM.send(new PutParameterCommand({
        Name: LOCAL_CLIENT_KEY_PARAM,
        Value: credentials.privateKey,
        Type: ParameterType.STRING
    }))
}

async function saveLocalIotClientCredentialsToSSM(config: CliInput) {
    const res = await getLocalIotClientCredentialsSSM();
    if (res.privateKey == null || res.clientCert == null || config.reset) {
        console.log("Generating new IoT credentials")
        const credentials = await generateLocalIotClientCredentials();
        await saveIotCredentialsSSM(credentials);
        console.log(`Saved new iot credentials to ${LOCAL_CLIENT_CERT_PARAM} and ${LOCAL_CLIENT_KEY_PARAM}`)
    } else {
        console.log(`Existing iot credentials were present in ${LOCAL_CLIENT_CERT_PARAM} and ${LOCAL_CLIENT_KEY_PARAM}`)
    }
}

async function getAccountInfo(config: CliInput) {
    const accountInfo = await needle("get", `${config.endpoint}/v1/account`, {
        headers: {
            Authorization: `Bearer ${config.apiKey}`
        },
        json: true,
    })
    const tenantId = accountInfo.body.mqttTopicPrefix.split("/")[1]
    return {
        mqttEndpoint: accountInfo.body.mqttEndpoint,
        mqttTopicPrefix: accountInfo.body.mqttTopicPrefix,
        tenantId,
        mqttTeamDeviceClientId: `account-${tenantId}`
    }
}

async function getExistingContext(): Promise<Map<string, any>> {
    let content = await fs.readFile(CONTEXT_FILE, {encoding: 'utf-8'}).catch(err => "{}");
    try {
        return JSON.parse(content);
    } catch (e) {
        throw Error("Couldn't parse context file:" + CONTEXT_FILE);
    }
}
