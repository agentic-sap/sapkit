// Mock reviewer: non-JSON stdout -> verdict.evaluate() classifies MALFORMED.
process.stdout.write('this is not JSON output at all');
