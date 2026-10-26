# Lab (Diagnostic Test) — Desk parity

Screens: `/hmis/lab` (LabWorklist.vue), `/hmis/lab/:name` and `/hmis/lab/new` (LabTest.vue).
Sources read: `diagnostic_test.json`, `.js`, `.py`; `doctor_consultation.py` (`create_diagnostic_tests`, history); `hooks.py` permission hooks.

✅ ported · ➖ not shown in Desk either · ⏳ not ported (reason given)

## Fields (rendered from the doctype meta, Desk's sections and columns)

| Field | Rule in Desk | Vue |
|---|---|---|
| doctor_consultation | Link Doctor Consultation, reqd, in list/standard filter | ✅ editable for writers; Missing Fields check before save |
| patient_name | fetch_from doctor_consultation.patient_name, read_only, title_field | ✅ fetched on pick (server also fills it on save when the user can't read the consultation, as in Desk); page title |
| item | Link Item, reqd, description shown | ✅ with set_query filter (see below); description shown under field |
| item_name | fetch_from item.item_name, read_only | ✅ |
| test_type | Select Lab Test/X-Ray/Scan/Other, reqd | ✅ |
| status | Select Ordered/Sample Collected/Result Entered/Reported/Cancelled, reqd, default Ordered | ✅ dropdown kept (any status, as in Desk) + step buttons |
| ordered_on | Datetime, default Now, read_only | ✅ set to now (Asia/Kolkata) on a new test |
| sample_collected_on | Datetime | ✅ editable; also set by "Mark sample collected" if empty |
| result | Small Text | ✅ |
| normal_range | Data | ✅ |
| result_attachment | Attach | ✅ upload/replace/remove via FormField |
| remarks | Small Text | ✅ |
| reported_by | Link User, read_only | ✅ read-only; filled by server |
| reported_on | Datetime, read_only | ✅ read-only; filled by server |
| Section/column breaks | Status, Result sections; 2 columns | ✅ same layout (unlabelled first section titled "Test") |
| autoname DGT-.YYYY.-.##### | server | ✅ server-side on insert |
| depends_on / mandatory_depends_on / read_only_depends_on | none on this doctype | ➖ |

## Client script (`diagnostic_test.js`)

| Handler | Vue |
|---|---|
| `set_query("item")` → `{ item_type: "Service", is_active: 1 }` | ✅ via `linkFilters('Diagnostic Test','item')` (formEngine FORM_RULES) |

## Server (`diagnostic_test.py`, hooks)

| Behaviour | Vue |
|---|---|
| validate(): first time status = Reported, stamp reported_by/reported_on (once) | ✅ runs on save (frappe.client.insert/save) |
| get_permission_query_conditions: Doctor sees only tests from own consultations | ✅ applies to the worklist (frappe.client.get_list / get_count) |
| has_permission: Doctor only own patients' tests | ✅ applies on open/save; buttons from `metta.api.get_doc_permissions` |
| Roles: System Manager full; Lab Staff create/write (no delete); Doctor read/create | ✅ save bar/step buttons only with write (create on new); Delete only with delete |
| Created from Doctor Consultation "Order Diagnostic Tests" (`create_diagnostic_tests`) | ➖ belongs to the consultation screen, not this module |

## Lab workflow additions (UI only — all just set Desk fields and save)

| Action | Sets | Shown when |
|---|---|---|
| Mark sample collected | status = Sample Collected; sample_collected_on = now if empty | saved status Ordered |
| Save result | status = Result Entered (asks for result or attachment first: "Enter a result or attach the report first.") | saved status Sample Collected |
| Report | status = Reported (server stamps reported_by/on) | saved status Result Entered |
| Cancel test (confirm) | status = Cancelled | saved status Ordered / Sample Collected / Result Entered |
| Save | whatever was edited | unsaved changes |

The step button hides once the Status dropdown is changed by hand, so the user's own choice is what gets saved.

## Context card (read-only)

Patient, age/sex, UHIN, visit, ordering doctor, consultation time; diagnosis and clinical notes only when the user may read the consultation. Comes from new `metta.vue.lab.get_test_context` (checks read on the test, or on the consultation for an unsaved test) because Lab Staff cannot read Doctor Consultation / Patient Visit. Visit and consultation are links only for users who can open them. Not in Desk's form — added to help the lab.

## Deliberate differences

- Worklist sort: DataList always sorts by last updated (newest first) and has no sort prop; "oldest first" for open work is ⏳ — needs a `sort` prop on the shared DataList (outside this module's files). Users can click the "Updated" header to flip to oldest first.
- Worklist tabs per status with counts, 60 s auto refresh (Desk list has status as a standard filter).
- Main action is the next workflow step; Desk only has Save.

## Not ported

| Desk feature | Why |
|---|---|
| Form sidebar: comments, assign, share, tags, attachments list, print, email, version timeline (track_changes) | ⏳ shared app-wide frontend feature, not per module; Desk still has them |
| Import (allow_import) | ⏳ Desk Data Import is used for that |
