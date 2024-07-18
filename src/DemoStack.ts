import {App, CfnOutput, Names, Stack} from 'aws-cdk-lib';
import {CfnDatabase, CfnTable} from 'aws-cdk-lib/aws-timestream'
import {CfnTopicRule} from 'aws-cdk-lib/aws-iot'
import {PolicyDocument, PolicyStatement, Role, ServicePrincipal} from 'aws-cdk-lib/aws-iam';
import {
    Cluster,
    ContainerImage,
    Ec2Service,
    Ec2TaskDefinition,
    LogDriver,
    NetworkMode,
    Scope
} from 'aws-cdk-lib/aws-ecs';
import {InstanceClass, InstanceSize, InstanceType, NatProvider, SubnetType, Vpc} from 'aws-cdk-lib/aws-ec2';
import {join} from 'path'
import {ApplicationLoadBalancer} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as fs from "fs";
import {AwsCustomResource, AwsCustomResourcePolicy} from "aws-cdk-lib/custom-resources";

function superSimpleTemplating(template: string, values: Record<string, string>) {
    return template.replace(/\${([^}]+)}/g, (match, key) => {
        return values[key] || match;
    });
}

function templateFile(sourcePath: string, outputPath: string, values: Record<string, string>) {
    const template = fs.readFileSync(sourcePath, 'utf8');
    const result = superSimpleTemplating(template, values);
    fs.writeFileSync(outputPath, result);
}

const ConfigTemplateBasePath = join(__dirname, '..', 'demo-configs')
const ConfigOutputBasePath = join(__dirname, '..', "grafana-demo", "generated-configs")

export class DemoStack extends Stack {
    private static configFiles = [
        "automatic.yml",
        "dashboard-provider.yml",
        "device-tracker-dashboard.json",
    ]

    private templateConfigFiles() {
        fs.mkdirSync(ConfigOutputBasePath, {recursive: true})
        DemoStack.configFiles.forEach(file => {
            templateFile(join(ConfigTemplateBasePath, file), join(ConfigOutputBasePath, file), {
                region: this.region
            })
        })
    }

