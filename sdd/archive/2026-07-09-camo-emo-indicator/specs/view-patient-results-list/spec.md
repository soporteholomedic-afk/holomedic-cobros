# Delta Specification: View Patient Results List

## Requirement Strength
The key assertions in this document use RFC 2119 keywords (MUST, SHALL, SHOULD).

## Requirements
- The worker results list interface MUST include a "Verificar documentos" button at the table header level.
- Clicking the "Verificar documentos" button MUST trigger a batch verification request for all currently displayed rows.
- The interface MUST NOT trigger the check automatically on page load.
- The interface MUST allow the user to trigger a retry for an individual failed row check.

## Scenarios

### Scenario 1: Verification trigger
Given the worker results list is visible with multiple records
When the user clicks the "Verificar documentos" button
Then the frontend MUST issue a batch request using the loaded rows' metadata
And the status indicators MUST update based on the API response.

### Scenario 2: Retrying a failed check
Given a row shows an inline document check error and a retry trigger
When the user clicks the retry trigger for that specific row
Then the frontend MUST trigger a new verification request specifically for that row's patient parameters.
