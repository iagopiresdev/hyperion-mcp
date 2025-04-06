import * as bcrypt from "bcrypt";
import { config } from "./config";
import { logger } from "./logger";
import { supabase } from "./supabaseClient";

const authLogger = logger.child({ component: "auth" });

const SALT_ROUNDS = 10; // Standard salt rounds for bcrypt

/**
 * Types of authentication methods supported
 */
export type AuthMethod = "api_key" | "bearer_token" | "none";

/**
 * Permission level for tools
 */
export type PermissionLevel = "public" | "protected" | "admin";

/**
 * Authenticated user/client information
 */
export interface AuthenticatedClient {
  id: string;
  name: string;
  permissions: PermissionLevel;
  metadata?: Record<string, any>;
}

/**
 * Represents an API key record in the database
 */
interface ApiKeyRecord {
  id: string; // PK, uuid
  key_hash: string; // Hashed key
  client_id: string;
  client_name: string;
  permissions: PermissionLevel;
  enabled: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

/**
 * Database-backed API key store
 */
class ApiKeyStore {
  constructor() {
    authLogger.info("ApiKeyStore initialized (using Database)");
  }

  /**
   * Register a new API key in the database
   * @param key The raw API key string
   * @param client The client information
   */
  async registerKey(key: string, client: AuthenticatedClient): Promise<void> {
    if (!key || key.length < 8) {
      throw new Error("API key must be at least 8 characters long");
    }

    const keyHash = await bcrypt.hash(key, SALT_ROUNDS);
    authLogger.debug("Generated hash for new API key");

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        key_hash: keyHash, // Store the hash
        client_id: client.id,
        client_name: client.name,
        permissions: client.permissions,
        metadata: client.metadata,
        enabled: true,
      })
      .select();

    if (error) {
      if (error.code === "23505") {
        // PostgreSQL unique violation code
        authLogger.warn(
          `Attempted to register duplicate API key (based on hash) for client: ${client.id}`
        );
        throw new Error(`API key already exists (or hash collision).`);
      } else {
        authLogger.error("Failed to register API key in database", error);
        throw new Error(`Database error registering API key: ${error.message}`);
      }
    }

    if (!data || data.length === 0) {
      authLogger.error("API key insertion returned no data");
      throw new Error(
        "Failed to register API key, insertion returned no data."
      );
    }

    authLogger.debug("Registered new API key in database", {
      dbId: (data[0] as ApiKeyRecord).id,
      clientId: client.id,
      permissions: client.permissions,
    });
  }

  /**
   * Validate a raw API key for a specific client ID against the stored hash.
   * @param clientId The client ID provided by the client
   * @param key The raw API key to validate
   * @returns The authenticated client or null if invalid/not found/mismatch
   */
  async validateKey(
    clientId: string | null,
    key: string | null
  ): Promise<AuthenticatedClient | null> {
    if (!clientId || !key) {
      return null;
    }

    const { data: apiKeyRecord, error: fetchError } = await supabase
      .from("api_keys")
      .select(
        "client_id, client_name, permissions, metadata, enabled, key_hash"
      )
      .eq("client_id", clientId)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      authLogger.error(
        "Database error fetching API key by client ID",
        fetchError
      );
      return null; // Internal error during lookup
    }

    if (!apiKeyRecord) {
      authLogger.debug("No enabled API key found for client ID", { clientId });
      return null; // No matching enabled key for this client ID
    }

    if (!apiKeyRecord.key_hash) {
      authLogger.error(
        `Stored API key record is missing hash for client ID: ${clientId}`
      );
      return null;
    }

    const match = await bcrypt.compare(key, apiKeyRecord.key_hash);

    if (match) {
      authLogger.debug("API key validated successfully", { clientId });
      // Key matches, return client info
      return {
        id: apiKeyRecord.client_id,
        name: apiKeyRecord.client_name,
        permissions: apiKeyRecord.permissions as PermissionLevel,
        metadata: apiKeyRecord.metadata,
      };
    } else {
      authLogger.warn("API key validation failed (hash mismatch)", {
        clientId,
      });
      return null; // Key did not match hash
    }
  }

  /**
   * Disable an API key in the database using its primary key ID.
   * @param apiKeyDbId The UUID primary key of the api_keys record to disable.
   * @returns True if a record was updated, false otherwise.
   */
  async disableKey(apiKeyDbId: string): Promise<boolean> {
    if (!apiKeyDbId) {
      authLogger.warn("disableKey called without a database ID.");
      return false;
    }

    authLogger.info("Attempting to disable API key by database ID", {
      apiKeyDbId,
    });

    const { count, error } = await supabase
      .from("api_keys")
      .update({ enabled: false })
      .eq("id", apiKeyDbId)
      .eq("enabled", true);

    if (error) {
      authLogger.error("Database error disabling API key by ID", error);
      return false;
    }

    const updated = count !== null && count > 0;
    if (updated) {
      authLogger.info("Disabled API key in database", { apiKeyDbId });
    } else {
      authLogger.warn(
        "API key disable did not update any rows (not found or already disabled)",
        { apiKeyDbId }
      );
    }
    return updated;
  }
}

/**
 * Main authentication service
 */
export class AuthService {
  private apiKeys: ApiKeyStore;
  private authEnabled: boolean;

  constructor() {
    this.apiKeys = new ApiKeyStore();
    this.authEnabled = config.auth.enabled;

    if (this.authEnabled) {
      authLogger.info("Authentication is enabled");
    } else {
      authLogger.warn(
        "Authentication is DISABLED - all requests will be allowed"
      );
    }
  }

  /**
   * Authenticate a request using Client ID and Key
   * @param clientId Client ID from X-Client-ID header
   * @param key API Key / Bearer Token from Authorization header
   * @returns The authenticated client or null if authentication failed
   */
  async authenticate(
    clientId: string | null,
    key: string | null
  ): Promise<AuthenticatedClient | null> {
    if (!this.authEnabled) {
      return {
        id: "anonymous",
        name: "Anonymous Client",
        permissions: "public",
      };
    }

    const client = await this.apiKeys.validateKey(clientId, key);

    if (client) {
      authLogger.debug(`Authenticated successfully`, { clientId: client.id });
      return client;
    }

    if (clientId || key) {
      authLogger.warn(`Authentication failed`, {
        clientIdProvided: clientId,
        hasKey: !!key,
      });
    }

    return null;
  }

  /**
   * Check if a client has the required permission level for an operation
   * @param client The authenticated client
   * @param requiredLevel The required permission level
   * @returns true if the client has sufficient permissions
   */
  hasPermission(
    client: AuthenticatedClient | null,
    requiredLevel: PermissionLevel
  ): boolean {
    if (!client) return false;

    if (client.permissions === "admin") return true;

    if (client.permissions === "protected") {
      return requiredLevel === "protected" || requiredLevel === "public";
    }

    if (client.permissions === "public") {
      return requiredLevel === "public";
    }

    return false;
  }

  /**
   * Register a new API key
   */
  async registerApiKey(
    key: string,
    client: AuthenticatedClient
  ): Promise<void> {
    await this.apiKeys.registerKey(key, client);
  }

  /**
   * Disable an API key using its database primary key ID
   * @param apiKeyDbId The UUID primary key of the api_keys record
   */
  async disableApiKey(apiKeyDbId: string): Promise<boolean> {
    authLogger.info("AuthService attempting disableApiKey by ID", {
      apiKeyDbId,
    });
    return await this.apiKeys.disableKey(apiKeyDbId);
  }
}

export const authService = new AuthService();
