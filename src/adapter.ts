// To simplify the response of the /secrets API, we export the secrets as environment variables
export const toExportEnv = (vars: Record<string, string>): string => {
  return Object.entries(vars)
    .map(
      ([key, value]) =>
        `export ${key}='${value
          .replace(/'/g, `\\'`)
          .replace(/\\n/g, "%MANUAL_LINEBREAK%")
          .replace(/\n/g, `\\n`)
          .replace(/%MANUAL_LINEBREAK%/g, `\\\\n`)}'`
    )
    .join("\n");
};
