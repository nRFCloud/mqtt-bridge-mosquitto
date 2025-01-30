FROM eclipse-mosquitto:2.0.11

# Copy the custom entrypoint script into the container
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh

# Ensure the entrypoint script has executable permissions
RUN chmod +x /docker-entrypoint.sh

# Set the custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]

# Default command to run Mosquitto in verbose mode
CMD ["mosquitto", "-v"]
