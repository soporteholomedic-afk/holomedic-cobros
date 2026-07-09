# Specification: Batch Check Legajos

## Requirement Strength
The key assertions in this document use RFC 2119 keywords (MUST, SHALL, SHOULD).

## Requirements
- The API MUST expose a `POST /api/files/check-legajos` endpoint.
- The request body MUST contain an array of objects, each containing `ruc`, `dni`, and `idAten`.
- The endpoint MUST query document existence for each patient in parallel.
- If a check for a single patient fails, the API MUST capture the error and return it in the payload for that `idAten` without failing the entire request.
- The API MUST return a JSON object mapping `idAten` to its availability status, in the format: `{ [idAten]: { hasCamo: boolean, hasEmo: boolean, error?: string } }`.

## Scenarios

### Scenario 1: Successful check of multiple patients
Given a list of valid patient parameters: `{ ruc, dni, idAten }`
When a POST request is sent to `/api/files/check-legajos`
Then the response MUST return 200 OK
And the payload MUST map each `idAten` to its `hasCamo` and `hasEmo` boolean flags.

### Scenario 2: Error checking a specific patient
Given a list where one check fails due to backend storage latency
When a POST request is sent to `/api/files/check-legajos`
Then the response MUST return 200 OK
And the payload MUST include the error details under the failed `idAten` key
And other successful checks MUST be returned normally.
