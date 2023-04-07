const envVariables = {
    baseURL: process.env.dock_base_url || 'https://dock.sunbirded.org',
    SUNBIRD_URL: process.env.sunbird_base_url || 'https://dev.sunbirded.org',
    SUNBIRD_PORTAL_API_AUTH_TOKEN: process.env.sunbird_api_auth_token || '',
    DOCK_CHANNEL: process.env.dock_channel || 'sunbird',
    port: process.env.sunbird_program_port || 6000,
    CACHE_TTL: process.env.dock_cache_ttl || 900,
    level: process.env.sunbird_service_log_level || 'info',
    LEARNING_SERVICE_URL: process.env.learning_service_url || 'https://dock.sunbirded.org/action/',
    LEARNER_SERVICE_URL: process.env.learner_service_url,
    CONTENT_SERVICE_URL: process.env.content_service_url || 'https://dock.sunbirded.org/action/',
    OPENSABER_SERVICE_URL: process.env.opensaber_service_url || 'https://dock.sunbirded.org/content/reg',
    SUNBIRD_KAFKA_HOST: process.env.sunbird_kafka_host,
    DOCK_KAFKA_HOST: process.env.dock_kafka_host,
    DOCK_REDIS_HOST: process.env.dock_redis_host,
    DOCK_REDIS_PORT: process.env.dock_redis_port || 6379,
    SUNBIRD_AUTO_CREATION_TOPIC: process.env.sunbird_auto_creation_topic,
    SUNBIRD_QUESTION_BULKUPLOAD_TOPIC: process.env.sunbird_question_bulkupload_topic,
    SUNBIRD_KAFKA_BULKUPLOAD_CONSUMER_GROUP_ID:process.env.sunbird_kafka_bulkupload_consumer_group_id,
    SUNBIRD_ASSESSMENT_SERVICE_BASE_URL : process.env.sunbird_assessment_service_base_url,
    CORE_INGRESS_GATEWAY_IP: process.env.CORE_INGRESS_GATEWAY_IP,
    config: {
        user: process.env.sunbird_program_db_user || "postgres",
        host: process.env.sunbird_program_db_host || "localhost",
        database: process.env.sunbird_program_db_name || 'sunbird_programs',
        password: process.env.sunbird_program_db_password || 'password',
        port: process.env.sunbird_program_db_port || 5432,
        dialect: process.env.sunbird_program_db_dialect || "postgres",
        logging: process.env.sunbird_program_db_logging || false,
        dialectOptions: {
          ssl: {
            rejectUnauthorized: process.env.sunbird_program_db_rejectSslUnauthorized || false,
          },
        },
        pool: {
            max: process.env.sunbird_program_db_pool ? Number(process.env.sunbird_program_db_pool) : 100
        }
    },
    telemetryConfig: {
        host: process.env.telemetry_service_host,
        endpoint: process.env.telemetry_service_endpoint,
        method: 'POST'
    },
    SUNBIRD_GOOGLE_SERVICE_ACCOUNT_CREDENTIAL: {
        client_email: process.env.sunbird_google_oauth_client_email,
        private_key: process.env.sunbird_google_oauth_private_key
    }
}
module.exports = envVariables;