    constructor(parent: App) {
        super(parent, DemoStack.getStackName(), {
            env: {
                region: process.env.CDK_DEFAULT_REGION,
                account: process.env.CDK_DEFAULT_ACCOUNT
            }
        });

        this.templateConfigFiles()

        const timestreamDB = new CfnDatabase(this, 'timestream-db', {
            databaseName: 'timestream-demo-db',
        })

        const timestreamTable = new CfnTable(this, 'timestream-table', {
            databaseName: timestreamDB.databaseName,
            tableName: 'timestream-demo-table',
        })

        timestreamTable.node.addDependency(timestreamDB)

        const topicRuleRole = new Role(this, 'topic-rule-role', {
            assumedBy: new ServicePrincipal('iot.amazonaws.com'),
            inlinePolicies: {
                timestreamPolicy: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: ['timestream:DescribeEndpoints'],
                            resources: ['*']
                        }),
                        new PolicyStatement({
                            actions: ['timestream:WriteRecords'],
                            resources: [timestreamTable.attrArn]
                        })
                    ]
                })
            }
        })

        new CfnTopicRule(this, 'temp-rule', {
            ruleName: 'persist_temp_rule',
            topicRulePayload: {
                sql: `SELECT cast(data as Double) as temp
                      from 'data/m/d/+/d2c'
                      where appId='TEMP'`,
                ruleDisabled: false,
                description: 'Saves asset tracker temp data into timestream',
                actions: [
                    {
                        timestream: {
                            databaseName: timestreamDB.databaseName,
                            tableName: timestreamTable.tableName,
                            dimensions: [{
                                name: 'DeviceId',
                                value: '${topic(4)}'
                            }],
                            roleArn: topicRuleRole.roleArn
                        }
                    }
                ]
            }
        })

        new CfnTopicRule(this, 'location-rule-alt', {
            ruleName: "persist_location_rule_alt",

            topicRulePayload: {
                awsIotSqlVersion: '2016-03-23',
                sql: `SELECT concat(data.lat, ',', data.lng) as pos
                      from 'data/m/d/+/d2c'
                      where (appId='GPS' or appId='GNSS') and exists (data.lng)`,
                ruleDisabled: false,
                description: 'Parses asset tracker gps strings into lat,lon pairs then stores them in timestream',
                actions: [
                    {
                        timestream: {
                            databaseName: timestreamDB.databaseName,
                            tableName: timestreamTable.tableName,
                            dimensions: [{
                                name: 'DeviceId',
                                value: '${topic(4)}'
                            }],
                            roleArn: topicRuleRole.roleArn
                        }
                    }
                ]
            },
        })

        new CfnTopicRule(this, 'location-rule', {
            ruleName: 'persist_location_rule',
            topicRulePayload: {
                sql: `SELECT concat((cast(regexp_replace(data, "\\$GPGGA,[\\d\\.]+?,([-\\d]+)\\d\\d\\.[\\d]+,.*",
                                                         "$1") as Int) +
                                     (cast(regexp_replace(data, "\\$GPGGA,[\\d\\.]+?,[-\\d]+(\\d\\d\\.[\\d]+),.*",
                                                          "$1") as Double) / 60) *
                                     CASE (regexp_replace(data, "\\$GPGGA,[\\d\\.]+?,[\\d\\.-]+,([NS]),.*", "$1"))
                                         WHEN "N" THEN 1
                                         WHEN "S" THEN -1 END), ',',
                                    (cast(regexp_replace(data,
                                                         "\\$GPGGA,[\\d\\.]+?,[\\d-\\.]+,[NS],([-\\d]+)\\d\\d\\.[\\d]+,.*",
                                                         "$1") as Int) +
                                     (cast(regexp_replace(data,
                                                          "\\$GPGGA,[\\d\\.]+?,[\\d-\\.]+,[NS],[-\\d]+(\\d\\d\\.[\\d]+),.*",
                                                          "$1") as Double) / 60) *
                                     CASE (regexp_replace(data,
                                                          "\\$GPGGA,[\\d\\.]+?,[\\d-\\.]+,[NS],[\\d-\\.]+,([EW]),.*",
                                                          "$1"))
                                         WHEN "E" THEN 1
                                         WHEN "W" THEN -1 END)) as pos
                      from 'data/m/d/+/d2c'
                      where (appId='GPS' or appId='GNSS') and startswith(data, "$GPGGA")

                `,
                ruleDisabled: false,
                description: 'Parses asset tracker gps strings into lat,lon pairs then stores them in timestream',
                actions: [
                    {
                        timestream: {
                            databaseName: timestreamDB.databaseName,
                            tableName: timestreamTable.tableName,
                            dimensions: [{
                                name: 'DeviceId',
                                value: '${topic(4)}'
                            }],
                            roleArn: topicRuleRole.roleArn
                        }
                    }
                ]

            }
        })

        const vpc = new Vpc(this, 'grafana-vpc', {
            maxAzs: 2,
            natGateways: 1,
            natGatewayProvider: NatProvider.instanceV2({
                instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO)
            }),
        })

        const grafanaRole = new Role(this, 'grafana-role', {
            assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
            inlinePolicies: {
                timestreamPolicy: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: ['timestream:*'],
                            resources: [timestreamTable.attrArn, timestreamDB.attrArn]
                        }),
                        new PolicyStatement({
                            actions: ['timestream:*'],
                            resources: ['*']
                        }),
                    ]
                })
            }
        })


        const grafanaTaskdef = new Ec2TaskDefinition(this, 'grafana-task', {
            taskRole: grafanaRole,
            networkMode: NetworkMode.AWS_VPC,
            volumes: [{
                name: 'grafana-storage',
                dockerVolumeConfiguration: {
                    autoprovision: true,
                    driver: 'local',
                    scope: Scope.SHARED
                }
            }],
        })

        const cluster = new Cluster(this, 'grafana-cluster', {
            capacity: {
                instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
                maxCapacity: 1,
                allowAllOutbound: true,
                minCapacity: 1,
                vpcSubnets: vpc.selectSubnets({subnetType: SubnetType.PUBLIC})
            },
            vpc,
        })

        grafanaTaskdef.addContainer('grafana-container', {
            image: ContainerImage.fromAsset(join(__dirname, '..', 'grafana-demo')),
            portMappings: [{
                containerPort: 3000,
                hostPort: 3000
            }],
            memoryLimitMiB: 1024,
            logging: LogDriver.awsLogs({
                streamPrefix: "nrfcloud-grafana-demo"
            }),
            environment: {
                GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: 'panodata-map-panel',
                GF_INSTALL_PLUGINS: 'https://github.com/panodata/panodata-map-panel/releases/download/0.16.0/panodata-map-panel-0.16.0.zip;panodata-map-panel,grafana-timestream-datasource',
                GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH: '/var/lib/grafana/dashboards/demo/device-tracker-dashboard.json'
            },
        }).addMountPoints({
            containerPath: '/var/lib/grafana',
            sourceVolume: 'grafana-storage',
            readOnly: false,
        })

        const service = new Ec2Service(this, 'grafana-service', {
            cluster,
            taskDefinition: grafanaTaskdef,
            desiredCount: 1,
            minHealthyPercent: 0,
        })

        const alb = new ApplicationLoadBalancer(this, 'grafana-alb', {
            vpc,
            internetFacing: true
        })

        alb.addListener('grafana-listener', {
            port: 80,
            open: true
        }).addTargets('grafana-target', {
            port: 80,
            targets: [service.loadBalancerTarget({
                containerPort: 3000,
                containerName: 'grafana-container'
            })],
            healthCheck: {
                healthyHttpCodes: '200-499',
            }
        })

        new CfnOutput(this, 'grafana-endpoint', {
            value: alb.loadBalancerDnsName,
            description: "Grafana ALB endpoint",
            exportName: 'grafana-endpoint'
        })

        // Use AwsCustomResource to create dummy data in Timestream
        // This is needed to ensure that the needed columns are created in the table
        // This resource will be recreated when updated
        new AwsCustomResource(timestreamTable, 'dummy-data', {
            installLatestAwsSdk: false,
            onCreate: {
                service: '@aws-sdk/client-timestream-write',
                action: 'writeRecords',
                parameters: {
                    DatabaseName: timestreamDB.databaseName,
                    TableName: timestreamTable.tableName,
                    Records: [
                        {
                            Dimensions: [
                                {
                                    Name: 'DeviceId',
                                    Value: 'dummy'
                                },
                            ],
                            MeasureName: 'dummy_temp',
                            Time: (Date.now() - 1000) + "",
                            MeasureValue: '0',
                            MeasureValueType: 'DOUBLE',
                        },
                        {
                            Dimensions: [
                                {
                                    Name: 'DeviceId',
                                    Value: 'dummy'
                                },
                            ],
                            MeasureName: 'dummy_gps',
                            Time: Date.now() + "",
                            MeasureValue: '1, 1',
                            MeasureValueType: 'VARCHAR',
                        }
                    ]
                },
                physicalResourceId: {id: Names.uniqueId(timestreamTable) + 'dummy-data'},
            },
            policy: AwsCustomResourcePolicy.fromStatements([
                new PolicyStatement({
                    actions: ['timestream:WriteRecords'],
                    resources: [timestreamTable.attrArn],
                }),
                new PolicyStatement({
                    actions: ['timestream:DescribeEndpoints'],
                    resources: ['*'],
                })
            ])
        })
    }

    static getStackName() {
        return 'nrfcloud-mqtt-bridge-demo'
    }
}

new DemoStack(new App());
