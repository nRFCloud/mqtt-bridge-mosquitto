# mqtt-bridge-mosquitto
Bridges messages sent within an nrfcloud account to an AWS IoT broker.
Uses an account device to subscribe to messages on the nrfcloud side.
Republishes messages from `{stage}/{tenantId}/#` => `data/#` in the
local AWS IoT message broker.

## [Usage Guide](https://docs.nrfcloud.com/Guides/Messages/SetupMessageBridge)

## Setup
**Prerequisites**
* nodejs 12+
* AWS credentials configured with access to build and create resources

**Setup steps**
1. Install dependencies
    * `yarn install` or `npm install`
2. Initialize context. This creates account device credentials, pulls
nrfcloud account info, creates certificates for the local aws iot broker,
   and saves the resulting keys to ssm parameters.
    * `yarn bridge-init <nrfcloud api key> -e <nrfcloud endpoint>`
    * `<nrfcloud endpoint>` defaults to https://api.nrfcloud.com
3. Deploy the application
    * `yarn cdk deploy`

## Demo Stack
In addition the bridge stack, this repo also includes a demo stack that gives a good example
of what you could use a bridge for. The demo stores data using Iot rules that persist
data to Timestream, and starts up a grafana instance for visualizing the data.

**Setup steps**
1. Setup bridge stack using the steps above
2. Deploy the demo stack
   * `yarn deploy-demo`
3. Connect some devices to nrfcloud or use the device simulator to start
   sending data into your account
