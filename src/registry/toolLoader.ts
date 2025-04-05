import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";
import { toolRegistry } from "./index";

const loaderLogger = logger.child({ component: "tool-loader" });

/**
 * Register tools from a directory
 * @param dirPath Path to the directory containing tool files
 * @returns Number of tools registered
 */
export const registerToolsFromDirectory = async (
  dirPath: string
): Promise<number> => {
  const basePath = path.resolve(process.cwd(), dirPath);
  loaderLogger.info(`Loading tools from directory: ${basePath}`);

  let count = 0;

  try {
    const loadPromises: Promise<void>[] = [];

    const findToolFiles = (directory: string): void => {
      const files = fs.readdirSync(directory);

      files.forEach((file) => {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          findToolFiles(fullPath);
        } else if (file.endsWith(".ts") || file.endsWith(".js")) {
          if (
            file === "index.ts" ||
            file === "index.js" ||
            file.includes(".test.")
          ) {
            return;
          }

          const loadPromise = import(fullPath)
            .then(() => {
              loaderLogger.debug(`Loaded tool file: ${fullPath}`);
            })
            .catch((error) => {
              loaderLogger.error(
                `Error loading tool file: ${fullPath}`,
                error as Error
              );
            });

          loadPromises.push(loadPromise);
        }
      });
    };

    findToolFiles(basePath);

    await Promise.all(loadPromises);

    count = toolRegistry.getAllTools().length;
    loaderLogger.info(`Registered ${count} tools from directory`);

    return count;
  } catch (error) {
    loaderLogger.error("Error loading tools from directory", error as Error);
    return 0;
  }
};
