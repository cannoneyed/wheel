import Config

config :wheel_sync,
  enabled: false,
  endpoint: WheelSync.Endpoint,
  application_version: 1,
  minimum_client_version: 1,
  schema_version: 1,
  detailed_errors: false,
  port: 4001,
  ip: {127, 0, 0, 1},
  pool_size: 10
