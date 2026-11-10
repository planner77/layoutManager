#!/usr/bin/env python3
"""Record an explicit named reviewer (person or agent) content/policy review."""
import sys

statement = sys.argv[1].strip()
if len(statement) < 12 or len(statement) > 240 or "\n" in statement:
    sys.exit("--docs-review requires reviewer name and a 12-240 character conclusion")
print("DOCS_POLICY_REVIEW_ATTESTED: " + statement)
