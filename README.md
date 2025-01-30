# mqtt-bridge-mosquitto
Bridges messages sent within an nRF Cloud account to an AWS IoT broker.
Uses an [MQTT Team Device](https://docs.nordicsemi.com/bundle/nrf-cloud/page/Devices/Properties/Types.html#mqtt-team-devices) to subscribe to messages on the nRF Cloud side.
Republishes messages from `{stage}/{tenantId}/#` => `data/#` in the
local AWS IoT message broker.

## [Usage Guide](https://docs.nordicsemi.com/bundle/nrf-cloud/page/Devices/MessagesAndAlerts/SetupMessageBridge.html)

## Setup
**Prerequisites**
* nodejs 18+
* yarn 1.22+
* AWS credentials configured with access to build and create resources

**Setup steps**
1. Install dependencies
    * `yarn install` or `npm install`
2. Compile package
   * `yarn compile`
3. Initialize context. This creates an MQTT Team Device with credentials, pulls
nRF Cloud account info, creates a certificate for the local AWS IoT broker,
   and saves the resulting keys to AWS SSM parameters.
    * `yarn bridge-init <nRF Cloud API key> -e <nRF Cloud endpoint>`
    * `<nRF Cloud endpoint>` defaults to https://api.nrfcloud.com
4. Deploy the application
   * You may first need to run cdk bootstrap with your aws account info
     * `yarn cdk bootstrap`
   * `yarn cdk deploy`

## Demo Stack
In addition the bridge stack, this repo also includes a demo stack that gives a
good example of a use case for the bridge. The demo stores data using IoT rules that persist
data to Timestream, and starts up a grafana instance for visualizing the data.

**Setup steps**
1. Setup bridge stack using the steps above
2. Deploy the demo stack
   * `yarn deploy-demo`
3. Connect some devices to nRF Cloud or use the device simulator to start
   sending data into your account
