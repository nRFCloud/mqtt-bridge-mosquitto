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
3. Initialize context. This pulls nRF Cloud account info, creates an MQTT Team Device with credentials, 
   creates a certificate for the local AWS IoT broker, and saves the resulting keys to AWS SSM parameters.
   If SSM parameters already exist for the Team device and local certificate, they are not re-created
   unless `--reset` is supplied.
   * `yarn bridge-init <nRF Cloud API key> [-e <nRF Cloud endpoint>] [--reset] `
   * `<nRF Cloud endpoint>` defaults to https://api.nrfcloud.com
   * `--reset` will create a new Team Device and local certificate even if they are
   already recorded in AWS SSM. Any pre-existing Team Devices are not deleted.
4. You may need to bootstrap the CDK if you have never deployed CDK resources before.
   Ensure your AWS profile info is defined in your environment first.
   * `yarn cdk bootstrap`

## Bridge Stack
Deploy the CDK application, which creates an AWS CloudFormation stack named `nrfcloud-mqtt-bridge`
   * `yarn cdk deploy`

## Demo Stack
In addition to the bridge stack, this repo also includes a demo stack that gives a
good example of a use case for the bridge. The demo stores data using IoT rules that persist
data to Timestream, and starts up a grafana instance for visualizing the data.

**Setup steps**
1. Setup bridge stack using the steps above
2. Deploy the demo CloudFormation stack named `nrfcloud-mqtt-bridge-demo`
   * `yarn deploy-demo`
3. Connect some devices to nRF Cloud or use the device simulator to start
   sending data into your account
4. Go to the URL of the bridge demo dashboard, which can be found in the `grafanaendpoint` key of the
   `Outputs` section of the `nrfcloud-mqtt-bridge-demo` CloudFormation stack. Use the initial user/password of
   `admin/admin` to log in to Grafana. It will prompt you to change your pasword.