import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import { jwtVerify, createRemoteJWKSet } from "jose";
import dotenv from "dotenv";
import { toExportEnv } from "./adapter.js";
dotenv.config({ path: ".env" });

const app = express();
const PORT = process.env.PORT || 3000;

const SECRETS_PATH = "./secrets";

app.use(express.json());
app.set("trust proxy", true); // We want to get the real IP address of the request
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Internal server error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: "Something went wrong. Check the logs for more details.",
  });
});

// GET /secrets endpoint
//
// This endpoint is used by a gitlab runner job to fetch secrets.
//
// The running job is configured by a .gitlab-ci.yml file with
//  a `id_tokens` section (https://docs.gitlab.com/ci/secrets/id_token_authentication/)
//  including the `aud` property (the domain of the GitLab instance) which is used to get the public keys of the GitLab instance
//  through `<aud = https://git.example.com>/.well-known/openid-configuration` and then the `jwks_uri` (`.../oauth/discovery/keys`).
//
// Payload format:
// {
//   "id_token": "eyJraWQiOiJic01....",           // The value of the variable that contains the id_token (id_tokens.<VARIABLE_NAME> in .gitlab-ci.yml)
//   "project_id": "<some-project-ID>"            // (required) this allows to fetch secrets for a specific project
//   "branch_ref": "<$CI_COMMIT_REF_NAME value>"  // (optional) this will fetch secrets for a specific branch
// }
//
// The response is a string of environment variables with `export` for each key/value pair.
//
app.post("/secrets", async (req: Request, res: Response) => {
  // Return and verbose errors, because it might be some malicious request:
  const error = ({ code, message }: { code: number; message: string }) => {
    console.error(
      `[${new Date().toISOString()}][${
        req.ip
      }][ERROR] ${code} - ${message} : ${JSON.stringify(
        req.headers
      )} : ${JSON.stringify(req.body)}`
    );
    return res.status(code).json({ error: message });
  };
  const success = ({ message }: { message: string }) => {
    console.log(
      `[${new Date().toISOString()}][${req.ip}][SUCCESS] ${message}}`
    );
  };
  if (!req.body) {
    return error({ code: 400, message: "Empty payload" });
  }
  if (
    !process.env.ISSUER_URL ||
    !process.env.EXPECTED_AUDIENCE ||
    !process.env.API_TOKEN
  ) {
    return error({
      code: 400,
      message: "Missing one of the env vars. See README.md.",
    });
  }
  if (req.query.apitk !== process.env.API_TOKEN) {
    return error({ code: 401, message: "Invalid API token" });
  }
  const {
    id_token: jwtToken,
    project_id: requestedProjectId,
    branch_ref: requestedBranchRef,
  } = req.body;
  if (!jwtToken || !requestedProjectId) {
    return error({ code: 400, message: "Missing id_token or project_id" });
  }
  if (!fs.existsSync(SECRETS_PATH)) {
    return error({ code: 404, message: "Secrets path not found" });
  }

  let secretsPath = `${SECRETS_PATH}/${requestedProjectId}`;
  const projectPath = `${SECRETS_PATH}/${requestedProjectId}`;
  if (!fs.existsSync(projectPath)) {
    return error({ code: 404, message: "Project secrets not found" });
  }
  if (requestedBranchRef) {
    const branchPath = `${projectPath}/${requestedBranchRef}`;
    secretsPath = branchPath;
    if (!fs.existsSync(branchPath)) {
      return error({ code: 404, message: "Branch secrets not found" });
    }
  }

  // 1. Get the public keys from the GitLab instance
  const publicKeysUrl = `${process.env.ISSUER_URL}/oauth/discovery/keys`;

  // 2. Verify the id_token
  const JWKS = createRemoteJWKSet(new URL(publicKeysUrl), {
    timeoutDuration: 3000,
  });
  try {
    const { payload, protectedHeader } = await jwtVerify(jwtToken, JWKS, {
      issuer: process.env.ISSUER_URL, // Adjust if your issuer is different
      audience: process.env.EXPECTED_AUDIENCE, // Match the `aud` you expect in the token
    });

    // 3. Check if the request payload can access the request project and branch:
    if (!payload.project_id) {
      return error({
        code: 401,
        message: "Authentication failed. Project id is missing.",
      });
    }
    if (+payload.project_id !== +requestedProjectId) {
      return error({ code: 401, message: "Project id mismatch." });
    }
    if (
      (requestedBranchRef && !payload.ref) ||
      (requestedBranchRef && payload.ref !== requestedBranchRef)
    ) {
      return error({ code: 401, message: "Branch ref mismatch." });
    }

    // 4. Return the secrets
    success({
      message: `requested secrets: ${JSON.stringify({
        branchRef: requestedBranchRef,
        projectId: requestedProjectId,
      })} is valid with: ${JSON.stringify({
        issuer: payload.iss,
        audience: payload.aud,
        projectId: payload.project_id,
        branchRef: payload.ref,
        exp: payload.exp,
      })}`,
    });
    const secrets = JSON.parse(
      fs.readFileSync(`${secretsPath}/secrets.json`, "utf8")
    );
    res.send(toExportEnv(secrets));
  } catch (err) {
    if ((err?.toString() as string)?.includes("JWKSTimeout")) {
      return error({
        code: 401,
        message: "Authentication timeout. Can't reach the issuer.",
      });
    }
    if ((err?.toString() as string)?.includes('unexpected "aud" claim value')) {
      return error({
        code: 401,
        message: "Authentication failed. Unexpected aud claim value.",
      });
    }
    if (
      (err?.toString() as string)?.includes(
        '"exp" claim timestamp check failed'
      )
    ) {
      return error({
        code: 401,
        message: "Authentication failed. Expired token.",
      });
    }
    console.error("Token verification failed:", err);
    return error({
      code: 401,
      message: "Authentication failed. Check the logs for more details.",
    });
  }
});

// Start server
app
  .listen(PORT, () => {
    console.log(`Secrets server is running at http://localhost:${PORT}`);
  })
  .on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use.`);
    } else {
      console.error("❌ Server error:", err);
    }
    process.exit(1);
  });
