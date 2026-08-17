# Communication & Workflow
<!-- tier: strict -->

Mail bodies, workflow work items and broadcast records hold PII twice over — once in the content, once in the agent assignments. The block engages at `strict`.

| Table | Description | Why |
|-------|-------------|-----|
| SOOD / SOC3 / SOST / SOFM | SAPoffice / mail storage | PII inside the message body |
| SWWWIHEAD / SWWCONT / SWWLOGHIST | Workflow work item data | Assignees and their task context |
| BCST_SR / BCST_CAM | Broadcast / message records | Content of the communication itself |
