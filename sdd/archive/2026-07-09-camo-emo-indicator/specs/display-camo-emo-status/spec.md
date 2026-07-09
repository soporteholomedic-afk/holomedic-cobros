# Specification: Display CAMO/EMO Status

## Requirement Strength
The key assertions in this document use RFC 2119 keywords (MUST, SHALL, SHOULD).

## Requirements
- The system MUST display a "Documentos" column in the worker results list table.
- When document status is unchecked or absent, badges for "CAMO" and "EMO" MUST be rendered in a neutral gray color.
- When CAMO is verified as present, the "CAMO" badge MUST be rendered in green.
- When EMO is verified as present, the "EMO" badge MUST be rendered in violet.
- If checking a row's documents fails, the row MUST display an inline retry indicator next to the failed status.

## Scenarios

### Scenario 1: Initial state before verification
Given the worker results list has loaded
When document status check has not yet run
Then the "CAMO" and "EMO" badges MUST display in neutral gray.

### Scenario 2: Verified documents present
Given the document verification check completes successfully
When both CAMO and EMO files exist for a patient row
Then the "CAMO" badge MUST be green and the "EMO" badge MUST be violet.

### Scenario 3: Checking fails for a row
Given a document verification fails for a specific row
When the failure occurs
Then the column MUST display an error status
And it MUST display a retry indicator next to the error.
