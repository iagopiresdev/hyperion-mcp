import { config } from "./config";
import { logger } from "./logger";

const authLogger = logger.child({ component: "auth" });

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
 * API Key entry
 */
interface ApiKey {
  key: string;
  client: AuthenticatedClient;
  enabled: boolean;
}

/**
 * Simple in-memory API key store
 * In a real application, this would be stored in a database
 */
class ApiKeyStore {
  private keys: Map<string, ApiKey> = new Map();

  constructor() {
    this.loadKeysFromConfig();
  }

  /**
   * Load API keys from environment or configuration
   */
  private loadKeysFromConfig() {
    try {
      // Load API keys from config
      const configuredKeys = config.auth.apiKeys;

      if (configuredKeys.length > 0) {
        // Register the first key as the default admin key
        this.registerKey(configuredKeys[0], {
          id: "default",
          name: "Default API Key",
          permissions: "admin",
        });
        authLogger.info("Loaded default API key from configuration");

        // Register any additional keys
        for (let i = 1; i < configuredKeys.length; i++) {
          this.registerKey(configuredKeys[i], {
            id: `api-key-${i}`,
            name: `API Key ${i}`,
            permissions: "admin",
          });
        }
      }

      // In a real application, you would load additional keys from a database
      // For now, we'll add some test keys for development purposes
      if (config.server.environment === "development") {
        // Add test keys for development
        this.registerKey("test-public-key", {
          id: "test-public",
          name: "Test Public Client",
          permissions: "public",
        });

        this.registerKey("test-protected-key", {
          id: "test-protected",
          name: "Test Protected Client",
          permissions: "protected",
        });

        this.registerKey("test-admin-key", {
          id: "test-admin",
          name: "Test Admin Client",
          permissions: "admin",
        });

        authLogger.info("Added test API keys for development environment");
      }
    } catch (error) {
      authLogger.error(
        "Failed to load API keys from configuration",
        error as Error
      );
    }
  }

  /**
   * Register a new API key
   * @param key The API key string
   * @param client The client information
   */
  registerKey(key: string, client: AuthenticatedClient): void {
    if (!key || key.length < 8) {
      throw new Error("API key must be at least 8 characters long");
    }

    this.keys.set(key, { key, client, enabled: true });
    authLogger.debug("Registered new API key", {
      clientId: client.id,
      permissions: client.permissions,
    });
  }

  /**
   * Validate an API key and return the associated client
   * @param key The API key to validate
   * @returns The authenticated client or null if invalid
   */
  validateKey(key: string): AuthenticatedClient | null {
    if (!key) return null;

    const apiKey = this.keys.get(key);
    if (!apiKey || !apiKey.enabled) {
      return null;
    }

    return apiKey.client;
  }

  /**
   * Disable an API key
   * @param key The API key to disable
   */
  disableKey(key: string): boolean {
    const apiKey = this.keys.get(key);
    if (!apiKey) return false;

    apiKey.enabled = false;
    this.keys.set(key, apiKey);
    authLogger.info("Disabled API key", { clientId: apiKey.client.id });
    return true;
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
   * Extract authentication credentials from a request
   * @param headers The request headers
   * @returns The authentication method and credentials
   */
  extractCredentials(headers: Headers): {
    method: AuthMethod;
    credentials: string | null;
  } {
    // Check for API key in X-API-Key header (preferred)
    const apiKey = headers.get("X-API-Key");
    if (apiKey) {
      return { method: "api_key", credentials: apiKey };
    }

    // Check for Bearer token in Authorization header
    const authHeader = headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return { method: "bearer_token", credentials: authHeader.slice(7) };
    }

    // No authentication provided
    return { method: "none", credentials: null };
  }

  /**
   * Authenticate a request
   * @param headers The request headers
   * @returns The authenticated client or null if authentication failed
   */
  authenticate(headers: Headers): AuthenticatedClient | null {
    // If authentication is disabled, return a default public client
    if (!this.authEnabled) {
      return {
        id: "anonymous",
        name: "Anonymous Client",
        permissions: "public",
      };
    }

    const { method, credentials } = this.extractCredentials(headers);

    if (method === "none" || !credentials) {
      authLogger.debug("No authentication credentials provided");
      return null;
    }

    if (method === "api_key") {
      const client = this.apiKeys.validateKey(credentials);
      if (client) {
        authLogger.debug("Authenticated via API key", {
          clientId: client.id,
          permissions: client.permissions,
        });
        return client;
      }
      authLogger.warn("Invalid API key provided");
      return null;
    }

    if (method === "bearer_token") {
      // For now, treat bearer tokens the same as API keys
      // In a real application, you would validate JWT tokens or OAuth tokens
      const client = this.apiKeys.validateKey(credentials);
      if (client) {
        authLogger.debug("Authenticated via Bearer token", {
          clientId: client.id,
          permissions: client.permissions,
        });
        return client;
      }
      authLogger.warn("Invalid Bearer token provided");
      return null;
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

    // Admin clients have access to everything
    if (client.permissions === "admin") return true;

    // Protected clients have access to protected and public resources
    if (client.permissions === "protected") {
      return requiredLevel === "protected" || requiredLevel === "public";
    }

    // Public clients only have access to public resources
    if (client.permissions === "public") {
      return requiredLevel === "public";
    }

    return false;
  }

  /**
   * Register a new API key
   * @param key The API key
   * @param client The client information
   */
  registerApiKey(key: string, client: AuthenticatedClient): void {
    this.apiKeys.registerKey(key, client);
  }

  /**
   * Disable an API key
   * @param key The API key to disable
   */
  disableApiKey(key: string): boolean {
    return this.apiKeys.disableKey(key);
  }
}

// Export a singleton instance of the auth service
export const authService = new AuthService();
