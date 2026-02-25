import { execFile } from "node:child_process";
import { z } from "zod";

const fetchBlueprintInputSchema = z.object({
  apiName: z.string().trim().min(1, "apiName is required")
});

const blueprintOutputSchema = z.string().min(1, "Apiary CLI returned empty blueprint");

const apiaryRestApiResponseSchema = z.object({
  apis: z.array(
    z.object({
      apiName: z.string(),
      apiSubdomain: z.string(),
      apiDocumentationUrl: z.string().optional(),
      apiIsPrivate: z.boolean().optional(),
      apiIsPublic: z.boolean().optional(),
      apiIsTeam: z.boolean().optional(),
      apiIsPersonal: z.boolean().optional()
    })
  )
});

type ApiaryApiItem = {
  name: string;
  subdomain: string;
};

export class ApiaryError extends Error {
  public readonly stderr?: string;
  public readonly args: readonly string[];

  public constructor(message: string, args: readonly string[], stderr?: string) {
    super(message);
    this.name = "ApiaryError";
    this.stderr = stderr;
    this.args = args;
  }

  public static from(error: unknown, args: readonly string[], stderr?: string): ApiaryError {
    if (error instanceof ApiaryError) {
      return error;
    }

    if (error instanceof Error) {
      return new ApiaryError(error.message, args, stderr);
    }

    return new ApiaryError("Apiary CLI command failed", args, stderr);
  }
}

export class ApiaryService {
  private static resolveCliPath(): string {
    const configuredPath = process.env.APIARY_CLI_PATH;
    if (configuredPath && configuredPath.trim().length > 0) {
      return configuredPath.trim();
    }

    return "apiary";
  }

  private static async runCommand(
    args: string[],
    options: { allowEmptyOutput?: boolean } = {}
  ): Promise<string> {
    const cliPath = ApiaryService.resolveCliPath();

    return new Promise((resolve, reject) => {
      execFile(
        cliPath,
        args,
        {
          encoding: "utf-8",
          env: { ...process.env },
          maxBuffer: 10 * 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(ApiaryError.from(error, args, typeof stderr === "string" ? stderr : undefined));
            return;
          }

          const output = typeof stdout === "string" ? stdout : "";

          if (!options.allowEmptyOutput && output.trim().length === 0) {
            reject(new ApiaryError("Apiary CLI returned empty output", args, typeof stderr === "string" ? stderr : undefined));
            return;
          }

          resolve(output);
        }
      );
    });
  }

  public static async fetchBlueprint(apiName: string): Promise<string> {
    const { apiName: validatedApiName } = fetchBlueprintInputSchema.parse({ apiName });
    const rawBlueprint = await ApiaryService.runCommand(["fetch", "--api-name", validatedApiName]);
    return blueprintOutputSchema.parse(rawBlueprint);
  }

  public static async listApis(): Promise<string[]> {
    const apiKey = process.env.APIARY_API_KEY;
    
    if (!apiKey || apiKey.trim().length === 0) {
      throw new ApiaryError(
        "APIARY_API_KEY environment variable is required to list APIs",
        ["REST", "GET", "/me/apis"]
      );
    }

    const apis = await ApiaryService.listApisViaRest(apiKey.trim());
    return apis.map((api) => `${api.name} (${api.subdomain})`);
  }

  private static async listApisViaRest(apiKey: string): Promise<ApiaryApiItem[]> {
    const response = await fetch("https://api.apiary.io/me/apis", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new ApiaryError(
        `Apiary REST API returned ${response.status}: ${response.statusText}`,
        ["REST", "GET", "/me/apis"]
      );
    }

    const rawData = await response.json();
    const data = apiaryRestApiResponseSchema.parse(rawData);

    if (data.apis.length === 0) {
      return [];
    }

    return data.apis.map((api) => ({
      name: api.apiName,
      subdomain: api.apiSubdomain
    }));
  }
}
