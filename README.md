# Secrets during CI jobs in self-hosted Gitlab, without setting them in CI/CD variables

## Prerequisites

- You have a self-hosted Gitlab
- You have CI jobs, for one or several repos and branches, for which you want to get secrets, but without keeping them in CI/CD variables.
- You are able to host a docker service on a VPS or anywhere that your runners can reach.

## Goal

➡️ As we know that storing secrets in CI/CD variables is not secure, we want to be able fetching secrets from a secured API endpoint. We want this endpoint to only accept requests from Gitlab runners jobs (OIDC authentication).

➡️ We gonna expose this `/secrets` API endpoint to Gitlab jobs only, secured with Gitlab public keys and JWT's payload from `id_tokens`. (See "How it works" for more details).

## Configure

- Clone this project where you gonna host it. Note that your git runners have to be able to reach the URL that will host it.
- Create a `.env` file based on `.env.sample`
- Create your secrets files (`secrets.json`) in the `./secrets` sub-directories, for each of your repos (each repo is an directory named with a numeric ID), and optionally for each of your branches

## Start

### Start with Docker and HTTPs

- See _Installation_, and setup the `.env` file that will be mounted in the container
- Copy and adjust docker-compose.yml
- Just run `docker compose up -d`. (And if the `network` does not exist, create it: `docker network create web`)

### Start without Docker (manual)

- See _Installation_, and setup the `.env` file
- Start the project:

```bash
npm ci
npm run build
npm run start
```

- Then, use nginx or any other proxy webserver to host under https the node app.

## Usage (.gitlab-ci.yml example)

Let's say you host this project under `https://<secrets-box-host-domain>` (See _Start_ section).

Let's say you created a CI/CD variable `SECRETS_API_TOKEN` (just to add a security layer above the OIDC authentication) in your Git repo.

Here is what you'd need to write in your .gitlab-ci.yml :

```yml
# Just replace `<secrets-box-host-domain>` with the domain where you host the /secrets API
some_job:
  image: some-image:latest
  id_tokens:
    JOB_ID_TOKEN:
      aud: "https://git.example.com" # Here you have to set the same `aud` than in the `.env` file of the secrets box host.
  variables:
    GIT_STRATEGY: none
  script:
    # You just have to eval the response of `/secrets`, because it returns directly the different `export XXX="..."`
    - >
      eval $(curl -s -X POST https://<secrets-box-host-domain>/secrets?apitk=$SECRETS_API_TOKEN -H "Content-Type: application/json" -H "Accept: text/plain" -d "{\"id_token\": \"$JOB_ID_TOKEN\", \"project_id\": \"$CI_PROJECT_ID\", \"branch_ref\": \"$CI_COMMIT_REF_NAME\"}")
      #
      # We are done !
      # You can now access your secrets:
      #
      echo $ONE_OF_YOUR_SECRET
```

🎉 Everything is ready

## ℹ️ How it works (more details)

- During each of your git jobs, Gitlab creates a variable using the `id_tokens` section in the .gitlab-ci.yml (https://docs.gitlab.com/ci/secrets/id_token_authentication/).
- The variable contains a JWT payload containing all the information of the runner job (time, branch, job author, etc)
- This JWT payload can be verified using the `issuer` (`.env`) and the `/oauth/discovery/keys` public keys from your self-hosted Gitlab.
- This payload contains an expected and valid `aud` (`.env`) which is by default the git allowed domain
- Once the payload is verified and we're sure it's been computed by the issuer (meaning: it comes from your Git runners), we return the secrets from your secrets directories.

We use https://www.npmjs.com/package/jose to verify the JWT payload.