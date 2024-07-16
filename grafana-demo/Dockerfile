FROM grafana/grafana:8.1.2

COPY generated-configs/automatic.yml /etc/grafana/provisioning/datasources/automatic.yml
COPY generated-configs/dashboard-provider.yml /etc/grafana/provisioning/dashboards/dashboard-provider.yml
COPY generated-configs/device-tracker-dashboard.json /var/lib/grafana/dashboards/demo/device-tracker-dashboard.json
