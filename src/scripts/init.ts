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

const NRFCLOUD_CLIENT_CERT_PARAM = 'NrfcloudClientCert';
const NRFCLOUD_CLIENT_KEY_PARAM = 'NrfcloudClientKey';
const IOT_CERT_PARAM = 'IotCert';
const IOT_KEY_PARAM = 'IotKey';
const CONTEXT_FILE = join(__dirname, "..", "..", "cdk.context.json")

const Iot = new IoTClient({})
const SSM = new SSMClient({})


const args = yargs.command('$0 <apiKey>', 'Initialize context', (yargs) => {
    yargs.positional("apiKey", {
        type: "string",
        description: "Your Nrfcloud apiKey",
        demandOption: true,
    }).option('endpoint', {
        type: "string",
        description: "Nrfcloud endpoint",
        default: "https://api.nrfcloud.com",
        alias: "e"
    }).option('reset', {
        type: 'boolean',
        default: false,
        description: "Regenerate all credentials. This will regenerate your nrfcloud account device certificates"
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

interface ContextInfo {
    mqttTopicPrefix: string;
    accountDeviceKeySSMParam: string;
    accountDeviceCertSSMParam: string;
    nrfcloudMqttEndpoint: string;
    mqttEndpoint: string;
    accountDeviceClientId: string;
    iotKeySSMParam: string;
    iotCertSSMParam: string;
}

async function initializeContext(input: CliInput) {
    // Verify context file is valid
    await getExistingContext()
    const accountInfo = await getAccountInfo(input);
    const iotEndpoint = (await Iot.send(new DescribeEndpointCommand({endpointType: "iot:Data-ATS"}))).endpointAddress
    console.log(`AWS IoT endpoint: ${iotEndpoint}`)
    console.log("Retrieved Nrfcloud account info:")
    console.log(JSON.stringify(accountInfo, null, 2))
    await ensureNrfcloudCredentials(input);
    await ensureIotCredentials(input);
    console.log("Saving context info")
    const context = {
        accountDeviceCertSSMParam: NRFCLOUD_CLIENT_CERT_PARAM,
        accountDeviceKeySSMParam: NRFCLOUD_CLIENT_KEY_PARAM,
        accountDeviceClientId: accountInfo.accountDeviceClientId,
        iotCertSSMParam: IOT_CERT_PARAM,
        iotKeySSMParam: IOT_KEY_PARAM,
        mqttEndpoint: iotEndpoint,
        mqttTopicPrefix: accountInfo.mqttTopicPrefix,
        nrfcloudMqttEndpoint: accountInfo.mqttEndpoint
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

async function getNrfcloudCredentialsSSM(): Promise<CertificateCredentials> {
    const nrfcloudClientCertResponse = await SSM.send(new GetParameterCommand({
        Name: NRFCLOUD_CLIENT_CERT_PARAM
    })).catch(err => null)
    const nrfcloudClientKeyResponse = await SSM.send(new GetParameterCommand({
        Name: NRFCLOUD_CLIENT_KEY_PARAM
    })).catch(err => null)

    return {
        clientCert: nrfcloudClientCertResponse?.Parameter?.Value,
        privateKey: nrfcloudClientKeyResponse?.Parameter?.Value
    }
}

async function getIotCredentialsSSM(): Promise<CertificateCredentials> {
    const iotClientCertResponse = await SSM.send(new GetParameterCommand({
        Name: IOT_CERT_PARAM
    })).catch(err => null)
    const iotClientKeyResponse = await SSM.send(new GetParameterCommand({
        Name: IOT_KEY_PARAM
    })).catch(err => null)

    return {
        clientCert: iotClientCertResponse?.Parameter?.Value,
        privateKey: iotClientKeyResponse?.Parameter?.Value
    }
}

async function generateNrfcloudCredentials(config: CliInput): Promise<CertificateCredentials> {
    const accountDevice = await needle("post", `${config.endpoint}/v1/account/certificates`, undefined, {
        json: true,
        headers: {
            Authorization: `Bearer ${config.apiKey}`
        }
    });

    return {
        clientCert: accountDevice.body.clientCert,
        privateKey: accountDevice.body.privateKey
    }
}

async function saveNrfcloudCredentialsSSM(credentials: CertificateCredentials) {
    await SSM.send(new PutParameterCommand({
        Name: NRFCLOUD_CLIENT_CERT_PARAM,
        Value: credentials.clientCert,
        Type: ParameterType.STRING
    }))
    await SSM.send(new PutParameterCommand({
        Name: NRFCLOUD_CLIENT_KEY_PARAM,
        Value: credentials.privateKey,
        Type: ParameterType.STRING
    }))
}

async function ensureNrfcloudCredentials(config: CliInput) {
    const res = await getNrfcloudCredentialsSSM();
    if (res.privateKey == null || res.clientCert == null || config.reset) {
        console.log("Generating new account device credentials")
        const credentials = await generateNrfcloudCredentials(config);
        await saveNrfcloudCredentialsSSM(credentials)
        console.log(`Saved new account device credentials to ${NRFCLOUD_CLIENT_CERT_PARAM} and ${NRFCLOUD_CLIENT_KEY_PARAM}`)
    } else {
        console.log(`Existing account device credentials were present in ${NRFCLOUD_CLIENT_CERT_PARAM} and ${NRFCLOUD_CLIENT_KEY_PARAM}`)
    }
}

async function generateIotCredentials(): Promise<CertificateCredentials> {
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
        Name: IOT_CERT_PARAM,
        Value: credentials.clientCert,
        Type: ParameterType.STRING
    }))
    await SSM.send(new PutParameterCommand({
        Name: IOT_KEY_PARAM,
        Value: credentials.privateKey,
        Type: ParameterType.STRING
    }))
}

async function ensureIotCredentials(config: CliInput) {
    const res = await getIotCredentialsSSM();
    if (res.privateKey == null || res.clientCert == null || config.reset) {
        console.log("Generating new IoT credentials")
        const credentials = await generateIotCredentials();
        await saveIotCredentialsSSM(credentials);
        console.log(`Saved new iot credentials to ${IOT_CERT_PARAM} and ${IOT_KEY_PARAM}`)
    } else {
        console.log(`Existing iot credentials were present in ${IOT_CERT_PARAM} and ${IOT_KEY_PARAM}`)
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
        accountDeviceClientId: `account-${tenantId}`
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
