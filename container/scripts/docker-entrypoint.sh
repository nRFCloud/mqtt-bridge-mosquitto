#!/bin/ash
set -e

echo "$MOSQUITTO_CONFIG" > /mosquitto/config/mosquitto.conf
echo "$NRFCLOUD_CA" > /mosquitto/config/nrfcloud.crt
echo "$NRFCLOUD_CLIENT_CERT" > /mosquitto/config/nrfcloud_client_cert.crt
echo "$NRFCLOUD_CLIENT_KEY" > /mosquitto/config/nrfcloud_client_key.key
echo "$IOT_CERT" > /mosquitto/config/iot_cert.crt
echo "$IOT_KEY" > /mosquitto/config/iot_key.key

chmod 644 /mosquitto/config/nrfcloud_ca.crt
chmod 644 /mosquitto/config/nrfcloud_client_cert.crt
chmod 644 /mosquitto/config/nrfcloud_client_key.key
chmod 644 /mosquitto/config/iot_cert.crt
chmod 644 /mosquitto/config/iot_key.key

# Set permissions
user="$(id -u)"
if [ "$user" = '0' ]; then
        [ -d "/mosquitto" ] && chown -R mosquitto:mosquitto /mosquitto || true
fi

echo "$@"

exec "$@"
