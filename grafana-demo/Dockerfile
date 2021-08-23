FROM grafana/grafana:8.1.2

COPY configs/automatic.yml /etc/grafana/provisioning/datasources/automatic.yml
COPY configs/dashboard-provider.yml /etc/grafana/provisioning/dashboards/dashboard-provider.yml
COPY configs/device-tracker-dashboard.json /var/lib/grafana/dashboards/demo/device-tracker-dashboard.json
