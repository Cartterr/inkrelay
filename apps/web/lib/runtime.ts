import { parseRuntimeConfig, type RuntimeConfig } from "@inkrelay/core";
import { createDatabase, type DatabaseConnection } from "@inkrelay/db";
import { S3AssetStore } from "@inkrelay/rendering";

declare global {
  var inkrelayDatabase: DatabaseConnection | undefined;
  var inkrelayStore: S3AssetStore | undefined;
}

let parsedConfig: RuntimeConfig | undefined;

export function runtimeConfig(): RuntimeConfig {
  parsedConfig ??= parseRuntimeConfig(process.env);
  return parsedConfig;
}

export function database(): DatabaseConnection {
  globalThis.inkrelayDatabase ??= createDatabase(runtimeConfig().databaseUrl);
  return globalThis.inkrelayDatabase;
}

export function assetStore(): S3AssetStore {
  const config = runtimeConfig();
  globalThis.inkrelayStore ??= new S3AssetStore({
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    bucket: config.storage.bucket,
    accessKeyId: config.storage.accessKeyId,
    secretAccessKey: config.storage.secretAccessKey,
    forcePathStyle: config.storage.forcePathStyle,
  });
  return globalThis.inkrelayStore;
}
